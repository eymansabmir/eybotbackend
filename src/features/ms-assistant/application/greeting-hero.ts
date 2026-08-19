import type { BotResponse } from '../domain/bot-response';
import { formatWhatsAppText, WA_EMOJI } from '../infrastructure/formatter/whatsapp-format';
import type { NearMissAllowList } from '../infrastructure/llm/shared';

export const HERO_BUTTON_IDS = {
  MAIN_MENU: 'hero_main_menu',
  TYPE_QUESTION: 'hero_ask',
  GET_QUOTE: 'hero_get_quote',
  TEST_RIDE: 'hero_test_ride',
  BROWSE_COMMUTER: 'hero_browse_commuter',
  BROWSE_SPORTY: 'hero_browse_sporty',
  BROWSE_ADVENTURE: 'hero_browse_adventure',
  COMPARE: 'hero_compare',
  MILEAGE: 'hero_mileage',
  MORE_DETAILS: 'hero_more_details',
  MODEL_HF100: 'hero_model_hf100',
  MODEL_HF_DELUXE: 'hero_model_hf_deluxe',
  MODEL_SPLENDOR: 'hero_model_splendor',
  MODEL_SPLENDOR_XTEC: 'hero_model_splendor_xtec',
  MODEL_SUPER_SPLENDOR: 'hero_model_super_splendor',
  MODEL_GLAMOUR: 'hero_model_glamour',
  MODEL_GLAMOUR_X: 'hero_model_glamour_x',
  MODEL_XTREME_125R: 'hero_model_xtreme_125r',
  MODEL_XTREME_160R: 'hero_model_xtreme_160r',
  MODEL_XPULSE: 'hero_model_xpulse_210',
} as const;

export type HeroAction = {
  id: string;
  title: string;
  hint: string;
};

/** Closed catalog — LLM may only suggest buttons from this list. */
export const HERO_ACTION_CATALOG: HeroAction[] = [
  { id: HERO_BUTTON_IDS.MORE_DETAILS, title: 'More details', hint: 'Specs, features, variants for the topic' },
  { id: HERO_BUTTON_IDS.MILEAGE, title: 'Mileage & price', hint: 'Claimed mileage and ex-showroom pricing' },
  { id: HERO_BUTTON_IDS.COMPARE, title: 'Compare bikes', hint: 'Side-by-side model comparison' },
  { id: HERO_BUTTON_IDS.BROWSE_COMMUTER, title: 'Commuter bikes', hint: 'HF, Splendor, Super Splendor, Glamour' },
  { id: HERO_BUTTON_IDS.BROWSE_SPORTY, title: 'Sporty bikes', hint: 'Xtreme 125R, Xtreme 160R, Glamour X' },
  { id: HERO_BUTTON_IDS.BROWSE_ADVENTURE, title: 'Adventure bikes', hint: 'Xpulse 210' },
  { id: HERO_BUTTON_IDS.GET_QUOTE, title: 'Get city quote', hint: 'City-wise on-road quote — starts lead capture' },
  { id: HERO_BUTTON_IDS.TEST_RIDE, title: 'Book test ride', hint: 'Schedule test ride — starts lead capture' },
];

const HERO_ACTION_BY_ID = new Map(HERO_ACTION_CATALOG.map((a) => [a.id, a]));

const HERO_LEAD_BUTTON_IDS = new Set<string>([
  HERO_BUTTON_IDS.GET_QUOTE,
  HERO_BUTTON_IDS.TEST_RIDE,
]);

const HERO_MODEL_QUERIES: Record<string, string> = {
  [HERO_BUTTON_IDS.MODEL_HF100]: 'Hero HF 100 specifications mileage price features',
  [HERO_BUTTON_IDS.MODEL_HF_DELUXE]: 'Hero HF Deluxe specifications mileage price features',
  [HERO_BUTTON_IDS.MODEL_SPLENDOR]: 'Hero Splendor Plus specifications mileage price features',
  [HERO_BUTTON_IDS.MODEL_SPLENDOR_XTEC]: 'Hero Splendor Plus XTEC specifications features mileage',
  [HERO_BUTTON_IDS.MODEL_SUPER_SPLENDOR]: 'Hero Super Splendor XTEC specifications mileage price',
  [HERO_BUTTON_IDS.MODEL_GLAMOUR]: 'Hero Glamour specifications mileage price features',
  [HERO_BUTTON_IDS.MODEL_GLAMOUR_X]: 'Hero Glamour X specifications features mileage price',
  [HERO_BUTTON_IDS.MODEL_XTREME_125R]: 'Hero Xtreme 125R specifications mileage price features ABS',
  [HERO_BUTTON_IDS.MODEL_XTREME_160R]: 'Hero Xtreme 160R specifications mileage price performance',
  [HERO_BUTTON_IDS.MODEL_XPULSE]: 'Hero Xpulse 210 adventure specifications price variants',
};

