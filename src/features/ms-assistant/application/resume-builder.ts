import type { BotResponse } from '../domain/bot-response';
import { formatWhatsAppText } from '../infrastructure/formatter/whatsapp-format';

export type ResumeLanguage = 'hi' | 'en';

/** Information slots we try to fill. Phone is auto-filled from the WhatsApp id. */
export type ResumeFieldKey =
  | 'fullName'
  | 'location'
  | 'phone'
  | 'trade'
  | 'experience'
  | 'pastWork'
  | 'skills'
  | 'education'
  | 'languages'
  | 'certifications'
  | 'expectedSalary'
  | 'availability';

/** Every slot the extractor may fill (phone comes from the webhook, not the user). */
export const RESUME_SLOTS: ResumeFieldKey[] = [
  'fullName',
  'location',
  'trade',
  'experience',
  'pastWork',
  'skills',
  'education',
  'certifications',
  'languages',
  'expectedSalary',
  'availability',
];

export type ResumeStatus = 'idle' | 'choosing_profession' | 'collecting' | 'review' | 'done';

export type ResumeState = {
  status: ResumeStatus;
  language: ResumeLanguage;
  professionId?: string;
  /** Slot values collected/extracted so far. */
  answers: Partial<Record<ResumeFieldKey, string>>;
  /** Ask-group ids we have already presented (so we never repeat one). */
  askedGroups: string[];
  /** The ask-group currently awaiting an answer. */
  currentGroupId?: string;
  referenceId?: string;
  documentUrl?: string;
};

export const RESUME_BUTTON_IDS = {
  START_HI: 'resume_start_hi',
  START_EN: 'resume_start_en',
  LANG_HI: 'resume_lang_hi',
  LANG_EN: 'resume_lang_en',
  SKIP: 'resume_skip',
  GENERATE: 'resume_generate',
  RESTART: 'resume_restart',
} as const;

/** Interactive-list row id prefix for a chosen profession. */
export const RESUME_PROFESSION_PREFIX = 'resume_prof_';

type Localized = { hi: string; en: string };

/* ── Professions ────────────────────────────────────────────────────────── */

type Profession = {
  id: string;
  label: Localized;
  desc: Localized;
  /** Example skills used to make the skills question relevant. */
  skillEg: Localized;
};

