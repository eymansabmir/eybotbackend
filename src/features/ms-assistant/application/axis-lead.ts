import type { BotResponse } from '../domain/bot-response';
import { formatWhatsAppText, WA_EMOJI } from '../infrastructure/formatter/whatsapp-format';
import { AXIS_BUTTON_IDS } from './greeting-axis-loan';
import type { MemoryTurn } from '../infrastructure/memory/redis-memory';
import {
  estimateEmi,
  formatInr,
  getDemoOffer,
  type NegotiationLevel,
} from './axis-negotiation';

export type AxisLeadIntent = 'apply' | 'callback';
export type AxisLeadStep = 'idle' | 'amount' | 'tenure' | 'location' | 'pincode' | 'done';

export type AxisLeadState = {
  step: AxisLeadStep;
  intent?: AxisLeadIntent;
  loanAmount?: number;
  tenureMonths?: number;
  location?: string;
  pinCode?: string;
  purpose?: string;
  name?: string;
};

export const EMPTY_AXIS_LEAD: AxisLeadState = { step: 'idle' };

export function isAxisLeadCollecting(lead?: AxisLeadState): boolean {
  if (!lead) return false;
  return lead.step !== 'idle' && lead.step !== 'done';
}

export function isAxisLeadCaptured(lead?: AxisLeadState): boolean {
  return lead?.step === 'done';
}

export function startAxisLeadFlow(intent: AxisLeadIntent = 'apply'): AxisLeadState {
  return { step: 'amount', intent };
}

function leadIntro(intent: AxisLeadIntent): string {
  return intent === 'callback'
    ? 'I can arrange a *callback* from our loan team.'
    : 'Great — let\'s capture details for a *personal loan application* (demo).';
}

function leadPromptButtons(includeAsk = true): Array<{ id: string; title: string }> {
  const row: Array<{ id: string; title: string }> = [
    { id: AXIS_BUTTON_IDS.MAIN_MENU, title: 'Main menu' },
  ];
  if (includeAsk) {
    row.push({ id: AXIS_BUTTON_IDS.TYPE_QUESTION, title: 'Ask first' });
  }
  return row.slice(0, 3);
}

export function buildAxisLeadPrompt(lead: AxisLeadState): BotResponse {
  switch (lead.step) {
    case 'amount':
      return {
        mode: 'buttons',
        text: formatWhatsAppText(
          `${leadIntro(lead.intent ?? 'apply')}\n\n` +
            `How much loan amount are you looking for?\n\n` +
            `_Example: 5 lakh, ₹500000, 8L_`,
        ),
        buttons: leadPromptButtons(),
      };
    case 'tenure':
      return {
        mode: 'buttons',
        text: formatWhatsAppText(
          `Noted *${formatInr(lead.loanAmount ?? 0)}*.\n\n` +
            `Preferred *tenure* in months? (12–84)\n\n` +
            `_Example: 36, 48, 60_`,
        ),
        buttons: [{ id: AXIS_BUTTON_IDS.MAIN_MENU, title: 'Main menu' }],
      };
    case 'location':
      return {
        mode: 'buttons',
        text: formatWhatsAppText(
          `Thanks — *${lead.tenureMonths} months*.\n\n` +
            `Which *city or area* are you in?\n\n` +
            `_Example: Mumbai, Pune, Bengaluru_`,
        ),
        buttons: leadPromptButtons(),
      };
    case 'pincode':
      return {
        mode: 'buttons',
        text: formatWhatsAppText(
          `Got it — *${lead.location}*.\n\nWhat's your *6-digit PIN code*?`,
        ),
        buttons: [{ id: AXIS_BUTTON_IDS.MAIN_MENU, title: 'Main menu' }],
      };
    default:
      return {
        mode: 'text',
        text: formatWhatsAppText(`${WA_EMOJI.tip} How can I help with your personal loan today?`),
      };
  }
}