export function buildHeroWelcomeResponse(): BotResponse {
  return {
    mode: 'list',
    text: formatWhatsAppText(
      `${WA_EMOJI.welcome} *Hero MotoCorp Assistant*\n\n` +
        'Looking for the right Hero bike? Ask in your own words — mileage, budget, office commute, sporty ride, or adventure.\n\n' +
        'Or browse models below. I can also arrange a *city quote* or *test ride*.',
    ),
    buttonTitle: 'Explore Hero',
    sections: [
      {
        title: 'Shop by need',
        rows: [
          {
            id: HERO_BUTTON_IDS.BROWSE_COMMUTER,
            title: 'Commuter bikes',
            description: 'HF, Splendor, Super Splendor',
          },
          {
            id: HERO_BUTTON_IDS.BROWSE_SPORTY,
            title: 'Sporty bikes',
            description: 'Xtreme 125R, Xtreme 160R',
          },
          {
            id: HERO_BUTTON_IDS.BROWSE_ADVENTURE,
            title: 'Adventure',
            description: 'Xpulse 210',
          },
          {
            id: HERO_BUTTON_IDS.COMPARE,
            title: 'Compare bikes',
            description: 'Splendor vs Xtreme & more',
          },
          {
            id: HERO_BUTTON_IDS.GET_QUOTE,
            title: 'Get city quote',
            description: 'On-road price for your city',
          },
          {
            id: HERO_BUTTON_IDS.TEST_RIDE,
            title: 'Book test ride',
            description: 'Schedule at nearest dealer',
          },
          {
            id: HERO_BUTTON_IDS.TYPE_QUESTION,
            title: 'Ask anything',
            description: 'Free-text bike question',
          },
        ],
      },
    ],
  };
}

export function buildHeroAskPromptResponse(): BotResponse {
  return {
    mode: 'text',
    text: formatWhatsAppText(
      `${WA_EMOJI.tip} Ask me anything — e.g. *best bike for 30 km daily*, *Splendor mileage*, *Xtreme 125R price*, or *Splendor vs Xtreme*.`,
    ),
  };
}

