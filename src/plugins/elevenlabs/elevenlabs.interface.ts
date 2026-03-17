import type { IElevenLabsProvider } from './elevenlabs.types';

export const ELEVENLABS_PLUGIN = 'elevenlabs' as const;

export type IElevenLabsPlugin = IElevenLabsProvider;
