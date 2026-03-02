import mongoose, { Schema, Document } from 'mongoose';
import { Session } from '../schemas/session.schema';

export interface SessionDocument extends Omit<Session, '_id'>, Document {}

const SessionHistoryStepSchema = new Schema({
  nodeId: { type: String, required: true },
  nodeType: { type: String, required: true },
  enteredAt: { type: Date, required: true },
  exitedAt: { type: Date },
  branchTaken: { type: String },
  userInput: { type: String },
}, { _id: false });

const SessionSchema = new Schema<SessionDocument>({
  flowId: { type: String, required: true, index: true },
  flowVersion: { type: Number, required: true },
  contactId: { type: String, required: true, index: true },
  waId: { type: String, required: true, index: true },
  waBusinessNumber: { type: String, required: true, index: true },
  status: {
    type: String,
    enum: ['active', 'waiting', 'completed', 'timed_out', 'error'],
    required: true,
    default: 'active',
  },
  currentNodeId: { type: String, required: true },
  variables: { type: Schema.Types.Mixed, default: {} },
  history: { type: [SessionHistoryStepSchema], default: [] },
  waitingFor: { type: Schema.Types.Mixed },
  isCurrent: { type: Boolean, default: true, index: true },
}, {
  timestamps: true,
});

SessionSchema.index({ waId: 1, status: 1 });
SessionSchema.index({ flowId: 1, status: 1 });
SessionSchema.index({ 'waitingFor.timeoutAt': 1 }, { sparse: true });
SessionSchema.index({ waBusinessNumber: 1, waId: 1, isCurrent: 1 });

export const SessionModel = mongoose.model<SessionDocument>('Session', SessionSchema);
