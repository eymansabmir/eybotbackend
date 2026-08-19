import type { BotResponse } from '../domain/bot-response';
import {
  formatWhatsAppText,
  WA_EMOJI,
} from '../infrastructure/formatter/whatsapp-format';
import type { NearMissAllowList } from '../infrastructure/llm/shared';

export const MORTH_BUTTON_IDS = {
  MAIN_MENU: 'morth_main_menu',
  TYPE_QUESTION: 'morth_ask',
  CHALLAN: 'morth_challan',
  NOC: 'morth_noc',
  DUPLICATE_RC: 'morth_duplicate_rc',
  DUPLICATE_DL: 'morth_duplicate_dl',
  OWNERSHIP: 'morth_ownership',
  STATE_TRANSFER: 'morth_state_transfer',
  RENEW_RC: 'morth_renew_rc',
  TRACK_STATUS: 'morth_track_status',
  HYPOTHECATION: 'morth_hypothecation',
  PUC: 'morth_puc',
  LINKS: 'morth_links',
  STEPS: 'morth_steps',
  DOCUMENTS: 'morth_documents',
  DL_SERVICES: 'morth_dl_services',
  CHANGE_ADDRESS: 'morth_change_address',
  CHANGE_DL_ADDRESS: 'morth_change_dl_address',
  RENEW_LICENSE: 'morth_renew_license',
} as const;

export type MorthAction = {
  id: string;
  title: string;
  hint: string;
};

/** Closed catalog — LLM may only suggest buttons from this list. */
export const MORTH_ACTION_CATALOG: MorthAction[] = [
  { id: MORTH_BUTTON_IDS.STEPS, title: 'Step-by-step', hint: 'Full numbered procedure for the user topic' },
  { id: MORTH_BUTTON_IDS.DOCUMENTS, title: 'Documents needed', hint: 'Documents and information to keep ready' },
  { id: MORTH_BUTTON_IDS.DUPLICATE_RC, title: 'Duplicate RC', hint: 'Lost or damaged registration certificate' },
  { id: MORTH_BUTTON_IDS.DUPLICATE_DL, title: 'Duplicate DL', hint: 'Lost or stolen driving licence' },
  { id: MORTH_BUTTON_IDS.CHANGE_ADDRESS, title: 'Change RC address', hint: 'Update address on vehicle registration' },
  { id: MORTH_BUTTON_IDS.CHANGE_DL_ADDRESS, title: 'Change DL address', hint: 'Update address on driving licence' },
  { id: MORTH_BUTTON_IDS.OWNERSHIP, title: 'Transfer ownership', hint: 'RC transfer after sale' },
  { id: MORTH_BUTTON_IDS.RENEW_RC, title: 'Renew RC', hint: 'Vehicle registration renewal' },
  { id: MORTH_BUTTON_IDS.NOC, title: 'Apply for NOC', hint: 'No Objection Certificate for interstate move' },
  { id: MORTH_BUTTON_IDS.STATE_TRANSFER, title: 'State transfer', hint: 'Move vehicle to another state' },
  { id: MORTH_BUTTON_IDS.CHALLAN, title: 'Pay challan', hint: 'Traffic challan payment on eChallan' },
  { id: MORTH_BUTTON_IDS.RENEW_LICENSE, title: 'Renew license', hint: 'Driving licence renewal on Sarathi' },
  { id: MORTH_BUTTON_IDS.TRACK_STATUS, title: 'Track status', hint: 'DL or RC application status' },
  { id: MORTH_BUTTON_IDS.HYPOTHECATION, title: 'Remove loan/RC', hint: 'Hypothecation termination after loan closure' },
  { id: MORTH_BUTTON_IDS.PUC, title: 'PUC certificate', hint: 'Pollution Under Control certificate' },
  { id: MORTH_BUTTON_IDS.DL_SERVICES, title: 'DL services', hint: 'Driving licence services on Parivahan' },
  { id: MORTH_BUTTON_IDS.LINKS, title: 'Portal links', hint: 'Official Parivahan / Vahan / eChallan URLs' },
];

const MORTH_ACTION_BY_ID = new Map(MORTH_ACTION_CATALOG.map((a) => [a.id, a]));

