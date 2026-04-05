import { PrismaClient, FlowStatus as PrismaFlowStatus } from '@prisma/client';
import { FlowEntity, FlowProperties } from './flow.entity';
import { FlowMapper } from './flow.mapper';
import { NotFoundError } from '../../utils/errors';

export interface IFlowRepository {
    create(flow: FlowEntity): Promise<FlowEntity>;
    findById(id: string): Promise<FlowEntity | null>;
    findByIdOrFail(id: string): Promise<FlowEntity>;
    findByOrgId(orgId: string, status?: string): Promise<FlowEntity[]>;
    findPublishedByKeyword(keyword: string): Promise<FlowEntity | null>;
    findPublishedByOrgAndKeyword(orgId: string, keyword: string): Promise<FlowEntity | null>;
    update(id: string, updates: Partial<FlowProperties>): Promise<FlowEntity>;
    delete(id: string): Promise<void>;
    getTranslation(flowId: string, language: string): Promise<any>;
    saveTranslation(flowId: string, language: string, translatedData: any): Promise<void>;
}

export class PrismaFlowRepository implements IFlowRepository {
    constructor(private readonly prisma: PrismaClient) { }

    private isPrismaNotFound(error: unknown): boolean {
        return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2025';
    }

    async create(flow: FlowEntity): Promise<FlowEntity> {
        const data = FlowMapper.toPrisma(flow);
        const created = await this.prisma.flow.create({ data });
        return FlowMapper.toEntity(created);
    }

    async findById(id: string): Promise<FlowEntity | null> {
        const flow = await this.prisma.flow.findUnique({ where: { id } });
        if (!flow) return null;
        return FlowMapper.toEntity(flow);
    }

    async findByIdOrFail(id: string): Promise<FlowEntity> {
        const flow = await this.findById(id);
        if (!flow) {
            throw new NotFoundError('Flow', id);
        }
        return flow;
    }

    async findByOrgId(orgId: string, status?: PrismaFlowStatus): Promise<FlowEntity[]> {
        const where: any = { orgId };
        if (status) {
            where.status = status;
        }
        const flows = await this.prisma.flow.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
        });
        return flows.map(FlowMapper.toEntity);
    }

    async findPublishedByKeyword(keyword: string): Promise<FlowEntity | null> {
        const flows = await this.prisma.flow.findMany({
            where: {
                status: PrismaFlowStatus.published,
                triggerConfig: {
                    path: ['keywords'],
                    array_contains: keyword.toLowerCase(),
                },
            },
        });

        if (flows.length === 0) return null;
        return FlowMapper.toEntity(flows[0]!);
    }

    async findPublishedByOrgAndKeyword(orgId: string, keyword: string): Promise<FlowEntity | null> {
        const flows = await this.prisma.flow.findMany({
            where: {
                orgId,
                status: PrismaFlowStatus.published,
                triggerConfig: {
                    path: ['keywords'],
                    array_contains: keyword.toLowerCase(),
                },
            },
        });

        if (flows.length === 0) return null;
        return FlowMapper.toEntity(flows[0]!);
    }

    async update(id: string, updates: Partial<FlowProperties>): Promise<FlowEntity> {
        try {
            const data: any = { ...updates };
            // Remove fields that shouldn't be mapped directly or need special handling
            delete data.id;
            delete data.createdAt;
            delete data.updatedAt;

            const updated = await this.prisma.flow.update({
                where: { id },
                data,
            });
            return FlowMapper.toEntity(updated);
        } catch (error: unknown) {
            // Prisma P2025 is RecordNotFound
            if (this.isPrismaNotFound(error)) {
                throw new NotFoundError('Flow', id);
            }
            throw error;
        }
    }

    async delete(id: string): Promise<void> {
        try {
            await this.prisma.$transaction(async (tx) => {
                // Manual cleanup of loose relations as per "current schema structure"
                
                // 1. Delete associated ChatSessions
                await tx.chatSession.deleteMany({ where: { flowId: id } });

                // 2. Resolve and delete associated Campaigns and their nested dependencies
                const campaigns = await tx.campaign.findMany({ where: { flowId: id } });
                for (const campaign of campaigns) {
                    const versions = await tx.campaignVersion.findMany({ where: { campaignId: campaign.id } });
                    
                    for (const version of versions) {
                        // Delete recipients for each version
                        await tx.campaignRecipient.deleteMany({ where: { campaignVersionId: version.id } });
                    }
                    
                    // Delete versions, stats, and then the campaign itself
                    await tx.campaignVersion.deleteMany({ where: { campaignId: campaign.id } });
                    
                    // stats is a 1:1 relation potentially, check existence if needed
                    await tx.campaignStats.deleteMany({ where: { campaignId: campaign.id } });
                }
                await tx.campaign.deleteMany({ where: { flowId: id } });

                // 3. Delete the Flow itself (Translations will cascade via schema relation)
                await tx.flow.delete({ where: { id } });
            });
        } catch (error: unknown) {
            if (this.isPrismaNotFound(error)) {
                throw new NotFoundError('Flow', id);
            }
            throw error;
        }
    }

    async getTranslation(flowId: string, language: string): Promise<any> {
        logger.debug({ flowId, language, operation: 'flowTranslation.findUnique' }, 'STEP 4: DB query');
        return this.prisma.flowTranslation.findUnique({
            where: {
                flowId_language: { flowId, language },
            },
        });
    }

    async saveTranslation(flowId: string, language: string, translatedData: any): Promise<void> {
        logger.debug({ flowId, language, operation: 'flowTranslation.upsert' }, 'STEP 4: DB query');
        await this.prisma.flowTranslation.upsert({
            where: { flowId_language: { flowId, language } },
            update: { translatedData },
            create: { flowId, language, translatedData },
        });
    }
}

