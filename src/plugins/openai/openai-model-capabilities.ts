export function usesMaxCompletionTokensParam(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return id.startsWith('gpt-5') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4');
}

export function isTextChatCompletionModel(modelId: string): boolean {
  const id = modelId.toLowerCase();

  if (
    id.includes('audio') ||
    id.includes('tts') ||
    id.includes('transcribe') ||
    id.includes('whisper') ||
    id.includes('embedding') ||
    id.includes('moderation') ||
    id.includes('dall') ||
    id.includes('image')
  ) {
    return false;
  }

  return id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4');
}
