import type { BotResponse } from '../domain/bot-response';
import {
  formatWhatsAppText,
  WA_EMOJI,
} from '../infrastructure/formatter/whatsapp-format';
import type { NearMissAllowList } from '../infrastructure/llm/shared';

export const HONDA_BUTTON_IDS = {
  MAIN_MENU: 'honda_main_menu',
  TYPE_QUESTION: 'honda_ask',
  SPECS: 'honda_specs',
  SERVICE: 'honda_service',
  TROUBLESHOOT: 'honda_troubleshoot',
  PARTS: 'honda_parts',
  SELF_START: 'honda_self_start',
  SS_Q1_YES: 'honda_ss_q1_yes',
  SS_Q1_NO: 'honda_ss_q1_no',
  SS_Q2_YES: 'honda_ss_q2_yes',
  SS_Q2_NO: 'honda_ss_q2_no',
  SS_Q3_YES: 'honda_ss_q3_yes',
  SS_Q3_NO: 'honda_ss_q3_no',
  TS_NO_START: 'honda_ts_no_start',
  TS_PICKUP: 'honda_ts_pickup',
  TS_MILEAGE: 'honda_ts_mileage',
} as const;

const HONDA_SELF_START_IDS = new Set<string>([
  HONDA_BUTTON_IDS.SELF_START,
  HONDA_BUTTON_IDS.SS_Q1_YES,
  HONDA_BUTTON_IDS.SS_Q1_NO,
  HONDA_BUTTON_IDS.SS_Q2_YES,
  HONDA_BUTTON_IDS.SS_Q2_NO,
  HONDA_BUTTON_IDS.SS_Q3_YES,
  HONDA_BUTTON_IDS.SS_Q3_NO,
  'self start help',
]);

const HONDA_MENU_ALIASES: Record<string, string> = {
  'vehicle specs': HONDA_BUTTON_IDS.SPECS,
  'service schedule': HONDA_BUTTON_IDS.SERVICE,
  troubleshooting: HONDA_BUTTON_IDS.TROUBLESHOOT,
  'parts & consumables': HONDA_BUTTON_IDS.PARTS,
  'self start not working': HONDA_BUTTON_IDS.SELF_START,
  'self start help': HONDA_BUTTON_IDS.SELF_START,
};

export function buildHondaWelcomeResponse(): BotResponse {
  return {
    mode: 'list',
    text: formatWhatsAppText(
      `${WA_EMOJI.welcome} *Honda Activa 6G — Workshop Assistant*\n\n` +
        'Quick specs, service intervals, parts, and fault-finding for the bay.\n\n' +
        'Pick a topic below or ask a workshop question.\n' +
        'Type *menu* anytime.',
    ),
    buttonTitle: 'Workshop menu',
    sections: [
      {
        title: 'Activa 6G',
        rows: [
          {
            id: HONDA_BUTTON_IDS.SELF_START,
            title: 'Self start not working',
            description: 'Step-by-step diagnosis',
          },
          {
            id: HONDA_BUTTON_IDS.TROUBLESHOOT,
            title: 'Other faults',
            description: 'Pickup, mileage, no start',
          },
          {
            id: HONDA_BUTTON_IDS.SPECS,
            title: 'Vehicle specs',
            description: 'Engine, CVT, tyres, brakes',
          },
          {
            id: HONDA_BUTTON_IDS.SERVICE,
            title: 'Service schedule',
            description: 'Km / month intervals',
          },
          {
            id: HONDA_BUTTON_IDS.PARTS,
            title: 'Parts & oil',
            description: 'Consumables & change km',
          },
          {
            id: HONDA_BUTTON_IDS.TYPE_QUESTION,
            title: 'Ask anything',
            description: 'Free-text workshop query',
          },
        ],
      },
    ],
  };
}