export function buildHeroMenuNudgeResponse(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      `${WA_EMOJI.tip} Type your question or tap below to browse Hero bikes, compare models, or get a quote.`,
    ),
    buttons: [
      { id: HERO_BUTTON_IDS.BROWSE_COMMUTER, title: 'Commuter bikes' },
      { id: HERO_BUTTON_IDS.GET_QUOTE, title: 'Get city quote' },
      { id: HERO_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

export function formatHeroActionsForPrompt(): string {
  return HERO_ACTION_CATALOG.map((a) => `- id: ${a.id} | title: "${a.title}" | when: ${a.hint}`).join('\n');
}

export function buildHeroLlmExtraInstructions(excludeButtonId?: string): string {
  const excludeNote = excludeButtonId
    ? `\nDo NOT include button id "${excludeButtonId}" — the user already chose that.\n`
    : '';
  return (
    `\nALLOWED_ACTIONS (pick exactly 2 ids for slots 1–2; slot 3 is ALWAYS Get city quote for lead capture):\n` +
    `${formatHeroActionsForPrompt()}\n` +
    excludeNote +
    `\nRespond as JSON only:\n` +
    `{ "mode": "buttons", "text": string, "buttons": [{ "id": string, "title": string }] }\n\n` +
    `Structure the "text" field:\n` +
    `1) One direct sentence answering the question (Hero products only, from retrieved knowledge).\n` +
    `2) Blank line, then 2–4 short bullets on specs/mileage/price/use case as grounded in knowledge.\n` +
    `3) End with: "Want a city-wise quote or test ride? Tap below."\n\n` +
    `Recommendation / budget questions (e.g. "best under 1 lakh"):\n` +
    `- Suggest 2–3 grounded Hero models that fit the budget from retrieved knowledge (HF 100, HF Deluxe, Splendor+, Xtreme 125R, etc.).\n` +
    `- Use ex-showroom Delhi prices only when present in knowledge; say on-road varies by city.\n` +
    `- If use case is unclear, ask ONE short clarifier (mileage-first vs sporty) — do not ask for name/phone/mobile in text.\n` +
    `- NEVER ask for phone number, mobile number, or personal details in the text — only via the Get city quote button.\n` +
    `- Never invent prices, mileage, or models outside retrieved knowledge.\n` +
    `Never invent specs, prices, or mileage. Preserve ARAI/WMTC/E20 labels when citing mileage.`
  );
}

const HERO_BUTTON_FALLBACKS = [
  HERO_BUTTON_IDS.MORE_DETAILS,
  HERO_BUTTON_IDS.MILEAGE,
  HERO_BUTTON_IDS.COMPARE,
  HERO_BUTTON_IDS.BROWSE_COMMUTER,
] as const;

export function buildHeroButtonRow(
  candidateIds: string[],
  excludeIds: string[] = [],
): Array<{ id: string; title: string }> {
  const exclude = new Set(excludeIds.filter(Boolean));
  const used = new Set<string>();
  const row: Array<{ id: string; title: string }> = [];

  const tryAdd = (id: string): boolean => {
    if (exclude.has(id) || used.has(id) || HERO_LEAD_BUTTON_IDS.has(id)) return false;
    const action = HERO_ACTION_BY_ID.get(id);
    if (!action) return false;
    row.push({ id: action.id, title: action.title.slice(0, 20) });
    used.add(id);
    return true;
  };

  for (const id of candidateIds) {
    if (row.length >= 2) break;
    tryAdd(id);
  }
  for (const id of HERO_BUTTON_FALLBACKS) {
    if (row.length >= 2) break;
    tryAdd(id);
  }

  const thirdId = exclude.has(HERO_BUTTON_IDS.GET_QUOTE)
    ? HERO_BUTTON_IDS.TEST_RIDE
    : HERO_BUTTON_IDS.GET_QUOTE;
  const third = HERO_ACTION_BY_ID.get(thirdId);
  if (third) {
    row.push({ id: third.id, title: third.title.slice(0, 20) });
  }

  return row.slice(0, 3);
}

export function enforceHeroBotResponse(
  response: BotResponse,
  question: string,
  excludeButtonId?: string,
): BotResponse {
  const excludeIds = excludeButtonId ? [excludeButtonId] : [];
  const text =
    response.mode === 'text' || response.mode === 'buttons' || response.mode === 'list'
      ? formatWhatsAppText(response.text)
      : formatWhatsAppText('');

  if (!text) {
    return buildHeroNearMissResponse(question, excludeButtonId);
  }

  const topicCandidates = collectHeroButtonCandidates(question);
  let llmCandidates: string[] = [];
  if (response.mode === 'buttons' && response.buttons?.length) {
    llmCandidates = response.buttons
      .map((b) => HERO_ACTION_BY_ID.get(b.id.trim())?.id)
      .filter((id): id is string => Boolean(id));
  }

  const buttons = buildHeroButtonRow([...llmCandidates, ...topicCandidates], excludeIds);
  return { mode: 'buttons', text, buttons };
}

function collectHeroButtonCandidates(question: string): string[] {
  const q = question.toLowerCase();
  const picks: string[] = [];

  if (/best|recommend|which (?:model|bike|hero)|under\s*\d|below\s*\d|\d\s*(?:lac|lakh)|budget|cheapest/.test(q)) {
    picks.push(HERO_BUTTON_IDS.BROWSE_COMMUTER, HERO_BUTTON_IDS.COMPARE, HERO_BUTTON_IDS.MILEAGE);
  } else if (/compare|vs |versus|better between|which should i buy/.test(q)) {
    picks.push(HERO_BUTTON_IDS.COMPARE, HERO_BUTTON_IDS.MORE_DETAILS, HERO_BUTTON_IDS.MILEAGE);
  } else if (/mileage|kmpl|fuel|petrol saving/.test(q)) {
    picks.push(HERO_BUTTON_IDS.MILEAGE, HERO_BUTTON_IDS.MORE_DETAILS, HERO_BUTTON_IDS.COMPARE);
  } else if (/price|cost|budget|cheapest|on-road|ex-showroom/.test(q)) {
    picks.push(HERO_BUTTON_IDS.MILEAGE, HERO_BUTTON_IDS.MORE_DETAILS, HERO_BUTTON_IDS.GET_QUOTE);
  } else if (/xpulse|adventure|tour|long ride/.test(q)) {
    picks.push(HERO_BUTTON_IDS.BROWSE_ADVENTURE, HERO_BUTTON_IDS.MORE_DETAILS, HERO_BUTTON_IDS.MILEAGE);
  } else if (/xtreme|sporty|performance|fast|160r|125r/.test(q)) {
    picks.push(HERO_BUTTON_IDS.BROWSE_SPORTY, HERO_BUTTON_IDS.MORE_DETAILS, HERO_BUTTON_IDS.COMPARE);
  } else if (/splendor|hf |deluxe|commut|office|daily/.test(q)) {
    picks.push(HERO_BUTTON_IDS.BROWSE_COMMUTER, HERO_BUTTON_IDS.MILEAGE, HERO_BUTTON_IDS.MORE_DETAILS);
  } else if (/glamour/.test(q)) {
    picks.push(HERO_BUTTON_IDS.MORE_DETAILS, HERO_BUTTON_IDS.MILEAGE, HERO_BUTTON_IDS.COMPARE);
  } else {
    picks.push(HERO_BUTTON_IDS.MORE_DETAILS, HERO_BUTTON_IDS.MILEAGE, HERO_BUTTON_IDS.COMPARE);
  }

  return picks;
}

export function suggestHeroButtonsForQuestion(
  question: string,
  excludeButtonId?: string,
): Array<{ id: string; title: string }> {
  const excludeIds = excludeButtonId ? [excludeButtonId] : [];
  return buildHeroButtonRow(collectHeroButtonCandidates(question), excludeIds);
}

export function buildHeroNearMissResponse(question: string, excludeButtonId?: string): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(buildHeroNearMissReply(question)),
    buttons: suggestHeroButtonsForQuestion(question, excludeButtonId),
  };
}

