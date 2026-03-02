import mongoose, { Schema, Document } from 'mongoose';
import { Flow } from '../schemas/flow.schema';

export interface FlowDocument extends Omit<Flow, '_id'>, Document {}

const BranchSchema = new Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
}, { _id: false });

const NodePositionSchema = new Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
}, { _id: false });

const NodeSchema = new Schema({
  id: { type: String, required: true },
  type: { type: String, required: true },
  label: { type: String, required: true },
  position: { type: NodePositionSchema, required: true },
  data: { type: Schema.Types.Mixed, required: true },
  branches: { type: [BranchSchema], required: true },
}, { _id: false });

const EdgeSchema = new Schema({
  id: { type: String, required: true },
  sourceNodeId: { type: String, required: true },
  sourceBranchKey: { type: String, required: true },
  targetNodeId: { type: String, required: true },
}, { _id: false });

const TriggerConfigSchema = new Schema({
  keywords: { type: [String] },
}, { _id: false });

const FlowSettingsSchema = new Schema({
  timeoutSeconds: { type: Number, default: 300 },
  maxSteps: { type: Number, default: 100 },
  maxConsecutiveLogicSteps: { type: Number, default: 10 },
  fallbackMessage: { type: String, default: 'Sorry, something went wrong. Please try again later.' },
}, { _id: false });

const FlowSchema = new Schema<FlowDocument>({
  orgId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ['draft', 'published', 'archived'], required: true, default: 'draft' },
  version: { type: Number, required: true, default: 1 },
  triggerType: { type: String, enum: ['inbound', 'keyword', 'api'], required: true },
  triggerConfig: { type: TriggerConfigSchema, required: true },
  nodes: { type: [NodeSchema], required: true },
  edges: { type: [EdgeSchema], required: true },
  settings: { type: FlowSettingsSchema, required: true },
  publishedAt: { type: Date },
}, {
  timestamps: true,
});

FlowSchema.index({ orgId: 1, status: 1 });
FlowSchema.index({ 'triggerConfig.keywords': 1 });

export const FlowModel = mongoose.model<FlowDocument>('Flow', FlowSchema);
