import { IFlowRepository } from '../repositories/flow.repository';
import { IContactService } from './contact.service';
import { ISessionRepository } from '../repositories/session.repository';
import { IFlowOrchestrator } from '../chat-session/flow-orchestrator.interface';
import { OrchestratorResult } from '../chat-session/types';
import { ValidationError } from '../utils/errors';
import { ContactDocument } from '../models/contact.model';

interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        contacts?: Array<{ wa_id?: string }>;
        messages?: WhatsAppMessage[];
      };
    }>;
  }>;
}

interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { title?: string; id?: string };
    list_reply?: { title?: string; id?: string };
  };
}

interface ExtractedMessage {
  waId: string;
  waBusinessNumber: string;
  text: string;
}

export class WhatsAppWebhookService {
  constructor(
    private readonly flowRepository: IFlowRepository,
    private readonly contactService: IContactService,
    private readonly sessionRepository: ISessionRepository,
    private readonly flowOrchestrator: IFlowOrchestrator,
  ) {}

  async handleIncomingMessage(orgId: string, payload: WhatsAppWebhookPayload): Promise<OrchestratorResult | null> {
    const message = this.extractMessage(payload);
    if (!message) {
      return null;
    }

    const { waId, waBusinessNumber, text } = message;
    const normalized = text.trim();
    if (!normalized) {
      return null;
    }

    const contact = await this.ensureContact(orgId, waId);
    const activeSession = await this.sessionRepository.findCurrentByWhatsApp(waBusinessNumber, waId);

    if (activeSession) {
      return await this.flowOrchestrator.resumeFlow({
        sessionId: String(activeSession._id),
        userInput: normalized,
      });
    }

    const flow = await this.selectFlow(orgId, normalized);
    if (!flow) {
      throw new ValidationError('No published flow matched the incoming message.');
    }

    return await this.flowOrchestrator.startFlow({
      orgId,
      flowId: String(flow._id),
      contactId: String(contact._id),
      waId,
      waBusinessNumber,
      initialVariables: {},
    });
  }

  private async ensureContact(orgId: string, waId: string): Promise<ContactDocument> {
    return await this.contactService.getOrCreateContactByWaId(orgId, waId);
  }

  private async selectFlow(orgId: string, message: string) {
    const tokens = message.toLowerCase().split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      const flow = await this.flowRepository.findPublishedByOrgAndKeyword(orgId, token);
      if (flow) {
        return flow;
      }
    }
    return null;
  }

  private extractMessage(payload: WhatsAppWebhookPayload): ExtractedMessage | null {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const metadata = value?.metadata;
    const waBusinessNumber = metadata?.display_phone_number || metadata?.phone_number_id;
    const message = value?.messages?.[0];
    const waId = value?.contacts?.[0]?.wa_id || message?.from;

    if (!message || !waBusinessNumber || !waId) {
      return null;
    }

    const text = this.extractTextFromMessage(message);
    if (!text) {
      return null;
    }

    return { waId, waBusinessNumber, text };
  }

  private extractTextFromMessage(message: WhatsAppMessage): string | null {
    if (message.type === 'text' && message.text?.body) {
      return message.text.body;
    }

    if (message.type === 'button' && message.button?.text) {
      return message.button.text;
    }

    if (message.type === 'interactive' && message.interactive) {
      if (message.interactive.button_reply?.title) {
        return message.interactive.button_reply.title;
      }
      if (message.interactive.list_reply?.title) {
        return message.interactive.list_reply.title;
      }
    }

    return null;
  }
}