export const PROFESSIONS: Profession[] = [
  {
    id: 'driver',
    label: { hi: 'ड्राइवर', en: 'Driver' },
    desc: { hi: 'कार/टैक्सी/ट्रक चलाना', en: 'Car / taxi / truck driving' },
    skillEg: { hi: 'गाड़ी चलाना, रूट की जानकारी', en: 'Driving, route knowledge' },
  },
  {
    id: 'electrician',
    label: { hi: 'इलेक्ट्रिशियन', en: 'Electrician' },
    desc: { hi: 'वायरिंग और बिजली का काम', en: 'Wiring & electrical work' },
    skillEg: { hi: 'वायरिंग, मरम्मत, फिटिंग', en: 'Wiring, repairs, fitting' },
  },
  {
    id: 'plumber',
    label: { hi: 'प्लंबर', en: 'Plumber' },
    desc: { hi: 'पाइप और नल का काम', en: 'Pipe & fitting work' },
    skillEg: { hi: 'पाइप फिटिंग, लीक ठीक करना', en: 'Pipe fitting, leak repair' },
  },
  {
    id: 'mason',
    label: { hi: 'राजमिस्त्री', en: 'Mason' },
    desc: { hi: 'चिनाई और प्लास्टर', en: 'Bricklaying & plaster' },
    skillEg: { hi: 'चिनाई, प्लास्टर, टाइल', en: 'Bricklaying, plaster, tiling' },
  },
  {
    id: 'carpenter',
    label: { hi: 'बढ़ई', en: 'Carpenter' },
    desc: { hi: 'लकड़ी और फर्नीचर का काम', en: 'Woodwork & furniture' },
    skillEg: { hi: 'फर्नीचर, फिटिंग, पॉलिश', en: 'Furniture, fitting, polishing' },
  },
  {
    id: 'painter',
    label: { hi: 'पेंटर', en: 'Painter' },
    desc: { hi: 'रंग-रोगन का काम', en: 'Painting work' },
    skillEg: { hi: 'पेंटिंग, पुट्टी, पॉलिश', en: 'Painting, putty, polishing' },
  },
  {
    id: 'welder',
    label: { hi: 'वेल्डर', en: 'Welder' },
    desc: { hi: 'वेल्डिंग और फैब्रिकेशन', en: 'Welding & fabrication' },
    skillEg: { hi: 'वेल्डिंग, कटिंग, फैब्रिकेशन', en: 'Welding, cutting, fabrication' },
  },
  {
    id: 'cook',
    label: { hi: 'कुक / रसोइया', en: 'Cook' },
    desc: { hi: 'खाना बनाने का काम', en: 'Cooking work' },
    skillEg: { hi: 'खाना बनाना, किचन मैनेजमेंट', en: 'Cooking, kitchen management' },
  },
  {
    id: 'security_guard',
    label: { hi: 'सिक्योरिटी गार्ड', en: 'Security Guard' },
    desc: { hi: 'सुरक्षा और निगरानी', en: 'Security & surveillance' },
    skillEg: { hi: 'निगरानी, गश्त, रजिस्टर', en: 'Surveillance, patrolling' },
  },
  {
    id: 'housekeeping',
    label: { hi: 'हाउसकीपिंग / सफ़ाई', en: 'Housekeeping' },
    desc: { hi: 'साफ़-सफ़ाई का काम', en: 'Cleaning & sanitation' },
    skillEg: { hi: 'सफ़ाई, सैनिटेशन', en: 'Cleaning, sanitation' },
  },
  {
    id: 'farm',
    label: { hi: 'खेती / मज़दूर', en: 'Farm / Labour' },
    desc: { hi: 'खेती और मज़दूरी का काम', en: 'Farming & labour' },
    skillEg: { hi: 'खेती, ट्रैक्टर, मशीन', en: 'Farming, tractor, machinery' },
  },
  {
    id: 'helper',
    label: { hi: 'हेल्पर / मज़दूर', en: 'Helper / Labour' },
    desc: { hi: 'लोडिंग और मदद का काम', en: 'Loading & assisting' },
    skillEg: { hi: 'लोडिंग, सामान उठाना', en: 'Loading, material handling' },
  },
  {
    id: 'delivery',
    label: { hi: 'डिलीवरी बॉय', en: 'Delivery Rider' },
    desc: { hi: 'सामान पहुँचाने का काम', en: 'Delivery work' },
    skillEg: { hi: 'डिलीवरी, नेविगेशन', en: 'Delivery, navigation' },
  },
  {
    id: 'other',
    label: { hi: 'अन्य (कुछ और)', en: 'Other' },
    desc: { hi: 'ऊपर नहीं है? यहाँ चुनें', en: 'Not listed? Pick here' },
    skillEg: { hi: 'अपने काम के हुनर', en: 'Your work skills' },
  },
];

export function professionById(id?: string): Profession | undefined {
  return PROFESSIONS.find((p) => p.id === id);
}

export function professionFromRowId(rowId: string): Profession | undefined {
  if (!rowId.startsWith(RESUME_PROFESSION_PREFIX)) return undefined;
  return professionById(rowId.slice(RESUME_PROFESSION_PREFIX.length));
}

/** Best-effort profession label for prompts/extraction context. */
export function professionLabelFor(state: ResumeState, lang: ResumeLanguage = state.language): string {
  const p = professionById(state.professionId);
  if (p && p.id !== 'other') return p.label[lang];
  return state.answers.trade?.trim() || (lang === 'hi' ? 'इस काम' : 'this work');
}

/* ── Ask-groups (agentic, slot-based) ───────────────────────────────────── */
/**
 * The agent fills information *slots*, not a fixed form. Each turn we extract
 * every slot mentioned in the user's message, then ask the smallest remaining
 * question. An ask-group bundles slots that make sense to request together and
 * is skipped entirely if a previous message already filled it.
 */
export type ResumeGroup = {
  id: string;
  /** Required groups gate the review; optional ones offer a Skip button. */
  required: boolean;
  fields: ResumeFieldKey[];
  /** For required groups: slots that must be present to consider it satisfied. */
  requiredFields: ResumeFieldKey[];
  prompt: (lang: ResumeLanguage, profession: string, skillEg: string) => string;
  /** Neutral English hint for the extractor about what this turn focuses on. */
  ask: string;
};

