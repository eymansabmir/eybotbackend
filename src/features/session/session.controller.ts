import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ISessionService } from './session.service';
import { SessionEntity } from './session.entity';
import { ValidationError } from '../../utils/errors';

/** Map entity → wire format matching the old Mongoose response shape. */
function toSessionResponse(session: SessionEntity) {
  return {
    _id: session.id,
    ...session.toJSON(),
  };
}

const StartFlowBodySchema = z.object({
  orgId: z.string().min(1),
  flowId: z.string().min(1),
  waId: z.string().min(1),
  waBusinessNumber: z.string().min(1),
  contactName: z.string().optional(),
  initialVariables: z.record(z.any()).optional(),
});

const ResumeFlowBodySchema = z.object({
  userInput: z.string().min(1),
});

export class SessionController {
  constructor(private readonly sessionService: ISessionService) {}

  startFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = StartFlowBodySchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const { orgId, flowId, waId, waBusinessNumber, contactName, initialVariables } = parsed.data;
      const { session, result } = await this.sessionService.startSession({
        orgId, flowId, waId, waBusinessNumber,
        ...(contactName !== undefined ? { contactName } : {}),
        ...(initialVariables !== undefined ? { initialVariables: initialVariables as Record<string, unknown> } : {}),
      });
      res.status(201).json({
        session,
        outboundMessages: result.outboundMessages,
        isFinished: result.isFinished,
        ...(result.waitingFor !== undefined ? { waitingFor: result.waitingFor } : {}),
      });
    } catch (err) { next(err); }
  };

  resumeFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params['sessionId'] as string;
      if (!sessionId) throw new ValidationError('sessionId param is required');
      const parsed = ResumeFlowBodySchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const { session, result } = await this.sessionService.resumeSession(sessionId, parsed.data.userInput);
      res.status(200).json({
        session: toSessionResponse(session),
        outboundMessages: result.outboundMessages,
        isFinished: result.isFinished,
        ...(result.waitingFor !== undefined ? { waitingFor: result.waitingFor } : {}),
      });
    } catch (err) { next(err); }
  };

  getSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params['sessionId'] as string;
      if (!sessionId) throw new ValidationError('sessionId param is required');
      const session = await this.sessionService.getSession(sessionId);
      res.status(200).json(toSessionResponse(session));
    } catch (err) { next(err); }
  };
}