export function buildHeroNearMissAllowList(): NearMissAllowList {
  return {
    topics: [
      { label: 'Commuter bikes', detail: 'HF 100, Splendor+, Super Splendor, Glamour' },
      { label: 'Sporty bikes', detail: 'Xtreme 125R, Xtreme 160R, Glamour X' },
      { label: 'Adventure bikes', detail: 'Xpulse 210' },
      { label: 'Mileage & price', detail: 'Claimed mileage and ex-showroom pricing' },
      { label: 'Compare models', detail: 'Splendor vs Xtreme and similar' },
      { label: 'Get city quote', detail: 'On-road price for your city' },
    ],
    owners: [],
  };
}

export function buildHeroNearMissReply(_question: string): string {
  return (
    `I don't have exact details for that in the Hero catalogue yet.\n\n` +
    `Try asking about mileage, budget commuters, Splendor vs Xtreme, or a specific model.\n\n` +
    `Or tap below for a city quote — I'll connect you with our team.`
  );
}

export function lastHeroUserQuestion(turns: Array<{ role: string; content: string }>): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]?.role === 'user' && turns[i]?.content.trim()) {
      return turns[i]!.content.trim();
    }
  }
  return '';
}

export function isHeroLeadButton(id: string): boolean {
  return HERO_LEAD_BUTTON_IDS.has(id.trim().toLowerCase());
}

export function heroLeadIntentFromButton(id: string): 'quote' | 'test_ride' {
  return id.trim().toLowerCase() === HERO_BUTTON_IDS.TEST_RIDE ? 'test_ride' : 'quote';
}

export function heroActionQuery(actionId: string, contextQuestion: string): string | undefined {
  const ctx = contextQuestion.trim() || 'Hero motorcycle purchase';
  const key = actionId.trim().toLowerCase();

  if (HERO_MODEL_QUERIES[key]) return HERO_MODEL_QUERIES[key];

  switch (key) {
    case HERO_BUTTON_IDS.MORE_DETAILS:
      return `Detailed specifications and features for: ${ctx}`;
    case HERO_BUTTON_IDS.MILEAGE:
      return `Mileage and ex-showroom price for: ${ctx}`;
    case HERO_BUTTON_IDS.COMPARE:
      return ctx.includes('compare') || ctx.includes(' vs ')
        ? ctx
        : `Compare Hero motorcycles for: ${ctx}`;
    case HERO_BUTTON_IDS.BROWSE_COMMUTER:
      return 'Best Hero commuter motorcycles for daily office commute mileage budget HF Splendor Super Splendor Glamour';
    case HERO_BUTTON_IDS.BROWSE_SPORTY:
      return 'Hero sporty motorcycles Xtreme 125R Xtreme 160R Glamour X performance features';
    case HERO_BUTTON_IDS.BROWSE_ADVENTURE:
      return 'Hero Xpulse 210 adventure motorcycle specifications price features';
    default:
      return undefined;
  }
}

