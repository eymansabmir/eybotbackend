import { FlowModel, FlowDocument } from '../models/flow.model';
import { Flow, FlowStatus } from '../schemas/flow.schema';
import { NotFoundError } from '../utils/errors';

export interface IFlowRepository {
  create(flow: Flow): Promise<FlowDocument>;
  findById(id: string): Promise<FlowDocument | null>;
  findByIdOrFail(id: string): Promise<FlowDocument>;
  findByOrgId(orgId: string, status?: FlowStatus): Promise<FlowDocument[]>;
  findPublishedByKeyword(keyword: string): Promise<FlowDocument | null>;
  findPublishedByOrgAndKeyword(orgId: string, keyword: string): Promise<FlowDocument | null>;
  update(id: string, updates: Partial<Flow>): Promise<FlowDocument>;
  delete(id: string): Promise<void>;
}

export class FlowRepository implements IFlowRepository {
  async create(flow: Flow): Promise<FlowDocument> {
    const document = new FlowModel(flow);
    return await document.save();
  }

  async findById(id: string): Promise<FlowDocument | null> {
    return await FlowModel.findById(id).exec();
  }

  async findByIdOrFail(id: string): Promise<FlowDocument> {
    const flow = await this.findById(id);
    if (!flow) {
      throw new NotFoundError('Flow', id);
    }
    return flow;
  }

  async findByOrgId(orgId: string, status?: FlowStatus): Promise<FlowDocument[]> {
    const query: any = { orgId };
    if (status) {
      query.status = status;
    }
    return await FlowModel.find(query).sort({ updatedAt: -1 }).exec();
  }

  async findPublishedByKeyword(keyword: string): Promise<FlowDocument | null> {
    return await FlowModel.findOne({
      status: 'published',
      'triggerConfig.keywords': keyword.toLowerCase(),
    }).exec();
  }

  async findPublishedByOrgAndKeyword(orgId: string, keyword: string): Promise<FlowDocument | null> {
    return await FlowModel.findOne({
      orgId,
      status: 'published',
      'triggerConfig.keywords': keyword.toLowerCase(),
    }).exec();
  }

  async update(id: string, updates: Partial<Flow>): Promise<FlowDocument> {
    const flow = await FlowModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).exec();

    if (!flow) {
      throw new NotFoundError('Flow', id);
    }

    return flow;
  }

  async delete(id: string): Promise<void> {
    const result = await FlowModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundError('Flow', id);
    }
  }
}
