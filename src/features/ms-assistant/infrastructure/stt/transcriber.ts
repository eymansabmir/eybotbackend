import OpenAI, { toFile } from 'openai';
import type { MsAssistantConfig } from '../../config';
import { logger } from '../../../../utils/logger';

/** Turns an audio buffer (WhatsApp voice note) into text. */
export interface AudioTranscriber {
  /** ISO-639-1 hint (e.g. 'hi'). Returns transcript text, or '' on failure. */
  transcribe(audio: Buffer, mimeType: string, language?: string): Promise<string>;
}

const MIME_EXTENSION: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'mp4',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/amr': 'amr',
};

/**
 * OpenAI Whisper transcription. Only usable with a real api.openai.com key
 * (GitHub Copilot / GitHub Models do NOT expose audio/transcriptions), so this
 * uses a dedicated STT key/base URL, independent of the chat provider.
 */
export class WhisperTranscriber implements AudioTranscriber {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly defaultLanguage: string;

  constructor(opts: { apiKey: string; baseURL?: string; model?: string; language?: string }) {
    const options: ConstructorParameters<typeof OpenAI>[0] = { apiKey: opts.apiKey };
    if (opts.baseURL) options.baseURL = opts.baseURL;
    this.client = new OpenAI(options);
    this.model = opts.model ?? 'whisper-1';
    this.defaultLanguage = opts.language ?? 'hi';
  }

  async transcribe(audio: Buffer, mimeType: string, language?: string): Promise<string> {
    try {
      const ext = MIME_EXTENSION[mimeType.toLowerCase()] ?? 'ogg';
      const file = await toFile(audio, `voice-note.${ext}`, { type: mimeType || 'audio/ogg' });
      const result = await this.client.audio.transcriptions.create({
        file,
        model: this.model,
        language: language ?? this.defaultLanguage,
      });
      const text = (result.text ?? '').trim();
      logger.info(
        { chars: text.length, model: this.model, preview: text.slice(0, 60) },
        'WhisperTranscriber: transcribed voice note',
      );
      return text;
    } catch (err) {
      logger.warn({ err }, 'WhisperTranscriber: transcription failed');
      return '';
    }
  }
}

/**
 * Returns a transcriber only when a dedicated STT key is configured.
 * Falls back to OPENAI_API_KEY only when NO GitHub-models base URL is set
 * (i.e. it's a genuine OpenAI key that can reach audio/transcriptions).
 */
export function createMsTranscriber(config: MsAssistantConfig): AudioTranscriber | undefined {
  const sttKey = config.MS_ASSISTANT_STT_API_KEY?.trim();
  if (sttKey) {
    const baseURL = config.MS_ASSISTANT_STT_BASE_URL?.trim() || undefined;
    logger.info(
      { baseURL: baseURL ?? 'api.openai.com', model: config.MS_ASSISTANT_STT_MODEL },
      'MsAssistant STT: Whisper-compatible transcriber enabled (dedicated STT key)',
    );
    return new WhisperTranscriber({
      apiKey: sttKey,
      baseURL,
      model: config.MS_ASSISTANT_STT_MODEL,
      language: config.MS_ASSISTANT_STT_LANGUAGE,
    });
  }

  // Only reuse OPENAI_API_KEY when it's a real OpenAI key (no proxy base URL).
  const openaiKey = config.OPENAI_API_KEY?.trim();
  if (openaiKey && !config.OPENAI_BASE_URL) {
    return new WhisperTranscriber({
      apiKey: openaiKey,
      model: config.MS_ASSISTANT_STT_MODEL,
      language: config.MS_ASSISTANT_STT_LANGUAGE,
    });
  }

  return undefined;
}
