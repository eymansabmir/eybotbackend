/**
 * OpenAI constants — ported from autobot forge blocks.
 *
 * Used for default model lists, voice options, and vision detection.
 */

// ── Voices ────────────────────────────────────────────────────────────────
export const OPENAI_VOICES = [
  'alloy',
  'echo',
  'fable',
  'onyx',
  'nova',
  'shimmer',
] as const;

export type OpenAIVoiceName = (typeof OPENAI_VOICES)[number];

// ── Models ────────────────────────────────────────────────────────────────
export const CHAT_MODELS = [
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4o',
  'gpt-4o-mini',
] as const;

export const REASONING_MODELS = ['o3-mini', 'o1', 'o1-mini'] as const;

export const ALL_CHAT_MODELS = [...CHAT_MODELS, ...REASONING_MODELS];

// ── Vision support ────────────────────────────────────────────────────────
/** Glob-style patterns for models that support image_url content blocks. */
export const MODELS_WITH_IMAGE_URL_SUPPORT = [
  'gpt-5*',
  'gpt-4-turbo*',
  'gpt-4o*',
  'gpt-4*vision-preview',
];

export const EXCLUDED_MODELS_FROM_IMAGE_URL_SUPPORT = ['gpt-4-turbo-preview'];

// ── Defaults ──────────────────────────────────────────────────────────────
export const DEFAULT_OPENAI_OPTIONS = {
  model: 'gpt-4o-mini',
  voiceModel: 'tts-1',
} as const;

export const MAX_TOOL_CALLS = 10;
