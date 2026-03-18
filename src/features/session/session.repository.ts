import { PrismaClient, SessionStatus as PrismaSessionStatus } from '@prisma/client';
import { SessionEntity, SessionStatus, SessionProperties } from './session.entity';
import { SessionMapper } from './session.mapper';
import { NotFoundError } from '../../utils/errors';

export interface ISessionRepository {
    create(session: SessionEntity): Promise<SessionEntity>;
    findById(id: string): Promise<SessionEntity | null>;
    findByIdOrFail(id: string): Promise<SessionEntity>;
    findActiveByWaId(waId: string): Promise<SessionEntity | null>;
    findByFlowId(flowId: string, status?: SessionStatus): Promise<SessionEntity[]>;
    findByStatus(status: SessionStatus): Promise<SessionEntity[]>;
    findTimedOut(): Promise<SessionEntity[]>;
    findCurrentByWhatsApp(waBusinessNumber: string, waId: string): Promise<SessionEntity | null>;
    clearCurrentFlags(waBusinessNumber: string, waId: string): Promise<void>;
    update(id: string, updates: Partial<SessionProperties>): Promise<SessionEntity>;
    updateStatus(id: string, status: SessionStatus): Promise<SessionEntity>;
    delete(id: string): Promise<void>;
}

export class PrismaSessionRepository implements ISessionRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async create(session: SessionEntity): Promise<SessionEntity> {
        const data = SessionMapper.toPrisma(session);
        const created = await this.prisma.chatSession.create({ data });
        return SessionMapper.toEntity(created);
    }

    async findById(id: string): Promise<SessionEntity | null> {
        const session = await this.prisma.chatSession.findUnique({ where: { id } });
        if (!session) return null;
        return SessionMapper.toEntity(session);
    }

    async findByIdOrFail(id: string): Promise<SessionEntity> {
        const session = await this.findById(id);
        if (!session) {
            throw new NotFoundError('Session', id);
        }
        return session;
    }

    async findActiveByWaId(waId: string): Promise<SessionEntity | null> {
        const session = await this.prisma.chatSession.findFirst({
            where: {
                waId,
                status: { in: ['active', 'waiting'] as PrismaSessionStatus[] },
            },
            orderBy: { updatedAt: 'desc' },
        });
        if (!session) return null;
        return SessionMapper.toEntity(session);
    }

    async findByFlowId(flowId: string, status?: SessionStatus): Promise<SessionEntity[]> {
        const where: any = { flowId };
        if (status) {
            where.status = status as PrismaSessionStatus;
        }
        const sessions = await this.prisma.chatSession.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
        });
        return sessions.map(SessionMapper.toEntity);
    }

    async findByStatus(status: SessionStatus): Promise<SessionEntity[]> {
        const sessions = await this.prisma.chatSession.findMany({
            where: { status: status as PrismaSessionStatus },
        });
        return sessions.map(SessionMapper.toEntity);
    }

    async findTimedOut(): Promise<SessionEntity[]> {
        const sessions = await this.prisma.chatSession.findMany({
            where: {
                status: 'waiting' as PrismaSessionStatus,
            }
        });

        const now = new Date();
        const timedOut = sessions.filter(s => {
            const wf = s.waitingFor as any;
            if (wf && wf.timeoutAt) {
                const timeoutAt = new Date(wf.timeoutAt);
                return timeoutAt <= now;
            }
            return false;
        });

        return timedOut.map(SessionMapper.toEntity);
    }

    async findCurrentByWhatsApp(waBusinessNumber: string, waId: string): Promise<SessionEntity | null> {
        const session = await this.prisma.chatSession.findFirst({
            where: {
                waBusinessNumber,
                waId,
                isCurrent: true,
                status: { in: ['active', 'waiting'] as PrismaSessionStatus[] },
            },
            orderBy: { updatedAt: 'desc' },
        });
        if (!session) return null;
        return SessionMapper.toEntity(session);
    }

    async clearCurrentFlags(waBusinessNumber: string, waId: string): Promise<void> {
        await this.prisma.chatSession.updateMany({
            where: {
                waBusinessNumber,
                waId,
                isCurrent: true,
            },
            data: {
                isCurrent: false,
            },
        });
    }

    async update(id: string, updates: Partial<SessionProperties>): Promise<SessionEntity> {
        try {
            const data: any = { ...updates };
            delete data.id;
            delete data.createdAt;
            delete data.updatedAt;

            const updated = await this.prisma.chatSession.update({
                where: { id },
                data,
            });
            return SessionMapper.toEntity(updated);
        } catch (error: any) {
            if (error.code === 'P2025') {
                throw new NotFoundError('Session', id);
            }
            throw error;
        }
    }

    async updateStatus(id: string, status: SessionStatus): Promise<SessionEntity> {
        return this.update(id, { status });
    }

    async delete(id: string): Promise<void> {
        try {
            await this.prisma.chatSession.delete({ where: { id } });
        } catch (error: any) {
            if (error.code === 'P2025') {
                throw new NotFoundError('Session', id);
            }
            throw error;
        }
    }
}

