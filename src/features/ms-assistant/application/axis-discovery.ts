import type { BotResponse } from '../domain/bot-response';
import { formatWhatsAppText } from '../infrastructure/formatter/whatsapp-format';

export type { BurgundyDiscoveryState as AxisDiscoveryState } from './axis-burgundy';
export {
  EMPTY_BURGUNDY_DISCOVERY as EMPTY_AXIS_DISCOVERY,
  detectNotInterested,
  parseBurgundyRequirement as extractDiscoveryFromMessage,
  hasClearRequirement,
  loanTypeFromButtonId,
  buildLoanRequirementPrompt,
} from './axis-burgundy';

import type { BurgundyDiscoveryState } from './axis-burgundy';

export function isAxisDiscoveryActive(d?: BurgundyDiscoveryState): boolean {
  if (!d) return false;
  return d.step === 'loan_type' || d.step === 'requirement';
}

export function buildNotInterestedResponse(): BotResponse {
  return {
    mode: 'text',
    text: formatWhatsAppText(
      'No problem 😊 If you need any loan information later, I\'m happy to help.\n\n_Type *menu* anytime._',
    ),
  };
}
