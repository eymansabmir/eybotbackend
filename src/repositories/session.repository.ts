import { SessionModel, SessionDocument } from '../models/session.model';
import { Session, SessionStatus } from '../schemas/session.schema';
import { NotFoundError } from '../utils/errors';

export interface ISessionRepository {
  create(session: Session): Promise<SessionDocument>;
  findById(id: string): Promise<SessionDocument | null>;
  findByIdOrFail(id: string): Promise<SessionDocument>;
  findActiveByWaId(waId: string): Promise<SessionDocument | null>;
  findByFlowId(flowId: string, status?: SessionStatus): Promise<SessionDocument[]>;
  findByStatus(status: SessionStatus): Promise<SessionDocument[]>;
  findTimedOut(): Promise<SessionDocument[]>;
  findCurrentByWhatsApp(waBusinessNumber: string, waId: string): Promise<SessionDocument | null>;
  clearCurrentFlags(waBusinessNumber: string, waId: string): Promise<void>;
  update(id: string, updates: Partial<Session>): Promise<SessionDocument>;
  updateStatus(id: string, status: SessionStatus): Promise<SessionDocument>;
  delete(id: string): Promise<void>;
}

export class SessionRepository implements ISessionRepository {
  async create(session: Session): Promise<SessionDocument> {
    const document = new SessionModel(session);
    return await document.save();
  }

  async findById(id: string): Promise<SessionDocument | null> {
    return await SessionModel.findById(id).exec();
  }

  async findByIdOrFail(id: string): Promise<SessionDocument> {
    const session = await this.findById(id);
    if (!session) {
      throw new NotFoundError('Session', id);
    }
    return session;
  }

  async findActiveByWaId(waId: string): Promise<SessionDocument | null> {
    return await SessionModel.findOne({
      waId,
      status: { $in: ['active', 'waiting'] },
    })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async findByFlowId(flowId: string, status?: SessionStatus): Promise<SessionDocument[]> {
    const query: any = { flowId };
    if (status) {
      query.status = status;
    }
    return await SessionModel.find(query).sort({ updatedAt: -1 }).exec();
  }

  async update(id: string, updates: Partial<Session>): Promise<SessionDocument> {
    const session = await SessionModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).exec();

    if (!session) {
      throw new NotFoundError('Session', id);
    }

    return session;
  }

  async findByStatus(status: SessionStatus): Promise<SessionDocument[]> {
    return await SessionModel.find({ status }).exec();
  }

  async findTimedOut(): Promise<SessionDocument[]> {
    return await SessionModel.find({
      status: 'waiting',
      'waitingFor.timeoutAt': { $lte: new Date() },
    }).exec();
  }

  async findCurrentByWhatsApp(waBusinessNumber: string, waId: string): Promise<SessionDocument | null> {
    return await SessionModel.findOne({
      waBusinessNumber,
      waId,
      isCurrent: true,
      status: { $in: ['active', 'waiting'] },
    })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async clearCurrentFlags(waBusinessNumber: string, waId: string): Promise<void> {
    await SessionModel.updateMany({ waBusinessNumber, waId, isCurrent: true }, { $set: { isCurrent: false } }).exec();
  }

  async updateStatus(id: string, status: SessionStatus): Promise<SessionDocument> {
    return await this.update(id, { status });
  }

  async delete(id: string): Promise<void> {
    const result = await SessionModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundError('Session', id);
    }
  }
}
