import type { BotResponse } from '../domain/bot-response';
import { formatWhatsAppText, WA_EMOJI } from '../infrastructure/formatter/whatsapp-format';
import { HERO_BUTTON_IDS } from './greeting-hero';
import type { MemoryTurn } from '../infrastructure/memory/redis-memory';

export type HeroLeadIntent = 'quote' | 'test_ride';
export type HeroLeadStep = 'idle' | 'location' | 'pincode' | 'done';

export type HeroLeadState = {
  step: HeroLeadStep;
  intent?: HeroLeadIntent;
  location?: string;
  pinCode?: string;
  modelInterest?: string;
  name?: string;
  /** @deprecated legacy Redis payloads — mapped to location on read */
  city?: string;
  phone?: string;
};

export const EMPTY_HERO_LEAD: HeroLeadState = { step: 'idle' };

const LEGACY_LEAD_STEPS = new Set(['name', 'city', 'phone', 'model']);

export function normalizeHeroLeadState(lead?: HeroLeadState): HeroLeadState {
  if (!lead) return EMPTY_HERO_LEAD;
  const next: HeroLeadState = { ...lead };
  if (!next.location && next.city) {
    next.location = next.city;
  }
  if (LEGACY_LEAD_STEPS.has(next.step as string)) {
    next.step = next.location ? (next.pinCode ? 'done' : 'pincode') : 'location';
    if (next.step === 'done' && !next.pinCode) {
      next.step = 'pincode';
    }
  }
  return next;
}

export function isHeroLeadCollecting(lead?: HeroLeadState): boolean {
  const normalized = normalizeHeroLeadState(lead);
  return normalized.step !== 'idle' && normalized.step !== 'done';
}

export function isHeroLeadCaptured(lead?: HeroLeadState): boolean {
  return normalizeHeroLeadState(lead).step === 'done';
}

export function startHeroLeadFlow(intent: HeroLeadIntent, modelInterest?: string): HeroLeadState {
  return {
    step: 'location',
    intent,
    modelInterest: modelInterest?.trim() || undefined,
  };
}

function leadIntro(intent: HeroLeadIntent): string {
  return intent === 'test_ride'
    ? 'Perfect — I can arrange a *test ride* near you.'
    : 'Great — I’ll help you get a *city-wise on-road quote*.';
}

function leadPromptButtons(): Array<{ id: string; title: string }> {
  return [
    { id: HERO_BUTTON_IDS.MAIN_MENU, title: 'Main menu' },
    { id: HERO_BUTTON_IDS.TYPE_QUESTION, title: 'Ask first' },
  ];
}

export function buildHeroLeadPrompt(lead: HeroLeadState): BotResponse {
  const normalized = normalizeHeroLeadState(lead);
  switch (normalized.step) {
    case 'location':
      return {
        mode: 'buttons',
        text: formatWhatsAppText(
          `${leadIntro(normalized.intent ?? 'quote')}\n\n` +
            `Which *city or area* are you in?\n\n` +
            `_Example: Pune, Koramangala Bangalore, Dwarka Delhi_`,
        ),
        buttons: leadPromptButtons(),
      };
    case 'pincode':
      return {
        mode: 'buttons',
        text: formatWhatsAppText(
          `Thanks — noted *${normalized.location}*.\n\n` +
            `What's your *6-digit PIN code*?`,
        ),
        buttons: [{ id: HERO_BUTTON_IDS.MAIN_MENU, title: 'Main menu' }],
      };
    default:
      return {
        mode: 'text',
        text: formatWhatsAppText(`${WA_EMOJI.tip} How can I help you with Hero motorcycles today?`),
      };
  }
}

export function buildHeroLeadConfirmation(lead: HeroLeadState): BotResponse {
  const normalized = normalizeHeroLeadState(lead);
  const intentLabel = normalized.intent === 'test_ride' ? 'Test ride request' : 'City quote request';
  const lines = [
    `${WA_EMOJI.welcome} *You're all set!*`,
    '',
    `*${intentLabel}* received:`,
    `* Location: ${normalized.location ?? '—'}`,
    `* PIN code: ${normalized.pinCode ?? '—'}`,
    `* Model interest: ${normalized.modelInterest ?? 'To be confirmed'}`,
    '',
    'Our Hero advisor will contact you on WhatsApp with the on-road estimate.',
    '',
    'Meanwhile, ask me anything about specs, mileage, or comparisons!',
  ];

  return {
    mode: 'buttons',
    text: formatWhatsAppText(lines.join('\n')),
    buttons: [
      { id: HERO_BUTTON_IDS.COMPARE, title: 'Compare bikes' },
      { id: HERO_BUTTON_IDS.MILEAGE, title: 'Mileage & price' },
      { id: HERO_BUTTON_IDS.TYPE_QUESTION, title: 'Ask anything' },
    ],
  };
}

