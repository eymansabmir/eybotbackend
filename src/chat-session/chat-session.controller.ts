import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { IFlowOrchestrator } from './flow-orchestrator.interface';
import { IContactService } from '../services/contact.service';
import { IWhatsAppSender } from '../services/whatsapp-sender.service';
import { ValidationError } from '../utils/errors';
import { normalizeWaId } from '../utils/whatsapp';

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

export class ChatSessionController {
  constructor(
    private readonly orchestrator: IFlowOrchestrator,
    private readonly contactService: IContactService,
    private readonly whatsappSender: IWhatsAppSender,
  ) {}

  startFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = StartFlowBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.message);
      }

      const { orgId, flowId, waId, waBusinessNumber, contactName, initialVariables } = parsed.data;
      const normalizedWaId = normalizeWaId(waId);

      // Find or create contact by waId
      const contact = await this.contactService.getOrCreateContactByWaId(orgId, normalizedWaId, contactName);

      const result = await this.orchestrator.startFlow({
        orgId,
        flowId,
        contactId: String(contact._id),
        waId: normalizedWaId,
        waBusinessNumber,
        initialVariables: initialVariables ?? {},
      });

      // Send outbound messages to WhatsApp immediately
      if (result.outboundMessages.length > 0) {
        await this.whatsappSender.sendMessages(
          normalizedWaId,
          result.outboundMessages,
          String(result.session._id)
        );
      }

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  resumeFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = String(req.params['sessionId']);
      if (!sessionId) {
        throw new ValidationError('sessionId param is required');
      }

      const parsed = ResumeFlowBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.message);
      }

      const result = await this.orchestrator.resumeFlow({
        sessionId,
        userInput: parsed.data.userInput,
      });

      // Get session to retrieve waId for sending messages
      const session = await this.orchestrator.getSessionById(sessionId);
      if (result.outboundMessages.length > 0 && session) {
        await this.whatsappSender.sendMessages(
          session.waId,
          result.outboundMessages,
          sessionId
        );
      }

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = String(req.params['sessionId']);
      if (!sessionId) {
        throw new ValidationError('sessionId param is required');
      }

      const session = await this.orchestrator.getSessionById(sessionId);
      res.status(200).json(session);
    } catch (err) {
      next(err);
    }
  };
}