export const ASK_GROUPS: ResumeGroup[] = [
  {
    id: 'work_kind',
    required: true,
    fields: ['trade'],
    requiredFields: ['trade'],
    prompt: (lang) =>
      lang === 'hi'
        ? 'आप *क्या काम* करते हैं या किस काम की तलाश में हैं? 👷\n_अपने शब्दों में — जैसे: राजमिस्त्री, ड्राइवर, हेल्पर_'
        : 'What *work* do you do (or are you looking for)? 👷\n_e.g. mason, driver, helper_',
    ask: 'The kind of work / trade the person does.',
  },
  {
    id: 'work_story',
    required: true,
    fields: ['experience', 'pastWork'],
    requiredFields: ['experience'],
    prompt: (lang, prof) =>
      lang === 'hi'
        ? `बतौर *${prof}*, आप *कितने साल* से काम कर रहे हैं और *पहले कहाँ-कहाँ* काम किया? 🏗️\n_एक ही message में बता सकते हैं — जैसे: 6 साल से, पहले गांव में फिर दिल्ली में_`
        : `As a *${prof}*, how many *years* have you worked and *where have you worked before*? 🏗️\n_You can tell it all in one message._`,
    ask: 'Years of experience AND previous employers / work history.',
  },
  {
    id: 'skills',
    required: true,
    fields: ['skills'],
    requiredFields: ['skills'],
    prompt: (lang, _prof, skillEg) =>
      lang === 'hi'
        ? `आप *क्या-क्या काम* अच्छे से कर लेते हैं? 🛠️\n_जैसे: ${skillEg}_`
        : `What *tasks* can you do well? 🛠️\n_e.g. ${skillEg}_`,
    ask: 'Key skills / tasks the person can do.',
  },
  {
    id: 'education',
    required: false,
    fields: ['education', 'certifications'],
    requiredFields: [],
    prompt: (lang) =>
      lang === 'hi'
        ? "आपने *कितनी पढ़ाई* की है और कोई *लाइसेंस/ट्रेनिंग/सर्टिफिकेट*? 🎓\n_जैसे: 10वीं पास, Heavy Driving License. न हो तो 'नहीं है' लिखें_"
        : "What is your *education*, and any *license/training/certificate*? 🎓\n_e.g. 10th pass, Heavy Driving License. Type 'none' if not._",
    ask: 'Education level AND any licenses/certificates (two separate slots).',
  },
  {
    id: 'contact',
    required: true,
    fields: ['fullName', 'location'],
    requiredFields: ['fullName', 'location'],
    prompt: (lang) =>
      lang === 'hi'
        ? 'आखिरी में — आपका *नाम* और आप *किस शहर/इलाके* में रहते या काम करना चाहते हैं? 📍\n_जैसे: रामलाल, दिल्ली_'
        : 'Lastly — your *name* and *which city/area* do you live or want to work in? 📍\n_e.g. Ramlal, Delhi_',
    ask: 'Full name AND city/location (two separate slots).',
  },
  {
    id: 'salary_avail',
    required: false,
    fields: ['expectedSalary', 'availability'],
    requiredFields: [],
    prompt: (lang) =>
      lang === 'hi'
        ? 'आप *कितनी सैलरी* (हर महीने) चाहते हैं और *कब से* काम शुरू कर सकते हैं? 💰\n_जैसे: ₹15,000, तुरंत_'
        : 'What *monthly salary* do you expect and *when can you start*? 💰\n_e.g. ₹15,000, immediately_',
    ask: 'Expected monthly salary AND availability/start date (two separate slots).',
  },
];

export function resumeGroupById(id?: string): ResumeGroup | undefined {
  return ASK_GROUPS.find((g) => g.id === id);
}

export function currentResumeGroup(state: ResumeState): ResumeGroup | undefined {
  return resumeGroupById(state.currentGroupId);
}

function slotFilled(state: ResumeState, key: ResumeFieldKey): boolean {
  return Boolean(state.answers[key]?.trim());
}

/** True if an already-known slot value means we don't need to ask this group. */
function groupSatisfied(state: ResumeState, g: ResumeGroup): boolean {
  if (g.required) return g.requiredFields.every((f) => slotFilled(state, f));
  // Optional groups: skip once any of their slots is already known.
  return g.fields.some((f) => slotFilled(state, f));
}