export function buildAxisLeadConfirmation(
  lead: AxisLeadState,
  negotiationLevel: NegotiationLevel = 0,
): BotResponse {
  const offer = getDemoOffer(negotiationLevel);
  const emi = estimateEmi(lead.loanAmount ?? 500_000, offer.ratePct, lead.tenureMonths ?? 36);
  const intentLabel = lead.intent === 'callback' ? 'Callback request' : 'Application interest';

  const lines = [
    `${WA_EMOJI.welcome} *Details received!*`,
    '',
    `*${intentLabel}* (demo):`,
    `* Amount: ${formatInr(lead.loanAmount ?? 0)}`,
    `* Tenure: ${lead.tenureMonths ?? '—'} months`,
    `* Location: ${lead.location ?? '—'}`,
    `* PIN: ${lead.pinCode ?? '—'}`,
    '',
    `*Illustrative demo terms:* ${offer.ratePct}% p.a. | fee ${offer.processingFeePct}% + GST`,
    `*Approx. EMI:* ${formatInr(emi)}/month`,
    '',
    '_Not an approval or live Axis Bank offer — our team will contact you on WhatsApp._',
    '',
    'Ask me anything else about rates, documents, or EMI meanwhile.',
  ];

  return {
    mode: 'buttons',
    text: formatWhatsAppText(lines.join('\n')),
    buttons: [
      { id: AXIS_BUTTON_IDS.EMI_CALC, title: 'EMI examples' },
      { id: AXIS_BUTTON_IDS.DOCUMENTS, title: 'Documents' },
      { id: AXIS_BUTTON_IDS.TYPE_QUESTION, title: 'Ask anything' },
    ],
  };
}

export function parseLoanAmount(input: string): number | undefined {
  const q = input.toLowerCase().replace(/,/g, '').trim();
  const lakhMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:lac|lakh|l\b)/);
  if (lakhMatch) {
    const n = Number(lakhMatch[1]) * 100_000;
    if (n >= 10_000 && n <= 40_000_000) return Math.round(n);
  }
  const digitMatch = q.match(/(?:₹|rs\.?|inr)?\s*(\d{5,8})/i);
  if (digitMatch) {
    const n = Number(digitMatch[1]);
    if (n >= 10_000 && n <= 40_000_000) return n;
  }
  return undefined;
}

export function parseTenureMonths(input: string): number | undefined {
  const digits = input.replace(/\D/g, '');
  const n = Number(digits);
  if (n >= 12 && n <= 84) return n;
  const yearMatch = input.match(/(\d+)\s*(?:year|yr)/i);
  if (yearMatch) {
    const months = Number(yearMatch[1]) * 12;
    if (months >= 12 && months <= 84) return months;
  }
  return undefined;
}

export function normalizePinCode(input: string): string | undefined {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 6 && /^[1-9]/.test(digits)) return digits;
  return undefined;
}

export function normalizeLeadLocation(input: string): string | undefined {
  const location = input.trim().replace(/\s+/g, ' ');
  if (location.length < 2 || location.length > 60) return undefined;
  if (/^\d+$/.test(location)) return undefined;
  if (/^(hi|hello|ok|yes|no)$/i.test(location)) return undefined;
  return location;
}

export function isQuestionLikeMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.includes('?')) return true;
  if (/^(which|what|how|why|when|where|can|could|should|tell me|explain)/i.test(trimmed)) return true;
  if (trimmed.split(/\s+/).length > 12) return true;
  return false;
}

export type AxisLeadAdvanceResult =
  | { kind: 'invalid'; message: string; lead: AxisLeadState }
  | { kind: 'prompt'; lead: AxisLeadState; response: BotResponse }
  | { kind: 'complete'; lead: AxisLeadState; response: BotResponse };

export function nextMissingLeadStep(lead: AxisLeadState): AxisLeadStep {
  if (!lead.loanAmount) return 'amount';
  if (!lead.tenureMonths) return 'tenure';
  if (!lead.location) return 'location';
  if (!lead.pinCode) return 'pincode';
  return 'done';
}