const MORTH_MENU_ALIASES: Record<string, string> = {
  'pay traffic challan': MORTH_BUTTON_IDS.CHALLAN,
  'pay challan': MORTH_BUTTON_IDS.CHALLAN,
  'traffic challan': MORTH_BUTTON_IDS.CHALLAN,
  'apply for noc': MORTH_BUTTON_IDS.NOC,
  noc: MORTH_BUTTON_IDS.NOC,
  'duplicate rc': MORTH_BUTTON_IDS.DUPLICATE_RC,
  'lost rc': MORTH_BUTTON_IDS.DUPLICATE_RC,
  'duplicate dl': MORTH_BUTTON_IDS.DUPLICATE_DL,
  'lost dl': MORTH_BUTTON_IDS.DUPLICATE_DL,
  'lost driving licence': MORTH_BUTTON_IDS.DUPLICATE_DL,
  'transfer ownership': MORTH_BUTTON_IDS.OWNERSHIP,
  'transfer of ownership': MORTH_BUTTON_IDS.OWNERSHIP,
  'renew rc': MORTH_BUTTON_IDS.RENEW_RC,
  'renew registration': MORTH_BUTTON_IDS.RENEW_RC,
  'state transfer': MORTH_BUTTON_IDS.STATE_TRANSFER,
  'interstate transfer': MORTH_BUTTON_IDS.STATE_TRANSFER,
  'track status': MORTH_BUTTON_IDS.TRACK_STATUS,
  'application status': MORTH_BUTTON_IDS.TRACK_STATUS,
  hypothecation: MORTH_BUTTON_IDS.HYPOTHECATION,
  'remove loan': MORTH_BUTTON_IDS.HYPOTHECATION,
  puc: MORTH_BUTTON_IDS.PUC,
  'official portals': MORTH_BUTTON_IDS.LINKS,
  'official links': MORTH_BUTTON_IDS.LINKS,
  portals: MORTH_BUTTON_IDS.LINKS,
};

export function buildMorthWelcomeResponse(): BotResponse {
  return {
    mode: 'text',
    text: formatWhatsAppText(
      `${WA_EMOJI.welcome} *MoRTH / Parivahan Assistant*\n\n` +
        'Ask me anything in your own words — e.g. *I lost my RC*, *renew my driving licence*, *pay my challan*, or *remove bank from RC*.\n\n' +
        'I will answer and suggest next steps you can tap.',
    ),
  };
}

export function buildMorthAskPromptResponse(): BotResponse {
  return buildMorthWelcomeResponse();
}

export function buildMorthMenuNudgeResponse(): BotResponse {
  return {
    mode: 'text',
    text: formatWhatsAppText(
      `${WA_EMOJI.tip} Type your question about Parivahan / MoRTH — challan, RC, DL, NOC, ownership, renewal, hypothecation, or PUC.`,
    ),
  };
}

export function formatMorthActionsForPrompt(): string {
  return MORTH_ACTION_CATALOG.map((a) => `- id: ${a.id} | title: "${a.title}" | when: ${a.hint}`).join('\n');
}

export function buildMorthLlmExtraInstructions(excludeButtonId?: string): string {
  const excludeNote = excludeButtonId
    ? `\nDo NOT include button id "${excludeButtonId}" — the user already chose that action.\n`
    : '';
  return (
    `\nALLOWED_ACTIONS (pick exactly 2 button ids for slots 1–2 — slot 3 is always DL services):\n` +
    `${formatMorthActionsForPrompt()}\n` +
    excludeNote +
    `\nRespond as JSON only:\n` +
    `{ "mode": "buttons", "text": string, "buttons": [{ "id": string, "title": string }] }\n\n` +
    `Structure the "text" field exactly:\n` +
    `1) First line: one direct sentence answering the user's question.\n` +
    `2) Blank line, then 2–4 sentences or short bullets on how to do it (from retrieved knowledge only).\n` +
    `3) End with: "I can guide you further — choose an option below."\n` +
    `Pick complementary follow-up actions — never repeat what the user just asked for.`
  );
}

const MORTH_BUTTON_FALLBACKS = [
  MORTH_BUTTON_IDS.STEPS,
  MORTH_BUTTON_IDS.LINKS,
  MORTH_BUTTON_IDS.DOCUMENTS,
  MORTH_BUTTON_IDS.TRACK_STATUS,
] as const;