export function normalizeIndianPhone(input: string): string | undefined {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return undefined;
}

export function normalizePinCode(input: string): string | undefined {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 6 && /^[1-9]/.test(digits)) return digits;
  return undefined;
}

export function looksLikePhoneInput(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  return digits.length >= 10;
}

export function looksLikePinCodeInput(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  return digits.length === 6;
}

const LOCATION_BLOCKLIST =
  /^(me|you|us|under|below|above|best|model|bike|hero|lac|lakh|mileage|kmpl|price|quote|commuter|sporty|compare|details)$/i;

export function normalizeLeadLocation(input: string): string | undefined {
  const location = input.trim().replace(/\s+/g, ' ');
  if (location.length < 2 || location.length > 60) return undefined;
  if (/^\d+$/.test(location)) return undefined;
  if (isQuestionLikeMessage(location) || isHeroRecommendationQuestion(location)) return undefined;
  const words = location.split(/\s+/);
  if (words.every((w) => LOCATION_BLOCKLIST.test(w))) return undefined;
  if (/\b(mileage|kmpl|best|recommend|budget|lac|lakh)\b/i.test(location)) return undefined;
  return location;
}

/** @deprecated use normalizeLeadLocation */
export function normalizeLeadCity(input: string): string | undefined {
  return normalizeLeadLocation(input);
}

export function normalizeLeadName(input: string): string | undefined {
  const name = input.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 60) return undefined;
  if (/^\d+$/.test(name)) return undefined;
  if (/^(hi|hello|hey|ok|yes|no|thanks|thank you)$/i.test(name)) return undefined;
  if (isQuestionLikeMessage(name) || isHeroRecommendationQuestion(name)) return undefined;
  return name;
}

const QUESTION_START =
  /^(which|what|how|why|when|where|can|could|should|is|are|do|does|tell me|recommend|suggest|best|compare)/i;

export function isQuestionLikeMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (
    /^(?:get|send|want|need|give me|share)\s+(?:me\s+)?(?:a\s+)?(?:quote|on-road|city)/i.test(trimmed) ||
    /^(?:book|schedule)\s+(?:a\s+)?test ride/i.test(trimmed)
  ) {
    return false;
  }
  if (trimmed.includes('?')) return true;
  if (QUESTION_START.test(trimmed)) return true;
  if (trimmed.split(/\s+/).length > 10) return true;
  return false;
}

export function isHeroRecommendationQuestion(text: string): boolean {
  const q = text.toLowerCase();
  return (
    /best|recommend|which (?:model|bike|hero|one)|should i buy|good for me|suitable for/.test(q) ||
    /under\s*[₹]?\s*\d|\bbelow\s*[₹]?\s*\d|\b\d+\s*(?:lac|lakh|k\b)/.test(q) ||
    /budget|maximum mileage|fuel economy|cheapest|lowest price/.test(q)
  );
}

export type ExtractedLeadFields = {
  location?: string;
  pinCode?: string;
  name?: string;
  city?: string;
  phone?: string;
};

/** Parse lead fields from free-form replies during collection. */
export function extractLeadFieldsFromText(text: string): ExtractedLeadFields {
  const result: ExtractedLeadFields = {};
  const trimmed = text.trim();
  if (!trimmed) return result;

  if (isQuestionLikeMessage(trimmed) || isHeroRecommendationQuestion(trimmed)) {
    return result;
  }

  result.pinCode = normalizePinCode(trimmed);
  result.phone = normalizeIndianPhone(trimmed);

  const commaParts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    const maybeLocation = normalizeLeadLocation(commaParts[0] ?? '');
    const maybePin = normalizePinCode(commaParts[1] ?? '');
    if (maybeLocation) result.location = maybeLocation;
    if (maybePin) result.pinCode = maybePin;
  }

  if (!result.location) {
    result.location = normalizeLeadLocation(trimmed);
  }

  if (!result.pinCode && looksLikePinCodeInput(trimmed)) {
    result.pinCode = normalizePinCode(trimmed);
  }

  return result;
}

export function nextMissingLeadStep(lead: HeroLeadState): HeroLeadStep {
  const normalized = normalizeHeroLeadState(lead);
  if (!normalized.location) return 'location';
  if (!normalized.pinCode) return 'pincode';
  return 'done';
}

