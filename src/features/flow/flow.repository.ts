import { PrismaClient, FlowStatus as PrismaFlowStatus } from '@prisma/client';
import { FlowEntity, FlowProperties } from './flow.entity';
import { FlowMapper } from './flow.mapper';
import { NotFoundError } from '../../utils/errors';
import { RequestContext } from '../../utils/request-context';

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

const FLOW_INCLUDE = {
    renudgeConfig: true,
    creator: { select: { name: true, email: true } }
};

export class PrismaFlowRepository implements IFlowRepository {
    constructor(private readonly prisma: PrismaClient) { }

    private isPrismaNotFound(error: unknown): boolean {
        return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2025';
    }

    async create(flow: FlowEntity): Promise<FlowEntity> {
        const userId = RequestContext.getUserId();
        const data = FlowMapper.toPrisma(flow);
        
        // Inject creatorId automatically if not present
        if (userId && !data.creatorId) {
            data.creatorId = userId;
        }

        const created = await this.prisma.flow.create({ 
            data,
            include: FLOW_INCLUDE
        });
        return FlowMapper.toEntity(created);
    }

    async findById(id: string): Promise<FlowEntity | null> {
        const flow = await this.prisma.flow.findUnique({ 
            where: { id },
            include: FLOW_INCLUDE
        });
        if (!flow) return null;
        const enriched = await this.enrichFlowsWithMetrics([flow]);
        return FlowMapper.toEntity(enriched[0]);
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
            include: FLOW_INCLUDE,
            orderBy: { updatedAt: 'desc' },
        });
        const enriched = await this.enrichFlowsWithMetrics(flows);
        return enriched.map(FlowMapper.toEntity);
    }

    private async enrichFlowsWithMetrics(flows: any[]): Promise<any[]> {
        if (flows.length === 0) return [];
        const flowIds = flows.map(f => f.id);

        const campaignStats = await this.prisma.campaignStats.findMany({
            where: {
                campaign: {
                    flowId: { in: flowIds }
                }
            },
            select: {
                total: true,
                campaign: {
                    select: { flowId: true }
                }
            }
        });

        const flowStats = campaignStats.reduce((acc, stat) => {
            const fid = stat.campaign.flowId;
            acc[fid] = (acc[fid] || 0) + stat.total;
            return acc;
        }, {} as Record<string, number>);

        return flows.map(flow => ({
            ...flow,
            executions: flowStats[flow.id] || 0,
            successfulExecutions: 0,
        }));
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
            
            delete data.id;
            delete data.createdAt;
            delete data.updatedAt;

            const renudgeConfig = data.renudgeConfig;
            delete data.renudgeConfig;

            const updated = await this.prisma.flow.update({
                where: { id },
                data: {
                    ...data,
                    ...(data.nodes ? { nodes: data.nodes } : {}),
                    ...(renudgeConfig ? {
                        renudgeConfig: {
                            upsert: {
                                create: {
                                    enabled: renudgeConfig.enabled,
                                    durationMinutes: renudgeConfig.durationMinutes,
                                    maxAttempts: renudgeConfig.maxAttempts,
                                    message: renudgeConfig.message,
                                    buttons: renudgeConfig.buttons as any,
                                },
                                update: {
                                    enabled: renudgeConfig.enabled,
                                    durationMinutes: renudgeConfig.durationMinutes,
                                    maxAttempts: renudgeConfig.maxAttempts,
                                    message: renudgeConfig.message,
                                    buttons: renudgeConfig.buttons as any,
                                }
                            }
                        }
                    } : {})
                },
                include: FLOW_INCLUDE
            });

            return FlowMapper.toEntity(updated);
        } catch (error: unknown) {
            if (this.isPrismaNotFound(error)) {
                throw new NotFoundError('Flow', id);
            }
            throw error;
        }
    }

    async delete(id: string): Promise<void> {
        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.chatSession.deleteMany({ where: { flowId: id } });
                const campaigns = await tx.campaign.findMany({ where: { flowId: id } });
                for (const campaign of campaigns) {
                    const versions = await tx.campaignVersion.findMany({ where: { campaignId: campaign.id } });
                    for (const version of versions) {
                        await tx.campaignRecipient.deleteMany({ where: { campaignVersionId: version.id } });
                    }
                    await tx.campaignVersion.deleteMany({ where: { campaignId: campaign.id } });
                    await tx.campaignStats.deleteMany({ where: { campaignId: campaign.id } });
                }
                await tx.campaign.deleteMany({ where: { flowId: id } });
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
        return this.prisma.flowTranslation.findUnique({
            where: {
                flowId_language: { flowId, language },
            },
        });
    }

    async saveTranslation(flowId: string, language: string, translatedData: any): Promise<void> {
        await this.prisma.flowTranslation.upsert({
            where: { flowId_language: { flowId, language } },
            update: { translatedData },
            create: { flowId, language, translatedData },
        });
    }
}