/** Pick the next group to ask: first un-asked, unsatisfied group in order. */
export function planNextGroup(state: ResumeState): ResumeGroup | undefined {
  return ASK_GROUPS.find((g) => !state.askedGroups.includes(g.id) && !groupSatisfied(state, g));
}

/* ── Static copy ────────────────────────────────────────────────────────── */

const COPY = {
  questionLabel: (n: number): Localized => ({ hi: `*सवाल ${n}*`, en: `*Question ${n}*` }),
  firstIntro: {
    hi: 'बहुत बढ़िया! 👍 अब बस कुछ आसान सवाल — आप *लिखकर या Voice* 🎙️ में जवाब दे सकते हैं।',
    en: 'Great! 👍 Just a few easy questions — you can reply by *text or voice* 🎙️.',
  } as Localized,
  skip: { hi: 'छोड़ें ⏭️', en: 'Skip ⏭️' } as Localized,
  generate: { hi: 'रिज़्यूमे बनाएँ 📄', en: 'Create Resume 📄' } as Localized,
  restart: { hi: 'फिर से भरें 🔄', en: 'Start Over 🔄' } as Localized,
  startHi: 'हिंदी में शुरू करें',
  startEn: 'Start in English',
  professionListButton: { hi: 'पेशा चुनें', en: 'Choose work' } as Localized,
  professionPrompt: {
    hi: 'सबसे पहले — आप *कौन सा काम* करते हैं? नीचे सूची में से चुनें 👇\n_सूची में न हो तो *अन्य* चुनें_',
    en: 'First — what *work* do you do? Pick from the list below 👇\n_Not listed? Choose *Other*_',
  } as Localized,
  sectionSkilled: { hi: 'हुनरमंद काम', en: 'Skilled Trades' } as Localized,
  sectionGeneral: { hi: 'अन्य काम', en: 'General Work' } as Localized,
  generating: {
    hi: 'बढ़िया! 🛠️ आपका रिज़्यूमे बन रहा है… कृपया थोड़ा इंतज़ार करें।',
    en: 'Great! 🛠️ Building your resume… please wait a moment.',
  } as Localized,
  audioFallback: {
    hi: 'माफ़ कीजिए, अभी मैं आपकी *वॉइस* नहीं सुन पाया। कृपया अपना जवाब *टेक्स्ट में लिखकर* भेजें।',
    en: "Sorry, I couldn't hear your *voice note*. Please *type* your answer instead.",
  } as Localized,
  reviewHeader: {
    hi: '🎉 *आपकी जानकारी तैयार है!* एक बार देख लें:',
    en: '🎉 *Here is everything I gathered.* Please review:',
  } as Localized,
  reviewFooter: {
    hi: 'सब ठीक है? नीचे *रिज़्यूमे बनाएँ* दबाएँ 👇',
    en: 'All good? Tap *Create Resume* below 👇',
  } as Localized,
} as const;

const REVIEW_LABELS: Record<ResumeFieldKey, Localized> = {
  fullName: { hi: 'नाम', en: 'Name' },
  location: { hi: 'शहर', en: 'City' },
  phone: { hi: 'फ़ोन', en: 'Phone' },
  trade: { hi: 'काम', en: 'Work' },
  experience: { hi: 'अनुभव', en: 'Experience' },
  pastWork: { hi: 'पिछला काम', en: 'Past work' },
  skills: { hi: 'हुनर', en: 'Skills' },
  education: { hi: 'पढ़ाई', en: 'Education' },
  languages: { hi: 'भाषाएँ', en: 'Languages' },
  certifications: { hi: 'लाइसेंस/सर्टिफिकेट', en: 'License/Certificate' },
  expectedSalary: { hi: 'सैलरी', en: 'Salary' },
  availability: { hi: 'उपलब्धता', en: 'Availability' },
};

const SKIP_WORDS = /^(skip|छोड़ें|छोड़|नहीं|नही|nahin?|pata nahi|पता नहीं|none|na)(\s|$)/i;

export const EMPTY_RESUME_STATE: ResumeState = {
  status: 'idle',
  language: 'hi',
  answers: {},
  askedGroups: [],
};