export function mergeLeadFields(lead: HeroLeadState, fields: ExtractedLeadFields): HeroLeadState {
  const next: HeroLeadState = { ...normalizeHeroLeadState(lead) };
  if (fields.location && !next.location) next.location = fields.location;
  if (fields.pinCode && !next.pinCode) next.pinCode = fields.pinCode;
  next.step = nextMissingLeadStep(next);
  return next;
}

export type HeroLeadAdvanceResult =
  | { kind: 'invalid'; message: string; lead: HeroLeadState }
  | { kind: 'prompt'; lead: HeroLeadState; response: BotResponse }
  | { kind: 'complete'; lead: HeroLeadState; response: BotResponse };

export function smartAdvanceHeroLead(lead: HeroLeadState, input: string): HeroLeadAdvanceResult {
  const current = normalizeHeroLeadState(lead);
  const text = input.trim();
  if (!text) {
    return {
      kind: 'invalid',
      lead: current,
      message: 'Please type a short reply so I can continue.',
    };
  }

  const fields = extractLeadFieldsFromText(text);
  const before = { ...current };
  const merged = mergeLeadFields(current, fields);
  const madeProgress = merged.location !== before.location || merged.pinCode !== before.pinCode;

  if (merged.step === 'done') {
    return { kind: 'complete', lead: merged, response: buildHeroLeadConfirmation(merged) };
  }

  if (madeProgress) {
    return {
      kind: 'prompt',
      lead: merged,
      response: buildHeroLeadPrompt(merged),
    };
  }

  if (current.step === 'location') {
    if (looksLikePinCodeInput(text) && !normalizeLeadLocation(text)) {
      return {
        kind: 'invalid',
        lead: current,
        message: 'Please share your *city or area* first — PIN code comes next.',
      };
    }
    const location = normalizeLeadLocation(text);
    if (!location) {
      return {
        kind: 'invalid',
        lead: current,
        message: 'Please enter your city or locality (e.g. *Pune* or *Koramangala, Bangalore*).',
      };
    }
    const next = mergeLeadFields(current, { location });
    return { kind: 'prompt', lead: next, response: buildHeroLeadPrompt(next) };
  }

  if (current.step === 'pincode') {
    const pinCode = normalizePinCode(text);
    if (!pinCode) {
      return {
        kind: 'invalid',
        lead: current,
        message: 'Please enter a valid *6-digit PIN code* (e.g. 411001).',
      };
    }
    const next = mergeLeadFields(current, { pinCode });
    return { kind: 'complete', lead: next, response: buildHeroLeadConfirmation(next) };
  }

  return {
    kind: 'invalid',
    lead: current,
    message: 'Something went wrong. Type *menu* to start again.',
  };
}

export function formatHeroLeadForLog(lead: HeroLeadState): Record<string, string | undefined> {
  const normalized = normalizeHeroLeadState(lead);
  return {
    intent: normalized.intent,
    location: normalized.location,
    pinCode: normalized.pinCode,
    modelInterest: normalized.modelInterest,
    name: normalized.name,
  };
}

export function detectHeroLeadIntentFromText(text: string): HeroLeadIntent | undefined {
  const q = text.toLowerCase();
  if (/test ride|test drive|book a ride|schedule.*ride/.test(q)) return 'test_ride';
  if (
    /(?:get|send|want|need|give me|share)\s+(?:me\s+)?(?:a\s+)?quote|on-road|on road|city.?wise|how much|what.*price|price in|cost in|ex-showroom|showroom price|interested in buying|want to buy|talk to dealer|nearest dealer|emi|loan/.test(
      q,
    )
  ) {
    return 'quote';
  }
  return undefined;
}

export function hasHeroBuyingSignal(text: string): boolean {
  if (isHeroRecommendationQuestion(text) || isQuestionLikeMessage(text)) return false;
  const q = text.toLowerCase();
  const price = /price|cost|quote|on-road|on road|how much|ex-showroom/.test(q);
  const model = /splendor|xtreme|glamour|hf |xpulse|hero|125r|160r|motorcycle|bike/.test(q);
  const intent = /buy|purchase|book|dealer|test ride|interested in buying|want to buy|talk to dealer/.test(q);
  return (price && model) || intent;
}

export function shouldOfferLeadCapture(
  question: string,
  _turns: MemoryTurn[],
  lead?: HeroLeadState,
): boolean {
  if (isHeroLeadCollecting(lead) || isHeroLeadCaptured(lead)) return false;
  if (isHeroRecommendationQuestion(question) || isQuestionLikeMessage(question)) return false;
  return Boolean(detectHeroLeadIntentFromText(question) || hasHeroBuyingSignal(question));
}

