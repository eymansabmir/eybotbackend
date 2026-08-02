import type { MsAssistantConfig } from './config';
import { CopilotMsAssistantLlm } from './infrastructure/llm/copilot-chat';
import { MsAssistantLlm } from './infrastructure/llm/openai-chat';
import type { MsAssistantChat } from './infrastructure/llm/shared';
import { OpenAIEmbeddings } from './infrastructure/rag/embeddings';
import type { MsEmbeddings } from './infrastructure/rag/embeddings.types';
import { LocalEmbeddings } from './infrastructure/rag/local-embeddings';

export function createMsEmbeddings(config: MsAssistantConfig): MsEmbeddings {
  if (config.MS_ASSISTANT_EMBED_PROVIDER === 'openai') {
    return new OpenAIEmbeddings(config);
  }
  return new LocalEmbeddings(config);
}

export function createMsLlm(config: MsAssistantConfig): MsAssistantChat {
  if (config.MS_ASSISTANT_LLM_PROVIDER === 'openai') {
    return new MsAssistantLlm(config);
  }
  return new CopilotMsAssistantLlm(config);
}
