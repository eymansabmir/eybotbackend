import type { NextFunction, Request, Response } from 'express';
import { RecipientStatus } from '@prisma/client';
import type { ICampaignRecipientRepository } from '../campaign/campaign-recipient.repository';
import { logger } from '../../utils/logger';

function readAny(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function extractRecipientId(customField: string | undefined): string | undefined {
  if (!customField) return undefined;

  try {
    const parsed = JSON.parse(customField) as Record<string, unknown>;
    const candidate = parsed['campaignRecipientId'] ?? parsed['recipientId'] ?? parsed['userId'];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  } catch {
    // Not JSON, continue below.
  }

  return customField;
}

function mapExotelStatusToRecipientStatus(rawStatus: string | undefined): 'completed' | 'failed' | null {
  if (!rawStatus) return null;

  const status = rawStatus.toLowerCase();

  if (['completed', 'answered'].includes(status)) {
    return RecipientStatus.completed;
  }

  if (['failed', 'busy', 'no-answer', 'no answer', 'canceled', 'cancelled', 'unanswered', 'not-answered'].includes(status)) {
    return RecipientStatus.failed;
  }

  return null;
}

export class ExotelCallbackController {
  constructor(private readonly campaignRecipientRepo: ICampaignRecipientRepository) {}

  handle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = {
        ...(typeof req.query === 'object' && req.query ? req.query : {}),
        ...(typeof req.body === 'object' && req.body ? req.body : {}),
      } as Record<string, unknown>;

      const callSid = readAny(payload, ['CallSid', 'callSid', 'call_sid']);
      const callStatus = readAny(payload, ['CallStatus', 'callStatus', 'call_status', 'Status', 'status']);
      const customField = readAny(payload, ['CustomField', 'customField', 'custom_field']);

      const mappedStatus = mapExotelStatusToRecipientStatus(callStatus);
      if (!mappedStatus) {
        logger.debug({ callSid, callStatus }, 'Exotel callback ignored: non-terminal call status');
        res.status(200).json({ success: true, ignored: true });
        return;
      }

      const recipientIdFromCustom = extractRecipientId(customField);
      let recipient = recipientIdFromCustom
        ? await this.campaignRecipientRepo.findByRecipientIdWithCampaign(recipientIdFromCustom)
        : null;

      if (!recipient && callSid) {
        recipient = await this.campaignRecipientRepo.findByCampaignMessageId(callSid);
      }

      if (!recipient) {
        logger.warn({ callSid, callStatus, customField }, 'Exotel callback received but no campaign recipient was resolved');
        res.status(200).json({ success: true, ignored: true });
        return;
      }

      await this.campaignRecipientRepo.updateVoiceTerminalStatus(
        recipient.id,
        recipient.campaignId,
        mappedStatus,
        callSid,
      );

      logger.info(
        {
          callSid,
          callStatus,
          mappedStatus,
          recipientId: recipient.id,
          campaignId: recipient.campaignId,
        },
        'Exotel callback processed and campaign analytics updated',
      );

      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  };
}
