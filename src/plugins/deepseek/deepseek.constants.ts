export const DEEPSEEK_MODELS = [
  'deepseek-chat',
  'deepseek-reasoner',
] as const;

export type DeepSeekModelId = (typeof DEEPSEEK_MODELS)[number];

export const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_PLUGIN = 'DEEPSEEK_PLUGIN';

export const DEEPSEEK_RATE_LIMITS = {
  requestsPerMinute: 60,
  requestsPerDay: 10000,
} as const;

export const DEFAULT_DEEPSEEK_MAX_TOKENS = 4096;