export function isResumeSkip(text: string): boolean {
  return SKIP_WORDS.test(text.trim());
}

export function isResumeRestart(text: string): boolean {
  return /^(restart|reset|फिर से|दोबारा|नया रिज़्यूमे|नया|new resume|start over)(\s|$)/i.test(
    text.trim(),
  );
}

export function isResumeGenerateText(text: string): boolean {
  return /(बनाओ|बनाएं|बनाएँ|बना दो|generate|resume banao|तैयार|ready|हाँ बनाओ)/i.test(text.trim());
}

export function detectLanguageSwitch(text: string): ResumeLanguage | null {
  const t = text.trim().toLowerCase();
  if (/^(english|अंग्रेज़ी|अंग्रेजी|angrezi|eng)$/.test(t)) return 'en';
  if (/^(hindi|हिंदी|हिन्दी|hindee)$/.test(t)) return 'hi';
  return null;
}

function firstName(full?: string): string {
  return (full ?? '').trim().split(/\s+/)[0] ?? '';
}

/* ── Response builders ──────────────────────────────────────────────────── */

/** Welcome + language choice. */
export function buildResumeWelcome(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      `👋 *नमस्ते! / Hello!*\n\n` +
        `मैं आपका *रिज़्यूमे (बायोडाटा)* बनाने में मदद करूँगा।\n` +
        `I'll help you build your *resume*.\n\n` +
        `आप *लिखकर या Voice Message* 🎙️ में जवाब दे सकते हैं।\n` +
        `You can reply by *text or voice*.\n\n` +
        `अपनी *भाषा चुनें* / Choose your *language* 👇`,
    ),
    buttons: [
      { id: RESUME_BUTTON_IDS.START_HI, title: COPY.startHi },
      { id: RESUME_BUTTON_IDS.START_EN, title: COPY.startEn },
    ],
  };
}

/** Interactive list of blue-collar professions. */
export function buildProfessionList(language: ResumeLanguage): BotResponse {
  const row = (p: Profession) => ({
    id: `${RESUME_PROFESSION_PREFIX}${p.id}`,
    title: p.label[language].slice(0, 24),
    description: p.desc[language].slice(0, 72),
  });
  const skilledIds = ['driver', 'electrician', 'plumber', 'mason', 'carpenter', 'painter', 'welder'];
  const skilled = PROFESSIONS.filter((p) => skilledIds.includes(p.id)).map(row);
  const general = PROFESSIONS.filter((p) => !skilledIds.includes(p.id)).map(row);

  return {
    mode: 'list',
    text: formatWhatsAppText(COPY.professionPrompt[language]),
    buttonTitle: COPY.professionListButton[language].slice(0, 20),
    sections: [
      { title: COPY.sectionSkilled[language].slice(0, 24), rows: skilled },
      { title: COPY.sectionGeneral[language].slice(0, 24), rows: general },
    ],
  };
}

/** Build the prompt for the current ask-group (with a light ack/intro). */
export function buildResumeQuestion(state: ResumeState): BotResponse {
  const group = currentResumeGroup(state);
  if (!group) return buildResumeReview(state);

  const lang = state.language;
  const prof = professionLabelFor(state);
  const skillEg =
    professionById(state.professionId)?.skillEg[lang] ?? (lang === 'hi' ? 'अपने हुनर' : 'your skills');

  const isFirst = state.askedGroups.length <= 1;
  const name = firstName(state.answers.fullName);
  let lead = '';
  if (isFirst) {
    lead = `${COPY.firstIntro[lang]}\n\n`;
  } else if (name) {
    lead = lang === 'hi' ? `बढ़िया ${name} जी 👍\n\n` : `Great, ${name} 👍\n\n`;
  }

  const header = COPY.questionLabel(state.askedGroups.length)[lang];
  const body = `${lead}${header}\n\n${group.prompt(lang, prof, skillEg)}`;

  if (!group.required) {
    return {
      mode: 'buttons',
      text: formatWhatsAppText(body),
      buttons: [{ id: RESUME_BUTTON_IDS.SKIP, title: COPY.skip[lang] }],
    };
  }
  return { mode: 'text', text: formatWhatsAppText(body) };
}