/** Slots 1–2 from candidates; slot 3 is always DL services (or Portal links if DL was excluded). */
export function buildMorthButtonRow(
  candidateIds: string[],
  excludeIds: string[] = [],
): Array<{ id: string; title: string }> {
  const exclude = new Set(excludeIds.filter(Boolean));
  const used = new Set<string>();
  const row: Array<{ id: string; title: string }> = [];

  const tryAdd = (id: string): boolean => {
    if (exclude.has(id) || used.has(id) || id === MORTH_BUTTON_IDS.DL_SERVICES) return false;
    const action = MORTH_ACTION_BY_ID.get(id);
    if (!action) return false;
    row.push({ id: action.id, title: action.title.slice(0, 20) });
    used.add(id);
    return true;
  };

  for (const id of candidateIds) {
    if (row.length >= 2) break;
    tryAdd(id);
  }
  for (const id of MORTH_BUTTON_FALLBACKS) {
    if (row.length >= 2) break;
    tryAdd(id);
  }

  const thirdId = exclude.has(MORTH_BUTTON_IDS.DL_SERVICES)
    ? MORTH_BUTTON_IDS.LINKS
    : MORTH_BUTTON_IDS.DL_SERVICES;
  const third = MORTH_ACTION_BY_ID.get(thirdId);
  if (third) {
    row.push({ id: third.id, title: third.title.slice(0, 20) });
  }

  return row.slice(0, 3);
}

export function enforceMorthBotResponse(
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
    return buildMorthNearMissResponse(question, excludeButtonId);
  }

  const topicCandidates = collectMorthButtonCandidates(question);
  let llmCandidates: string[] = [];

  if (response.mode === 'buttons' && response.buttons?.length) {
    llmCandidates = response.buttons
      .map((b) => MORTH_ACTION_BY_ID.get(b.id.trim())?.id)
      .filter((id): id is string => Boolean(id));
  }

  const buttons = buildMorthButtonRow([...llmCandidates, ...topicCandidates], excludeIds);

  return { mode: 'buttons', text, buttons };
}

function collectMorthButtonCandidates(question: string): string[] {
  const q = question.toLowerCase();
  const picks: string[] = [];

  if (/lost rc|duplicate rc|registration certificate/.test(q)) {
    picks.push(MORTH_BUTTON_IDS.STEPS, MORTH_BUTTON_IDS.DOCUMENTS, MORTH_BUTTON_IDS.DUPLICATE_RC);
  } else if (/lost dl|lost licence|lost license|duplicate dl|duplicate driving/.test(q)) {
    picks.push(MORTH_BUTTON_IDS.STEPS, MORTH_BUTTON_IDS.DOCUMENTS, MORTH_BUTTON_IDS.DUPLICATE_DL);
  } else if (/renew rc|registration expir|rc expir|renew registration/.test(q)) {
    picks.push(MORTH_BUTTON_IDS.STEPS, MORTH_BUTTON_IDS.DOCUMENTS, MORTH_BUTTON_IDS.RENEW_RC);
  } else if (/address.*dl|dl.*address|driving licence.*address/.test(q)) {
    picks.push(MORTH_BUTTON_IDS.STEPS, MORTH_BUTTON_IDS.CHANGE_DL_ADDRESS, MORTH_BUTTON_IDS.LINKS);
  } else if (/address|change address/.test(q)) {
    picks.push(MORTH_BUTTON_IDS.STEPS, MORTH_BUTTON_IDS.CHANGE_ADDRESS, MORTH_BUTTON_IDS.LINKS);
  } else if (/challan|fine|echallan/.test(q)) {
    picks.push(MORTH_BUTTON_IDS.STEPS, MORTH_BUTTON_IDS.CHALLAN, MORTH_BUTTON_IDS.LINKS);
  } else if (/hypothecation|bank name|loan closed|financier|remove loan/.test(q)) {
    picks.push(MORTH_BUTTON_IDS.STEPS, MORTH_BUTTON_IDS.HYPOTHECATION, MORTH_BUTTON_IDS.LINKS);
  } else if (/puc|pollution certificate|pollution under control/.test(q)) {
    picks.push(MORTH_BUTTON_IDS.STEPS, MORTH_BUTTON_IDS.PUC, MORTH_BUTTON_IDS.LINKS);
  } else if (/track|status|where is my|application status/.test(q)) {
    picks.push(MORTH_BUTTON_IDS.TRACK_STATUS, MORTH_BUTTON_IDS.LINKS, MORTH_BUTTON_IDS.STEPS);
  } else if (/noc|another state|interstate|relocate/.test(q)) {
    picks.push(MORTH_BUTTON_IDS.STEPS, MORTH_BUTTON_IDS.NOC, MORTH_BUTTON_IDS.STATE_TRANSFER);
  } else if (/ownership|sell|buyer|transfer rc/.test(q)) {
    picks.push(MORTH_BUTTON_IDS.STEPS, MORTH_BUTTON_IDS.DOCUMENTS, MORTH_BUTTON_IDS.OWNERSHIP);
  } else if (/renew.*licen|renew.*dl|licen.*expir|dl.*expir|driving licen/.test(q)) {
    picks.push(MORTH_BUTTON_IDS.STEPS, MORTH_BUTTON_IDS.RENEW_LICENSE, MORTH_BUTTON_IDS.DL_SERVICES);
  } else if (/step by step|step-by-step/.test(q)) {
    picks.push(MORTH_BUTTON_IDS.DOCUMENTS, MORTH_BUTTON_IDS.LINKS, MORTH_BUTTON_IDS.TRACK_STATUS);
  } else if (/documents|information required/.test(q)) {
    picks.push(MORTH_BUTTON_IDS.STEPS, MORTH_BUTTON_IDS.LINKS, MORTH_BUTTON_IDS.TRACK_STATUS);
  } else {
    picks.push(MORTH_BUTTON_IDS.STEPS, MORTH_BUTTON_IDS.DOCUMENTS, MORTH_BUTTON_IDS.LINKS);
  }

  return picks;
}