export function heroCannedMenuResponse(id: string): BotResponse | undefined {
  const key = id.trim().toLowerCase();

  if (key === HERO_BUTTON_IDS.BROWSE_COMMUTER) {
    return {
      mode: 'list',
      text: formatWhatsAppText('*Hero commuter range*\n\nPick a model to explore specs, mileage & price.'),
      buttonTitle: 'Commuter models',
      sections: [
        {
          title: 'Commuter',
          rows: [
            { id: HERO_BUTTON_IDS.MODEL_HF100, title: 'HF 100', description: 'Budget everyday commute' },
            { id: HERO_BUTTON_IDS.MODEL_HF_DELUXE, title: 'HF Deluxe', description: 'Fuel-efficient commuter' },
            { id: HERO_BUTTON_IDS.MODEL_SPLENDOR, title: 'Splendor+', description: 'High-mileage daily ride' },
            { id: HERO_BUTTON_IDS.MODEL_SPLENDOR_XTEC, title: 'Splendor+ XTEC', description: 'Connected commuter' },
            { id: HERO_BUTTON_IDS.MODEL_SUPER_SPLENDOR, title: 'Super Splendor', description: '125cc comfort commuter' },
            { id: HERO_BUTTON_IDS.MODEL_GLAMOUR, title: 'Glamour', description: 'Stylish 125cc commuter' },
          ],
        },
      ],
    };
  }

  if (key === HERO_BUTTON_IDS.BROWSE_SPORTY) {
    return {
      mode: 'list',
      text: formatWhatsAppText('*Hero sporty range*\n\nPerformance-focused 125cc & 160cc options.'),
      buttonTitle: 'Sporty models',
      sections: [
        {
          title: 'Sporty',
          rows: [
            { id: HERO_BUTTON_IDS.MODEL_XTREME_125R, title: 'Xtreme 125R', description: 'Sporty 125cc commuter' },
            { id: HERO_BUTTON_IDS.MODEL_XTREME_160R, title: 'Xtreme 160R', description: 'Street performance 160cc' },
            { id: HERO_BUTTON_IDS.MODEL_GLAMOUR_X, title: 'Glamour X', description: 'Smart sporty commuter' },
          ],
        },
      ],
    };
  }

  if (key === HERO_BUTTON_IDS.BROWSE_ADVENTURE) {
    return {
      mode: 'buttons',
      text: formatWhatsAppText(
        '*Hero adventure*\n\n' +
          '*Xpulse 210* — adventure-oriented 210cc for touring and rougher roads.\n\n' +
          'Tap below for full specs & Delhi pricing, or get a city quote.',
      ),
      buttons: [
        { id: HERO_BUTTON_IDS.MODEL_XPULSE, title: 'Xpulse 210 details' },
        { id: HERO_BUTTON_IDS.GET_QUOTE, title: 'Get city quote' },
        { id: HERO_BUTTON_IDS.COMPARE, title: 'Compare bikes' },
      ],
    };
  }

  return undefined;
}

const HERO_MENU_ALIASES: Record<string, string> = {
  'get city quote': HERO_BUTTON_IDS.GET_QUOTE,
  'get quote': HERO_BUTTON_IDS.GET_QUOTE,
  'city quote': HERO_BUTTON_IDS.GET_QUOTE,
  'book test ride': HERO_BUTTON_IDS.TEST_RIDE,
  'test ride': HERO_BUTTON_IDS.TEST_RIDE,
  'commuter bikes': HERO_BUTTON_IDS.BROWSE_COMMUTER,
  'sporty bikes': HERO_BUTTON_IDS.BROWSE_SPORTY,
  adventure: HERO_BUTTON_IDS.BROWSE_ADVENTURE,
  'compare bikes': HERO_BUTTON_IDS.COMPARE,
  'mileage & price': HERO_BUTTON_IDS.MILEAGE,
  'more details': HERO_BUTTON_IDS.MORE_DETAILS,
  'xpulse 210 details': HERO_BUTTON_IDS.MODEL_XPULSE,
};

export function resolveHeroMenuSelection(input: string): string {
  const key = input.trim().toLowerCase();
  if (key === HERO_BUTTON_IDS.TYPE_QUESTION || key === 'ask anything' || key === 'hero_ask') {
    return HERO_BUTTON_IDS.TYPE_QUESTION;
  }
  if (key === HERO_BUTTON_IDS.MAIN_MENU || key === 'main menu' || key === 'menu') {
    return HERO_BUTTON_IDS.MAIN_MENU;
  }
  return HERO_MENU_ALIASES[key] ?? input;
}

export function looksLikeHeroMenuChoice(text: string): boolean {
  const key = text.trim().toLowerCase();
  if (!key) return false;
  if (key.startsWith('hero_')) return true;
  return key in HERO_MENU_ALIASES;
}
