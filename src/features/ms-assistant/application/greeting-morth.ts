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
  OWNERSHIP: 'morth_ownership',
  STATE_TRANSFER: 'morth_state_transfer',
  LINKS: 'morth_links',
} as const;

const MORTH_MENU_ALIASES: Record<string, string> = {
  'pay traffic challan': MORTH_BUTTON_IDS.CHALLAN,
  'pay challan': MORTH_BUTTON_IDS.CHALLAN,
  'traffic challan': MORTH_BUTTON_IDS.CHALLAN,
  'apply for noc': MORTH_BUTTON_IDS.NOC,
  noc: MORTH_BUTTON_IDS.NOC,
  'duplicate rc': MORTH_BUTTON_IDS.DUPLICATE_RC,
  'lost rc': MORTH_BUTTON_IDS.DUPLICATE_RC,
  'transfer ownership': MORTH_BUTTON_IDS.OWNERSHIP,
  'transfer of ownership': MORTH_BUTTON_IDS.OWNERSHIP,
  'state transfer': MORTH_BUTTON_IDS.STATE_TRANSFER,
  'interstate transfer': MORTH_BUTTON_IDS.STATE_TRANSFER,
  'official portals': MORTH_BUTTON_IDS.LINKS,
  'official links': MORTH_BUTTON_IDS.LINKS,
  portals: MORTH_BUTTON_IDS.LINKS,
};

export function buildMorthWelcomeResponse(): BotResponse {
  return {
    mode: 'list',
    text: formatWhatsAppText(
      `${WA_EMOJI.welcome} *MoRTH / Parivahan Assistant*\n\n` +
        'Help with challan payment, NOC, RC, ownership transfer, and interstate vehicle moves.\n\n' +
        'Pick a service below or ask your question.\n' +
        'Type *menu* anytime.',
    ),
    buttonTitle: 'Services',
    sections: [
      {
        title: 'Citizen services',
        rows: [
          {
            id: MORTH_BUTTON_IDS.CHALLAN,
            title: 'Pay traffic challan',
            description: 'Check pending & pay online',
          },
          {
            id: MORTH_BUTTON_IDS.NOC,
            title: 'Apply for NOC',
            description: 'Move vehicle to another state',
          },
          {
            id: MORTH_BUTTON_IDS.DUPLICATE_RC,
            title: 'Duplicate RC',
            description: 'Lost registration certificate',
          },
          {
            id: MORTH_BUTTON_IDS.OWNERSHIP,
            title: 'Transfer ownership',
            description: 'After selling your vehicle',
          },
          {
            id: MORTH_BUTTON_IDS.STATE_TRANSFER,
            title: 'State transfer guide',
            description: 'Interstate relocation steps',
          },
          {
            id: MORTH_BUTTON_IDS.LINKS,
            title: 'Official portals',
            description: 'Parivahan, Vahan, eChallan',
          },
          {
            id: MORTH_BUTTON_IDS.TYPE_QUESTION,
            title: 'Ask anything',
            description: 'Free-text question',
          },
        ],
      },
    ],
  };
}

export function buildMorthAskPromptResponse(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      `${WA_EMOJI.tip} Ask about MoRTH / Parivahan services — e.g. pay challan, get NOC, duplicate RC, transfer ownership, or move vehicle to another state.`,
    ),
    buttons: [
      { id: MORTH_BUTTON_IDS.CHALLAN, title: 'Pay challan' },
      { id: MORTH_BUTTON_IDS.NOC, title: 'Apply NOC' },
      { id: MORTH_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

export function buildMorthMenuNudgeResponse(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(`${WA_EMOJI.tip} Pick a service from the menu or type your question.`),
    buttons: [
      { id: MORTH_BUTTON_IDS.CHALLAN, title: 'Pay challan' },
      { id: MORTH_BUTTON_IDS.NOC, title: 'Apply NOC' },
      { id: MORTH_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
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
      { label: 'Transfer ownership', detail: 'RC transfer after vehicle sale' },
      { label: 'State transfer', detail: 'Interstate relocation and re-registration' },
      { label: 'Official portals', detail: 'Parivahan, Vahan, eChallan links' },
    ],
    owners: [],
  };
}

export function buildMorthNearMissReply(question: string): string {
  const q = question.toLowerCase();
  const picks: string[] = [];

  if (/challan|fine|ticket|echallan/.test(q)) picks.push('Pay traffic challan');
  if (/noc|no objection|another state|interstate|relocate/.test(q)) picks.push('Apply for NOC / State transfer');
  if (/duplicate|lost rc|registration certificate/.test(q)) picks.push('Duplicate RC');
  if (/ownership|sell|buyer|seller|transfer rc/.test(q)) picks.push('Transfer ownership');
  if (/portal|parivahan|vahan|link|website/.test(q)) picks.push('Official portals');

  if (picks.length === 0) {
    picks.push('Pay traffic challan', 'Apply for NOC', 'Transfer ownership');
  }

  const unique = [...new Set(picks)].slice(0, 3);
  return (
    `I couldn't find an exact match for that.\n\n` +
    `Try one of these services:\n` +
    unique.map((p) => `* ${p}`).join('\n') +
    `\n\nType *menu* to see all options.`
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
  if (key.startsWith('morth_')) return true;
  return (
    key === 'pay traffic challan' ||
    key === 'pay challan' ||
    key === 'apply for noc' ||
    key === 'duplicate rc' ||
    key === 'transfer ownership' ||
    key === 'state transfer guide' ||
    key === 'official portals' ||
    key === 'ask anything' ||
    key === 'ask again' ||
    key === 'main menu'
  );
}

export function morthKeywordRoute(text: string): string | undefined {
  const q = text.toLowerCase();
  if (/challan|echallan|traffic fine/.test(q)) return MORTH_BUTTON_IDS.CHALLAN;
  if (/\bnoc\b|no objection/.test(q)) return MORTH_BUTTON_IDS.NOC;
  if (/duplicate rc|lost rc|lost registration/.test(q)) return MORTH_BUTTON_IDS.DUPLICATE_RC;
  if (/transfer ownership|sell.*vehicle|sold.*car|transfer rc/.test(q)) return MORTH_BUTTON_IDS.OWNERSHIP;
  if (/another state|interstate|state transfer|relocate.*vehicle|re-?registration/.test(q)) {
    return MORTH_BUTTON_IDS.STATE_TRANSFER;
  }
  if (/parivahan|vahan.*portal|official link|mparivahan/.test(q)) return MORTH_BUTTON_IDS.LINKS;
  return undefined;
}