export function buildResumeReview(state: ResumeState): BotResponse {
  const lang = state.language;
  const a = state.answers;
  const line = (key: ResumeFieldKey) =>
    a[key]?.trim() ? `• *${REVIEW_LABELS[key][lang]}:* ${a[key]}` : null;

  const order: ResumeFieldKey[] = [
    'fullName',
    'trade',
    'phone',
    'location',
    'experience',
    'skills',
    'pastWork',
    'education',
    'certifications',
    'languages',
    'expectedSalary',
    'availability',
  ];

  const lines = [COPY.reviewHeader[lang], '', ...order.map(line), '', COPY.reviewFooter[lang]].filter(
    (l) => l !== null,
  );

  return {
    mode: 'buttons',
    text: formatWhatsAppText(lines.join('\n')),
    buttons: [
      { id: RESUME_BUTTON_IDS.GENERATE, title: COPY.generate[lang] },
      { id: RESUME_BUTTON_IDS.RESTART, title: COPY.restart[lang] },
    ],
  };
}

export function buildResumeGeneratingResponse(language: ResumeLanguage): BotResponse {
  return { mode: 'text', text: formatWhatsAppText(COPY.generating[language]) };
}

export function buildResumeAudioFallback(language: ResumeLanguage): BotResponse {
  return { mode: 'text', text: formatWhatsAppText(COPY.audioFallback[language]) };
}

/* ── State transitions ──────────────────────────────────────────────────── */

export type ResumeAdvanceResult =
  | { kind: 'ask'; state: ResumeState; response: BotResponse }
  | { kind: 'review'; state: ResumeState; response: BotResponse };

/** After a language button — move to profession selection. */
export function beginProfessionChoice(language: ResumeLanguage): {
  state: ResumeState;
  response: BotResponse;
} {
  const state: ResumeState = {
    status: 'choosing_profession',
    language,
    answers: {},
    askedGroups: [],
  };
  return { state, response: buildProfessionList(language) };
}

/** Advance a collecting state to its next question, or to review if none remain. */
function askNextOrReview(state: ResumeState): ResumeAdvanceResult {
  const next = planNextGroup(state);
  if (!next) {
    const reviewState: ResumeState = { ...state, status: 'review', currentGroupId: undefined };
    return { kind: 'review', state: reviewState, response: buildResumeReview(reviewState) };
  }
  const askState: ResumeState = {
    ...state,
    status: 'collecting',
    currentGroupId: next.id,
    askedGroups: [...state.askedGroups, next.id],
  };
  return { kind: 'ask', state: askState, response: buildResumeQuestion(askState) };
}

/** After a profession is picked — set trade + phone, then ask the first question. */
export function startInterview(
  language: ResumeLanguage,
  profession: Profession,
  phone?: string,
): ResumeAdvanceResult {
  const answers: ResumeState['answers'] = {};
  if (phone) answers.phone = phone;
  if (profession.id !== 'other') answers.trade = profession.label.en;

  const base: ResumeState = {
    status: 'collecting',
    language,
    professionId: profession.id,
    answers,
    askedGroups: [],
  };
  return askNextOrReview(base);
}

export function switchLanguage(state: ResumeState, language: ResumeLanguage): ResumeAdvanceResult {
  const next: ResumeState = { ...state, language };
  if (next.status === 'review') {
    return { kind: 'review', state: next, response: buildResumeReview(next) };
  }
  return { kind: 'ask', state: next, response: buildResumeQuestion(next) };
}

/**
 * Merge extracted slot values from the latest message, then ask the smallest
 * remaining question (or move to review). `slots` may fill many fields at once
 * — that's the whole point: one rich message can skip several questions.
 */
export function recordAnswer(
  state: ResumeState,
  slots: Partial<Record<ResumeFieldKey, string>>,
  opts: { skip?: boolean } = {},
): ResumeAdvanceResult {
  const answers = { ...state.answers };
  if (!opts.skip) {
    for (const key of RESUME_SLOTS) {
      const v = slots[key]?.trim();
      if (v) answers[key] = v;
    }
  }
  return askNextOrReview({ ...state, answers });
}

export function hasMinimumForResume(state: ResumeState): boolean {
  return Boolean(state.answers.fullName?.trim() || state.answers.trade?.trim());
}

export function generateReferenceId(date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RES-${dd}${mm}${yyyy}-${rand}`;
}
