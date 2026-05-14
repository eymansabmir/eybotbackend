import { ChatSession as PrismaSession, SessionStatus as PrismaSessionStatus } from '@prisma/client';
import { SessionEntity, WaitingFor } from './session.entity';

export class SessionMapper {
    public static toEntity(prismaSession: PrismaSession): SessionEntity {
        let waitingFor: WaitingFor | undefined = undefined;

        if (prismaSession.waitingFor) {
            const wf = prismaSession.waitingFor as any;
            waitingFor = {
                ...wf,
                since: new Date(wf.since),
                timeoutAt: new Date(wf.timeoutAt),
            };
        }

        return new SessionEntity({
            id: prismaSession.id,
            flowId: prismaSession.flowId,
            flowVersion: prismaSession.flowVersion,
            contactId: prismaSession.contactId ?? undefined,
            waId: prismaSession.waId,
            waBusinessNumber: prismaSession.waBusinessNumber,
            status: prismaSession.status as any,
            currentNodeId: prismaSession.currentNodeId,
            variables: (prismaSession.variables as any) ?? {},
            history: (prismaSession.history as any) ?? [],
            waitingFor,
            returnMark: (prismaSession.returnMark as any) ?? undefined,
            flowStack: (prismaSession.flowStack as any) ?? [],
            isCurrent: prismaSession.isCurrent,
            renudgeAttempts: prismaSession.renudgeAttempts,
            lastRenudgeAt: prismaSession.lastRenudgeAt ?? undefined,
            createdAt: prismaSession.createdAt,
            updatedAt: prismaSession.updatedAt,
        });
    }

    public static toPrisma(entity: SessionEntity): any {
        const json = entity.toJSON();
        const { id, ...data } = json;

        return {
            ...(id ? { id } : {}),
            flowId: data.flowId,
            flowVersion: data.flowVersion,
            ...(data.contactId !== undefined ? { contactId: data.contactId } : {}),
            waId: data.waId,
            waBusinessNumber: data.waBusinessNumber,
            status: data.status as PrismaSessionStatus,
            currentNodeId: data.currentNodeId,
            variables: data.variables ?? {},
            history: data.history ?? [],
            waitingFor: data.waitingFor ?? null,
            returnMark: data.returnMark ?? null,
            flowStack: data.flowStack ?? [],
            isCurrent: data.isCurrent,
            renudgeAttempts: data.renudgeAttempts,
            lastRenudgeAt: data.lastRenudgeAt ?? null,
        };
    }
}