export function suggestMorthButtonsForQuestion(
  question: string,
  excludeButtonId?: string,
): Array<{ id: string; title: string }> {
  const excludeIds = excludeButtonId ? [excludeButtonId] : [];
  return buildMorthButtonRow(collectMorthButtonCandidates(question), excludeIds);
}

export function buildMorthNearMissResponse(question: string, excludeButtonId?: string): BotResponse {
  const text = buildMorthNearMissReply(question);
  return {
    mode: 'buttons',
    text: formatWhatsAppText(text),
    buttons: suggestMorthButtonsForQuestion(question, excludeButtonId),
  };
}

export function morthActionQuery(actionId: string, contextQuestion: string): string | undefined {
  const ctx = contextQuestion.trim() || 'Parivahan citizen service';
  switch (actionId) {
    case MORTH_BUTTON_IDS.STEPS:
      return `Step by step guide for: ${ctx}`;
    case MORTH_BUTTON_IDS.DOCUMENTS:
      return `Documents and information required for: ${ctx}`;
    case MORTH_BUTTON_IDS.DL_SERVICES:
      return 'Driving licence services on Parivahan portal';
    case MORTH_BUTTON_IDS.RENEW_LICENSE:
      return 'Driving licence renewal process Sarathi Parivahan steps documents';
    case MORTH_BUTTON_IDS.DUPLICATE_DL:
      return 'Duplicate driving licence lost DL Sarathi Parivahan steps';
    case MORTH_BUTTON_IDS.CHANGE_ADDRESS:
      return 'Change address on vehicle registration RC Vahan steps';
    case MORTH_BUTTON_IDS.CHANGE_DL_ADDRESS:
      return 'Change address on driving licence Sarathi Parivahan steps';
    case MORTH_BUTTON_IDS.RENEW_RC:
      return 'Renew vehicle registration RC VAHAN steps documents';
    case MORTH_BUTTON_IDS.TRACK_STATUS:
      return ctx.includes('dl') || ctx.includes('licen')
        ? 'Check driving licence application status Sarathi Parivahan'
        : 'Check RC VAHAN application status track vehicle application';
    case MORTH_BUTTON_IDS.HYPOTHECATION:
      return 'Termination of hypothecation remove bank from RC after loan closed VAHAN';
    case MORTH_BUTTON_IDS.PUC:
      return 'Pollution Under Control PUC certificate vehicle requirements';
    default:
      return undefined;
  }
}

export function lastMorthUserQuestion(
  turns: Array<{ role: string; content: string }>,
): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]?.role === 'user' && turns[i]?.content.trim()) {
      return turns[i]!.content.trim();
    }
  }
  return '';
}

