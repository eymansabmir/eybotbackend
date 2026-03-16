import type { IOpenAIProvider } from './openai.types';

export const OPENAI_PLUGIN = 'openai' as const;

export type IOpenAIPlugin = IOpenAIProvider;
