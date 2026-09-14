import type { MsAssistantChat } from '../infrastructure/llm/shared';
import { RESUME_SLOTS, type ResumeFieldKey, type ResumeLanguage } from './resume-builder';
import { logger } from '../../../utils/logger';

/** Per-slot guidance so the extractor returns clean, resume-ready values. */
const FIELD_DESCRIPTIONS: Record<ResumeFieldKey, string> = {
  fullName: "Person's name only, transliterated to English letters in Title Case.",
  location: 'City / area / village name only.',
  phone: 'Phone number digits only.',
  trade: 'Job / trade in a couple of words (English), e.g. "Mason", "Driver".',
  experience: "Total experience as a short phrase like '3 years' (number + unit).",
  pastWork: 'Previous employers/places with duration, concise (English).',
  skills: 'Comma-separated list of concise skills / tasks (English).',
  education: "Highest education only, e.g. '10th pass', 'ITI', '8th'.",
  certifications: 'Licenses/certificates/training as a comma-separated list.',
  languages: 'Comma-separated list of spoken languages (English names).',
  expectedSalary: 'Expected monthly salary as a number (may include currency symbol).',
  availability: "When they can start, short phrase like 'Immediately' or 'In 1 week'.",
};

const SYSTEM_PROMPT = `You extract clean resume information from a blue-collar worker's WhatsApp message.
The message may be in Hindi, Hinglish, or a transcribed voice note, and often packs many facts into one sentence.
Your job: pull out EVERY resume detail the person actually stated — not the whole sentence — translated into clear, simple English.

Example:
Message: "मेरा नाम रामलाल है, मैं 8 साल से राजमिस्त्री हूं, पहले गांव में अब दिल्ली में, ईंट प्लास्टर और टाइल का काम आता है, शर्मा बिल्डर के यहां 4 साल काम किया"
Extract: {"fullName":"Ramlal","trade":"Mason","experience":"8 years","location":"Delhi","skills":"Bricklaying, Plaster, Tiling","pastWork":"Sharma Builder - 4 years"}

Rules:
- Return ONLY a compact JSON object.
- Include a key ONLY if the person actually gave that information. Omit everything else.
- Keep each value short and clean (strip filler like "mera", "hai", "my", "is").
- experience -> "<number> years"; salary -> number only.
- Never invent facts. If they say "none"/"नहीं है" for something, omit that key.`;

function stripJsonFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? raw).trim();
}

/**
 * Extract every resume slot present in a single message (text or transcript).
 * `focusFields` is the group we just asked about — used only as a fallback sink
 * when the LLM is unavailable, so the raw reply is never lost.
 */
export async function extractResumeSlots(
  llm: MsAssistantChat,
  params: {
    rawText: string;
    language: ResumeLanguage;
    professionLabel?: string;
    focusFields: ResumeFieldKey[];
    askedAbout?: string;
  },
): Promise<Partial<Record<ResumeFieldKey, string>>> {
  const raw = params.rawText.trim();
  const primary = params.focusFields[0];
  const fallback: Partial<Record<ResumeFieldKey, string>> =
    primary && raw ? { [primary]: raw } : {};

  if (!raw || !llm.complete) return fallback;

  const slotSpec = RESUME_SLOTS.map((f) => `- "${f}": ${FIELD_DESCRIPTIONS[f]}`).join('\n');

  try {
    const out = await llm.complete({
      system: SYSTEM_PROMPT,
      user:
        (params.professionLabel ? `Known trade: ${params.professionLabel}\n` : '') +
        (params.askedAbout ? `This message was in reply to: ${params.askedAbout}\n` : '') +
        `Available slots (extract only what is stated):\n${slotSpec}\n\n` +
        `Message: "${raw}"\n\nReturn the JSON now.`,
      temperature: 0,
      preferJsonObject: true,
    });

    const parsed = JSON.parse(stripJsonFences(out)) as Record<string, unknown>;
    const result: Partial<Record<ResumeFieldKey, string>> = {};
    for (const key of RESUME_SLOTS) {
      const val = parsed[key];
      if (typeof val === 'string' && val.trim()) {
        result[key] = val.trim();
      } else if (Array.isArray(val) && val.length) {
        result[key] = val.map(String).map((s) => s.trim()).filter(Boolean).join(', ');
      }
    }
    return Object.keys(result).length ? result : fallback;
  } catch (err) {
    logger.warn({ err }, 'extractResumeSlots: extraction failed, using raw fallback');
    return fallback;
  }
}