export function buildMorthAnswerWithNav(text: string): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(text),
    buttons: [
      { id: MORTH_BUTTON_IDS.LINKS, title: 'Portal links' },
      { id: MORTH_BUTTON_IDS.TYPE_QUESTION, title: 'Ask again' },
      { id: MORTH_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

function withNav(text: string, buttons: Array<{ id: string; title: string }>): BotResponse {
  return { mode: 'buttons', text: formatWhatsAppText(text), buttons };
}

export function morthCannedMenuResponse(id: string): BotResponse | undefined {
  const key = id.trim().toLowerCase();

  switch (key) {
    case MORTH_BUTTON_IDS.CHALLAN:
      return withNav(
        '*Pay a traffic challan*\n\n' +
          '*Portal:* eChallan — https://echallan.parivahan.gov.in/challan/challan-services\n\n' +
          '*Steps:*\n' +
          '1. Open eChallan → *Check Pending Challan Status*\n' +
          '2. Search by vehicle number, challan number, or DL number\n' +
          '3. Review pending challans\n' +
          '4. Select challan → complete payment\n' +
          '5. Download / print receipt\n\n' +
          '*If payment succeeded but no receipt:*\n' +
          '* Check Pending Transaction\n' +
          '* Download Payment Receipt\n' +
          '* Raise Grievance on the eChallan portal',
        [
          { id: MORTH_BUTTON_IDS.LINKS, title: 'Portal links' },
          { id: MORTH_BUTTON_IDS.TYPE_QUESTION, title: 'Ask again' },
          { id: MORTH_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
        ],
      );
    case MORTH_BUTTON_IDS.NOC:
      return withNav(
        '*Apply for vehicle NOC*\n\n' +
          '*When:* Moving vehicle permanently to another state.\n\n' +
          '*Portal:* Vahan — https://vahan.parivahan.gov.in/vahanservice/vahan/\n\n' +
          '*Steps:*\n' +
          '1. Open Vahan Citizen Services\n' +
          '2. Enter vehicle registration number → Proceed\n' +
          '3. Select *Vehicle Related Services* → *NOC*\n' +
          '4. Complete application details\n' +
          '5. Upload documents if requested\n' +
          '6. Pay applicable fee\n' +
          '7. Track status online\n\n' +
          '*Output:* NOC application reference → NOC approval (after RTO verification)',
        [
          { id: MORTH_BUTTON_IDS.STATE_TRANSFER, title: 'State transfer' },
          { id: MORTH_BUTTON_IDS.LINKS, title: 'Portal links' },
          { id: MORTH_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
        ],
      );
    case MORTH_BUTTON_IDS.DUPLICATE_RC:
      return withNav(
        '*Apply for duplicate RC*\n\n' +
          '*Portal:* Vahan — https://vahan.parivahan.gov.in/vahanservice/vahan/\n\n' +
          '*Steps:*\n' +
          '1. Open Vahan Citizen Services\n' +
          '2. Enter registration number → Proceed\n' +
          '3. Select *Basic Services*\n' +
          '4. Enter last 5 digits of chassis number → Validate\n' +
          '5. Generate OTP → submit OTP\n' +
          '6. Select *Duplicate RC*\n' +
          '7. Fill service details & update insurance\n' +
          '8. Review fee → Submit application',
        [
          { id: MORTH_BUTTON_IDS.LINKS, title: 'Portal links' },
          { id: MORTH_BUTTON_IDS.TYPE_QUESTION, title: 'Ask again' },
          { id: MORTH_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
        ],
      );
    case MORTH_BUTTON_IDS.OWNERSHIP:
      return withNav(
        '*Transfer vehicle ownership*\n\n' +
          '*When:* After selling the vehicle.\n\n' +
          '*Portal:* Vahan — https://vahan.parivahan.gov.in/vahanservice/vahan/\n\n' +
          '*Steps:*\n' +
          '1. Open Vahan Citizen Services\n' +
          '2. Enter registration number → Proceed\n' +
          '3. Select *Basic Services*\n' +
          '4. Enter last 5 chassis digits → Validate\n' +
          '5. Generate OTP → enter OTP\n' +
          '6. Select *Transfer Of Ownership*\n' +
          '7. Enter service details & update insurance\n' +
          '8. Submit application\n\n' +
          '*Note:* Seller initiates; buyer completes subsequent steps.\n\n' +
          '*Keep ready:* Reg. number, chassis number, mobile OTP, insurance details',
        [
          { id: MORTH_BUTTON_IDS.LINKS, title: 'Portal links' },
          { id: MORTH_BUTTON_IDS.TYPE_QUESTION, title: 'Ask again' },
          { id: MORTH_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
        ],
      );
    case MORTH_BUTTON_IDS.STATE_TRANSFER:
      return withNav(
        '*Transfer vehicle to another state*\n\n' +
          '*Overview:*\n' +
          '1. Apply for *NOC* from current RTO\n' +
          '2. Move vehicle to destination state\n' +
          '3. Apply for *re-registration* on Vahan\n' +
          '4. Update address details\n' +
          '5. Pay applicable taxes & fees\n' +
          '6. Obtain updated registration\n\n' +
          '*Related services:* NOC, change of address, tax, registration\n\n' +
          '*Portals:*\n' +
          '* https://parivahan.gov.in\n' +
          '* https://vahan.parivahan.gov.in',
        [
          { id: MORTH_BUTTON_IDS.NOC, title: 'Apply NOC' },
          { id: MORTH_BUTTON_IDS.LINKS, title: 'Portal links' },
          { id: MORTH_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
        ],
      );
    case MORTH_BUTTON_IDS.LINKS:
      return withNav(
        '*Official government portals*\n\n' +
          '*Parivahan* — https://parivahan.gov.in\n' +
          'Central citizen transport services\n\n' +
          '*Vahan* — https://vahan.parivahan.gov.in\n' +
          'Registration, NOC, ownership, duplicate RC\n\n' +
          '*eChallan* — https://echallan.parivahan.gov.in\n' +
          'Traffic challan search & payment\n\n' +
          '*mParivahan* — https://mparivahan.parivahan.gov.in\n' +
          'Mobile citizen transport services',
        [
          { id: MORTH_BUTTON_IDS.CHALLAN, title: 'Pay challan' },
          { id: MORTH_BUTTON_IDS.NOC, title: 'Apply NOC' },
          { id: MORTH_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
        ],
      );
    default:
      return undefined;
  }
}

export function buildMorthNearMissAllowList(): NearMissAllowList {
  return {
    topics: [
      { label: 'Pay traffic challan', detail: 'eChallan pending status and payment' },
      { label: 'Apply for NOC', detail: 'No Objection Certificate for interstate move' },
      { label: 'Duplicate RC', detail: 'Lost registration certificate replacement' },
      { label: 'Duplicate DL', detail: 'Lost driving licence replacement' },
      { label: 'Renew driving licence', detail: 'DL renewal on Sarathi Parivahan' },
      { label: 'Renew RC', detail: 'Vehicle registration renewal on VAHAN' },
      { label: 'Transfer ownership', detail: 'RC transfer after vehicle sale' },
      { label: 'State transfer', detail: 'Interstate relocation and re-registration' },
      { label: 'Hypothecation removal', detail: 'Remove bank name from RC after loan closure' },
      { label: 'Track application status', detail: 'DL or RC application status on Parivahan' },
      { label: 'Official portals', detail: 'Parivahan, Vahan, eChallan links' },
    ],
    owners: [],
  };
}

export function buildMorthNearMissReply(_question: string): string {
  return (
    `I don't have exact details for that yet.\n\n` +
    `You can ask about challan payment, lost RC/DL, NOC, ownership transfer, RC/DL renewal, hypothecation removal, PUC, or application status.\n\n` +
    `Try rephrasing your question, or tap an option below.`
  );
}

export function resolveMorthMenuSelection(input: string): string {
  const key = input.trim().toLowerCase();
  if (key === MORTH_BUTTON_IDS.TYPE_QUESTION || key === 'ask anything' || key === 'morth_ask' || key === 'ask again') {
    return MORTH_BUTTON_IDS.TYPE_QUESTION;
  }
  if (key === MORTH_BUTTON_IDS.MAIN_MENU || key === 'main menu' || key === 'menu') {
    return MORTH_BUTTON_IDS.MAIN_MENU;
  }
  return MORTH_MENU_ALIASES[key] ?? input;
}

export function looksLikeMorthMenuChoice(text: string): boolean {
  const key = text.trim().toLowerCase();
  if (!key) return false;
  // Only treat explicit button ids / taps as menu — not natural-language questions.
  if (key.startsWith('morth_')) return true;
  return false;
}