/** Lead capture starts only via Get city quote / Book test ride buttons — not inline in answers. */
export function shouldStartInlineLeadAsk(_question: string, _lead?: HeroLeadState): boolean {
  return false;
}

export function extractCityFromText(text: string): string | undefined {
  const patterns = [
    /\b(?:in|for|at|from)\s+([A-Za-z][A-Za-z\s]{1,22}?)(?:\s*[?.!,]|$)/i,
    /\b([A-Za-z][A-Za-z\s]{1,22}?)\s+(?:price|quote|on-road|on road)/i,
  ];
  for (const re of patterns) {
    const match = text.match(re);
    const raw = match?.[1]?.trim();
    if (!raw) continue;
    const city = normalizeLeadLocation(raw);
    if (city && !/^(hero|splendor|xtreme|glamour|bike|motorcycle|the|a|my|i)$/i.test(city)) {
      return city;
    }
  }
  return undefined;
}

function isLeadOnlyAssistantPrompt(content: string): boolean {
  const c = content.toLowerCase();
  if (content.length > 320) return false;
  if (
    c.includes('kmpl') ||
    c.includes('ex-showroom') ||
    c.includes('•') ||
    c.includes('mileage-first') ||
    c.includes('sporty under')
  ) {
    return false;
  }
  return (
    c.includes('city or area') ||
    c.includes('which city') ||
    c.includes('6-digit pin') ||
    c.includes('pin code') ||
    c.includes('pincode')
  );
}

export function inferLeadStepFromAssistantTurn(turns: MemoryTurn[]): HeroLeadStep | undefined {
  const lastUser = [...turns].reverse().find((t) => t.role === 'user');
  if (
    lastUser?.content &&
    (isHeroRecommendationQuestion(lastUser.content) || isQuestionLikeMessage(lastUser.content)) &&
    !detectHeroLeadIntentFromText(lastUser.content)
  ) {
    return undefined;
  }

  const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant');
  if (!lastAssistant?.content || !isLeadOnlyAssistantPrompt(lastAssistant.content)) return undefined;
  const c = lastAssistant.content.toLowerCase();
  if (c.includes('pin code') || c.includes('pincode') || c.includes('6-digit pin')) {
    return 'pincode';
  }
  if (c.includes('city or area') || c.includes('which city') || c.includes('locality')) {
    return 'location';
  }
  return undefined;
}

export function looksLikeLeadFieldReply(text: string, expectedStep?: HeroLeadStep): boolean {
  if (isQuestionLikeMessage(text) || isHeroRecommendationQuestion(text)) return false;
  if (!expectedStep || expectedStep === 'idle' || expectedStep === 'done') return false;

  const normalizedStep = LEGACY_LEAD_STEPS.has(expectedStep as string)
    ? 'location'
    : expectedStep;

  const fields = extractLeadFieldsFromText(text);
  if (normalizedStep === 'pincode' || looksLikePinCodeInput(text)) {
    return Boolean(fields.pinCode);
  }
  if (normalizedStep === 'location') {
    return Boolean(fields.location) || Boolean(normalizeLeadLocation(text));
  }
  return Boolean(fields.location || fields.pinCode);
}

export function buildInlineLeadAsk(_lead: HeroLeadState): string {
  return '';
}

export function prepareHeroLeadFromContext(
  intent: HeroLeadIntent,
  opts: { modelInterest?: string; contactName?: string },
): HeroLeadState {
  const lead = startHeroLeadFlow(intent, opts.modelInterest);
  if (opts.contactName) {
    const name = normalizeLeadName(opts.contactName);
    if (name) {
      lead.name = name;
    }
  }
  return lead;
}

export function appendLeadAskToResponse(response: BotResponse, ask: string): BotResponse {
  if (!ask.trim()) return response;
  if (response.mode !== 'text' && response.mode !== 'buttons' && response.mode !== 'list') {
    return response;
  }
  return {
    ...response,
    text: formatWhatsAppText(`${response.text}${ask}`),
  };
}

export function rehydrateLeadState(
  existing: HeroLeadState | undefined,
  turns: MemoryTurn[],
  intent: HeroLeadIntent = 'quote',
): HeroLeadState | undefined {
  const normalized = normalizeHeroLeadState(existing);
  if (isHeroLeadCollecting(normalized) || isHeroLeadCaptured(normalized)) {
    return normalized;
  }
  const step = inferLeadStepFromAssistantTurn(turns);
  if (!step || step === 'done' || step === 'idle') return normalized;
  return normalizeHeroLeadState({ step, intent });
}