export function smartAdvanceAxisLead(lead: AxisLeadState, input: string): AxisLeadAdvanceResult {
  const text = input.trim();
  if (!text) {
    return { kind: 'invalid', lead, message: 'Please type a short reply to continue.' };
  }

  if (lead.step === 'amount') {
    const loanAmount = parseLoanAmount(text);
    if (!loanAmount) {
      return {
        kind: 'invalid',
        lead,
        message: 'Please enter a valid amount (e.g. *5 lakh* or *₹500000*). Max up to ₹40 lakh for personal loan.',
      };
    }
    const next: AxisLeadState = { ...lead, loanAmount, step: 'tenure' };
    return { kind: 'prompt', lead: next, response: buildAxisLeadPrompt(next) };
  }

  if (lead.step === 'tenure') {
    const tenureMonths = parseTenureMonths(text);
    if (!tenureMonths) {
      return {
        kind: 'invalid',
        lead,
        message: 'Please enter tenure between *12 and 84 months* (e.g. 36 or 48).',
      };
    }
    const next: AxisLeadState = { ...lead, tenureMonths, step: 'location' };
    return { kind: 'prompt', lead: next, response: buildAxisLeadPrompt(next) };
  }

  if (lead.step === 'location') {
    const location = normalizeLeadLocation(text);
    if (!location) {
      return {
        kind: 'invalid',
        lead,
        message: 'Please enter your city or locality (e.g. *Pune*).',
      };
    }
    const next: AxisLeadState = { ...lead, location, step: 'pincode' };
    return { kind: 'prompt', lead: next, response: buildAxisLeadPrompt(next) };
  }

  if (lead.step === 'pincode') {
    const pinCode = normalizePinCode(text);
    if (!pinCode) {
      return {
        kind: 'invalid',
        lead,
        message: 'Please enter a valid *6-digit PIN code*.',
      };
    }
    const next: AxisLeadState = { ...lead, pinCode, step: 'done' };
    return {
      kind: 'complete',
      lead: next,
      response: buildAxisLeadConfirmation(next),
    };
  }

  return { kind: 'invalid', lead, message: 'Type *menu* to start again.' };
}

export function looksLikeLeadFieldReply(text: string, expectedStep?: AxisLeadStep): boolean {
  if (isQuestionLikeMessage(text)) return false;
  if (!expectedStep || expectedStep === 'idle' || expectedStep === 'done') return false;
  if (expectedStep === 'amount') return Boolean(parseLoanAmount(text));
  if (expectedStep === 'tenure') return Boolean(parseTenureMonths(text));
  if (expectedStep === 'location') return Boolean(normalizeLeadLocation(text));
  if (expectedStep === 'pincode') return Boolean(normalizePinCode(text));
  return false;
}

export function inferLeadStepFromAssistantTurn(turns: MemoryTurn[]): AxisLeadStep | undefined {
  const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant');
  if (!lastAssistant?.content) return undefined;
  const c = lastAssistant.content.toLowerCase();
  if (c.includes('loan amount') || c.includes('how much loan')) return 'amount';
  if (c.includes('tenure') && c.includes('month')) return 'tenure';
  if (c.includes('city or area') || c.includes('which city')) return 'location';
  if (c.includes('pin code') || c.includes('6-digit')) return 'pincode';
  return undefined;
}

export function prepareAxisLeadFromContext(opts: {
  intent?: AxisLeadIntent;
  loanAmount?: number;
  tenureMonths?: number;
  purpose?: string;
}): AxisLeadState {
  const lead = startAxisLeadFlow(opts.intent ?? 'apply');
  if (opts.loanAmount) lead.loanAmount = opts.loanAmount;
  if (opts.tenureMonths) lead.tenureMonths = opts.tenureMonths;
  if (opts.purpose) lead.purpose = opts.purpose;
  lead.step = nextMissingLeadStep(lead);
  return lead;
}

export function formatAxisLeadForLog(lead: AxisLeadState): Record<string, string | number | undefined> {
  return {
    intent: lead.intent,
    loanAmount: lead.loanAmount,
    tenureMonths: lead.tenureMonths,
    location: lead.location,
    pinCode: lead.pinCode,
  };
}

export function isAxisLeadButton(id: string): boolean {
  return id.trim().toLowerCase() === AXIS_BUTTON_IDS.APPLY_LOAN;
}

export function extractLoanContextFromText(text: string): {
  loanAmount?: number;
  tenureMonths?: number;
} {
  return {
    loanAmount: parseLoanAmount(text),
    tenureMonths: parseTenureMonths(text),
  };
}
