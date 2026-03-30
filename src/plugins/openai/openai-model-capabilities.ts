export function usesMaxCompletionTokensParam(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return id.startsWith('gpt-5') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4');
}

const STABLE_CHAT_MODEL_PATTERNS: RegExp[] = [
  /^gpt-3\.5-turbo$/,
  /^chatgpt-4o-latest$/,
  /^gpt-4o$/,
  /^gpt-4o-mini$/,
  /^gpt-4\.1$/,
  /^gpt-4\.1-mini$/,
  /^gpt-4\.1-nano$/,
  /^gpt-5$/,
  /^gpt-5-mini$/,
  /^gpt-5-nano$/,
  /^o1$/,
  /^o1-mini$/,
  /^o3$/,
  /^o3-mini$/,
  /^o4$/,
  /^o4-mini$/,
];

function isClearlyIncompatibleTextModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return (
    id.includes('audio') ||
    id.includes('realtime') ||
    id.includes('tts') ||
    id.includes('transcribe') ||
    id.includes('whisper') ||
    id.includes('embedding') ||
    id.includes('moderation') ||
    id.includes('dall') ||
    id.includes('image') ||
    id.includes('instruct') ||
    id.includes('search') ||
    id.includes('-preview') ||
    id.includes('-latest') ||
    id.includes('-pro')
  );
}

export function isTextChatCompletionModel(modelId: string): boolean {
  const id = modelId.toLowerCase();

  if (isClearlyIncompatibleTextModel(id)) {
    return false;
  }

  return STABLE_CHAT_MODEL_PATTERNS.some((pattern) => pattern.test(id));
}
