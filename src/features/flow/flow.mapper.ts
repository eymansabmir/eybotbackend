import { Flow as PrismaFlow, FlowStatus as PrismaFlowStatus } from '@prisma/client';
import { FlowEntity } from './flow.entity';

export class FlowMapper {
    public static toEntity(prismaFlow: PrismaFlow): FlowEntity {
        return new FlowEntity({
            id: prismaFlow.id,
            orgId: prismaFlow.orgId,
            name: prismaFlow.name,
            description: prismaFlow.description ?? undefined,
            status: prismaFlow.status as any, // Enum mapping
            version: prismaFlow.version,
            triggerType: prismaFlow.triggerType as any,
            triggerConfig: prismaFlow.triggerConfig as any,
            nodes: prismaFlow.nodes as any,
            edges: prismaFlow.edges as any,
            settings: prismaFlow.settings as any,
            publishedAt: prismaFlow.publishedAt ?? undefined,
            createdAt: prismaFlow.createdAt,
            updatedAt: prismaFlow.updatedAt,
        });
    }

    public static toPrisma(entity: FlowEntity): any {
        const json = entity.toJSON();
        const { id, ...data } = json;

        return {
            ...(id ? { id } : {}),
            orgId: data.orgId,
            name: data.name,
            description: data.description ?? null,
            status: data.status as PrismaFlowStatus,
            version: data.version,
            triggerType: data.triggerType,
            triggerConfig: data.triggerConfig as any,
            nodes: data.nodes as any,
            edges: data.edges as any,
            settings: data.settings as any,
            publishedAt: data.publishedAt ?? null,
        };
    }
}