export function buildHondaAskPromptResponse(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      `${WA_EMOJI.tip} Type your workshop question — e.g. oil grade, first service km, CVT belt change km, brake shoe steps.`,
    ),
    buttons: [
      { id: HONDA_BUTTON_IDS.SELF_START, title: 'Self start help' },
      { id: HONDA_BUTTON_IDS.TROUBLESHOOT, title: 'Other faults' },
      { id: HONDA_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

export function buildHondaMenuNudgeResponse(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(`${WA_EMOJI.tip} Pick from the workshop menu or type your fault / question.`),
    buttons: [
      { id: HONDA_BUTTON_IDS.SELF_START, title: 'Self start help' },
      { id: HONDA_BUTTON_IDS.TROUBLESHOOT, title: 'Other faults' },
      { id: HONDA_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

export function buildHondaAnswerWithNav(text: string): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(text),
    buttons: [
      { id: HONDA_BUTTON_IDS.SELF_START, title: 'Self start help' },
      { id: HONDA_BUTTON_IDS.TROUBLESHOOT, title: 'Other faults' },
      { id: HONDA_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

export function buildHondaSelfStartQ1(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      '*Self start fault — Step 1 of 3*\n\n' +
        'With ignition ON, press the horn.\n\n' +
        '*Is the horn working?*',
    ),
    buttons: [
      { id: HONDA_BUTTON_IDS.SS_Q1_YES, title: 'Yes' },
      { id: HONDA_BUTTON_IDS.SS_Q1_NO, title: 'No' },
      { id: HONDA_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

export function buildHondaSelfStartQ2(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      '*Self start fault — Step 2 of 3*\n\n' +
        'Switch on the headlamp and check brightness.\n\n' +
        '*Is headlamp brightness normal?*',
    ),
    buttons: [
      { id: HONDA_BUTTON_IDS.SS_Q2_YES, title: 'Yes' },
      { id: HONDA_BUTTON_IDS.SS_Q2_NO, title: 'No' },
      { id: HONDA_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

export function buildHondaSelfStartQ3(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      '*Self start fault — Step 3 of 3*\n\n' +
        'Press the self-start button and listen near the relay.\n\n' +
        '*Do you hear the starter relay click?*',
    ),
    buttons: [
      { id: HONDA_BUTTON_IDS.SS_Q3_YES, title: 'Yes' },
      { id: HONDA_BUTTON_IDS.SS_Q3_NO, title: 'No' },
      { id: HONDA_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

function selfStartDiagnosis(text: string): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(text),
    buttons: [
      { id: HONDA_BUTTON_IDS.SELF_START, title: 'Run again' },
      { id: HONDA_BUTTON_IDS.TROUBLESHOOT, title: 'More checks' },
      { id: HONDA_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

export function hondaSelfStartResponse(id: string): BotResponse | undefined {
  const key = id.trim().toLowerCase();
  switch (key) {
    case HONDA_BUTTON_IDS.SELF_START:
    case 'self start help':
      return buildHondaSelfStartQ1();
    case HONDA_BUTTON_IDS.SS_Q1_YES:
      return buildHondaSelfStartQ2();
    case HONDA_BUTTON_IDS.SS_Q1_NO:
      return selfStartDiagnosis(
        '*Diagnosis — horn not working*\n\n' +
          '*Likely cause:* Weak or dead battery (3.0 Ah).\n\n' +
          '*Do now:*\n' +
          '* Measure resting voltage — should be ~12.6 V\n' +
          '* Load-test or charge battery\n' +
          '* Clean terminals; check earth\n' +
          '* Replace if below spec or over 2–3 years old',
      );
    case HONDA_BUTTON_IDS.SS_Q2_YES:
      return buildHondaSelfStartQ3();
    case HONDA_BUTTON_IDS.SS_Q2_NO:
      return selfStartDiagnosis(
        '*Diagnosis — dim headlamp*\n\n' +
          '*Likely cause:* Weak battery — not holding charge under load.\n\n' +
          '*Do now:*\n' +
          '* Check voltage with headlamp ON\n' +
          '* Charge or replace 3.0 Ah battery\n' +
          '* Inspect charging system output after start',
      );
    case HONDA_BUTTON_IDS.SS_Q3_YES:
      return selfStartDiagnosis(
        '*Diagnosis — relay clicks, no crank*\n\n' +
          '*Likely cause:* Starter motor fault or starter wiring issue.\n\n' +
          '*Do now:*\n' +
          '* Check battery voltage under crank (>9 V)\n' +
          '* Inspect starter motor terminals & earth\n' +
          '* Tap-test starter; bench test if needed\n' +
          '* Also verify spark, fuel, compression if crank is weak',
      );
    case HONDA_BUTTON_IDS.SS_Q3_NO:
      return selfStartDiagnosis(
        '*Diagnosis — no relay click*\n\n' +
          '*Likely cause:* Relay failure, blown fuse, or ignition switch fault.\n\n' +
          '*Do now:*\n' +
          '* Check main fuse / starter circuit fuse\n' +
          '* Test starter relay — swap or bypass carefully\n' +
          '* Inspect ignition switch & self-start wiring\n' +
          '* Confirm battery voltage at relay coil',
      );
    default:
      return undefined;
  }
}

export function buildHondaTroubleshootMenu(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText('*Which fault are you working on?*'),
    buttons: [
      { id: HONDA_BUTTON_IDS.TS_NO_START, title: 'No start' },
      { id: HONDA_BUTTON_IDS.TS_PICKUP, title: 'Poor pickup' },
      { id: HONDA_BUTTON_IDS.TS_MILEAGE, title: 'Low mileage' },
    ],
  };
}

export function hondaCannedMenuResponse(id: string): BotResponse | undefined {
  const key = id.trim().toLowerCase();

  const selfStart = hondaSelfStartResponse(key);
  if (selfStart) return selfStart;

  switch (key) {
    case HONDA_BUTTON_IDS.TROUBLESHOOT:
    case 'other faults':
      return buildHondaTroubleshootMenu();
    case HONDA_BUTTON_IDS.TS_NO_START:
      return {
        mode: 'buttons',
        text: formatWhatsAppText(
          '*No start / self start fault*\n\n' +
            '*Symptoms:* Self start dead, kick hard, cranks but no fire.\n\n' +
            '*Check in this order:*\n' +
            '1. Battery voltage & terminals\n' +
            '2. Fuse\n' +
            '3. Spark plug condition\n' +
            '4. Fuel supply / injector\n' +
            '5. Spark at plug\n' +
            '6. Compression\n' +
            '7. Valve clearance\n\n' +
            'Use *Self start help* for the horn → headlamp → relay tree.',
        ),
        buttons: [
          { id: HONDA_BUTTON_IDS.SELF_START, title: 'Self start tree' },
          { id: HONDA_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
        ],
      };
    case HONDA_BUTTON_IDS.TS_PICKUP:
      return buildHondaAnswerWithNav(
        '*Poor pickup*\n\n' +
          '*Check:*\n' +
          '* Air filter — clean / replace (12,000 km)\n' +
          '* CVT belt & rollers — wear, glazing (inspect 6,000–8,000 km)\n' +
          '* Throttle body — carbon deposits\n' +
          '* Fuel injector — blockage\n' +
          '* Compression test if still sluggish',
      );
    case HONDA_BUTTON_IDS.TS_MILEAGE:
      return buildHondaAnswerWithNav(
        '*Low mileage / high fuel use*\n\n' +
          '*Check:*\n' +
          '* Air filter — replace if dirty\n' +
          '* Tyre pressure — front 90/90-12, rear 90/100-10 tubeless\n' +
          '* Spark plug — inspect / replace at 12,000 km\n' +
          '* Injector clean\n' +
          '* Fuel quality — use recommended petrol',
      );
    case HONDA_BUTTON_IDS.SPECS:
      return buildHondaAnswerWithNav(
        '*Activa 6G — key specs*\n\n' +
          '*Engine:* 109.51 cc, fan cooled, PGM-FI, self/kick start\n' +
          '*Power / torque:* 5.73 kW @ 8000 rpm / 8.84 Nm @ 5500 rpm\n' +
          '*Transmission:* Automatic CVT\n' +
          '*Fuel tank:* 5.3 L\n' +
          '*Tyres:* Front 90/90-12, Rear 90/100-10 (tubeless)\n' +
          '*Brakes:* Drum 130 mm (F&R)\n' +
          '*Battery:* 3.0 Ah | *Kerb weight:* 106 kg',
      );
    case HONDA_BUTTON_IDS.SERVICE:
      return buildHondaAnswerWithNav(
        '*Service schedule*\n\n' +
          '*1st service:* 750–1000 km / 30 days — oil, general & brake inspection\n' +
          '*2nd service:* 5500–6000 km / 6 mo — oil, air filter clean, brake adjust\n' +
          '*3rd service:* 11,500–12,000 km / 12 mo — oil, air filter, spark plug & CVT inspect\n' +
          '*Thereafter:* Every 6000 km or 6 months',
      );
    case HONDA_BUTTON_IDS.PARTS:
      return buildHondaAnswerWithNav(
        '*Consumables & change intervals*\n\n' +
          '*Engine oil:* SAE 10W30, 800 ml — every 6000 km\n' +
          '*Air filter:* clean 4000 km, replace 12,000 km\n' +
          '*Spark plug:* inspect each service, replace 12,000 km\n' +
          '*CVT belt:* inspect 6000–8000 km, replace 20,000–24,000 km\n' +
          '*Brake shoes:* inspect each service, replace on wear\n' +
          '*Battery:* replace every 2–3 years\n' +
          '*Gear oil:* 6000–12,000 km',
      );
    default:
      return undefined;
  }
}

export function buildHondaNearMissAllowList(): NearMissAllowList {
  return {
    topics: [
      { label: 'Self start not working', detail: 'Horn → headlamp → relay decision tree' },
      { label: 'Vehicle specifications', detail: 'Engine, CVT, dimensions, brakes, tyres' },
      { label: 'Service schedule', detail: 'First, second, third and recurring service intervals' },
      { label: 'Parts & consumables', detail: 'Oil, air filter, spark plug, CVT belt, brake shoes' },
      { label: 'Troubleshooting', detail: 'No start, poor pickup, low mileage' },
    ],
    owners: [],
  };
}

export function buildHondaNearMissReply(question: string): string {
  const q = question.toLowerCase();
  const picks: string[] = [];

  if (/start|horn|relay|battery|crank|self/.test(q)) picks.push('Self start not working (decision tree)');
  if (/oil|filter|belt|spark|brake|part|consum/.test(q)) picks.push('Parts & oil intervals');
  if (/service|interval|km|maintenance/.test(q)) picks.push('Service schedule');
  if (/pickup|mileage|fuel|compression|inject/.test(q)) picks.push('Other faults (pickup / mileage)');
  if (/spec|engine|cvt|tyre|dimension/.test(q)) picks.push('Vehicle specs');

  if (picks.length === 0) {
    picks.push('Self start not working', 'Parts & oil', 'Service schedule');
  }

  const unique = [...new Set(picks)].slice(0, 3);
  return (
    `Could not find an exact match for that question.\n\n` +
    `Try the workshop menu:\n` +
    unique.map((p) => `* ${p}`).join('\n') +
    `\n\nOr type *menu* to see all topics.`
  );
}

export function resolveHondaMenuSelection(input: string): string {
  const key = input.trim().toLowerCase();
  if (key === HONDA_BUTTON_IDS.TYPE_QUESTION || key === 'ask anything' || key === 'honda_ask' || key === 'ask again') {
    return HONDA_BUTTON_IDS.TYPE_QUESTION;
  }
  if (key === HONDA_BUTTON_IDS.MAIN_MENU || key === 'main menu' || key === 'menu') {
    return HONDA_BUTTON_IDS.MAIN_MENU;
  }
  return HONDA_MENU_ALIASES[key] ?? input;
}

export function isHondaSelfStartId(id: string): boolean {
  return HONDA_SELF_START_IDS.has(id.trim().toLowerCase());
}

export function looksLikeHondaMenuChoice(text: string): boolean {
  const key = text.trim().toLowerCase();
  if (!key) return false;
  if (key.startsWith('honda_')) return true;
  return (
    key === 'vehicle specs' ||
    key === 'service schedule' ||
    key === 'troubleshooting' ||
    key === 'other faults' ||
    key === 'parts & consumables' ||
    key === 'self start not working' ||
    key === 'self start help' ||
    key === 'ask anything' ||
    key === 'ask again' ||
    key === 'main menu' ||
    key === 'no start' ||
    key === 'poor pickup' ||
    key === 'low mileage'
  );
}
