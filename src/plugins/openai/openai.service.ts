import { CredentialType } from '@prisma/client';
import { Readable } from 'stream';
import { AppError, ValidationError } from '../../utils/errors';
import type { ICredentialService } from '../../features/credentials';
import type { IStoragePlugin } from '../storage';
import type {
  CreateSpeechPayload,
  CreateSpeechResult,
  CreateTranscriptionPayload,
  CreateTranscriptionResult,
  ExecuteOpenAINodePayload,
  ExecuteOpenAINodeResult,
  IOpenAIIntegrationService,
  IOpenAIProvider,
  ListSpeechModelsPayload,
  OpenAIModelActionMode,
  OpenAIChatCompletionOutput,
  OpenAICredentialMaterial,
  OpenAIMessage,
  OpenAIModelInfo,
  OpenAISpeechModelInfo,
  OpenAIPreviewPayload,
  OpenAITestResult,
} from './openai.types';

export class OpenAIIntegrationService implements IOpenAIIntegrationService {
  private static readonly DEFAULT_CHAT_MODELS: OpenAIModelInfo[] = [
    { id: 'gpt-5' },
    { id: 'gpt-5-mini' },
    { id: 'gpt-5-nano' },
    { id: 'gpt-4.1' },
    { id: 'gpt-4.1-mini' },
    { id: 'gpt-4.1-nano' },
    { id: 'gpt-4o' },
    { id: 'gpt-4o-mini' },
    { id: 'gpt-4-turbo' },
    { id: 'gpt-4' },
    { id: 'gpt-3.5-turbo' },
  ];

  private static readonly DEFAULT_SPEECH_MODELS: OpenAISpeechModelInfo[] = [
    { id: 'gpt-4o-mini-tts', mode: 'create_speech' },
    { id: 'tts-1', mode: 'create_speech' },
    { id: 'tts-1-hd', mode: 'create_speech' },
    { id: 'gpt-4o-transcribe', mode: 'create_transcription' },
    { id: 'whisper-1', mode: 'create_transcription' },
  ];

  constructor(
    private readonly credentials: ICredentialService,
    private readonly provider: IOpenAIProvider,
    private readonly storage?: IStoragePlugin,
  ) {}

  async testCredential(orgId: string, credentialId: string): Promise<OpenAITestResult> {
    const material = await this.getCredentialMaterial(orgId, credentialId);
    const result = await this.provider.testConnection({ credential: material });

    if (result.ok) {
      await this.credentials.markTested(orgId, credentialId);
    }

    return result;
  }

  async listModels(orgId: string, credentialId: string, actionMode?: OpenAIModelActionMode): Promise<OpenAIModelInfo[]> {
    const material = await this.getCredentialMaterial(orgId, credentialId);
    try {
      const models = await this.provider.listModels({ credential: material, actionMode });
      return [...models].sort((a, b) => a.id.localeCompare(b.id));
    } catch (error) {
      const publicError = this.toPublicError(error);
      logger.warn(
        {
          operation: 'openai.list_models',
          orgId,
          credentialId,
          actionMode,
          statusCode: publicError.statusCode,
          error: error instanceof Error ? error.message : String(error),
        },
        'OpenAI model listing failed; using fallback model catalog',
      );

      if (this.shouldUseModelFallback(publicError)) {
        if (actionMode === 'agent') {
          return OpenAIIntegrationService.DEFAULT_CHAT_MODELS;
        }

        return OpenAIIntegrationService.DEFAULT_CHAT_MODELS;
      }

      throw publicError;
    }
  }

  async listSpeechModels(input: ListSpeechModelsPayload): Promise<OpenAISpeechModelInfo[]> {
    const material = await this.getCredentialMaterial(input.orgId, input.credentialId);
    try {
      const models = await this.provider.listSpeechModels({
        credential: material,
        actionMode: input.actionMode,
        timeoutMs: input.timeoutMs,
      });

      return [...models].sort((a, b) => a.id.localeCompare(b.id));
    } catch (error) {
      const publicError = this.toPublicError(error);
      logger.warn(
        {
          operation: 'openai.list_speech_models',
          orgId: input.orgId,
          credentialId: input.credentialId,
          actionMode: input.actionMode,
          statusCode: publicError.statusCode,
          error: error instanceof Error ? error.message : String(error),
        },
        'OpenAI speech model listing failed; using fallback model catalog',
      );

      if (this.shouldUseModelFallback(publicError)) {
        if (input.actionMode) {
          return OpenAIIntegrationService.DEFAULT_SPEECH_MODELS.filter((m) => m.mode === input.actionMode);
        }

        return OpenAIIntegrationService.DEFAULT_SPEECH_MODELS;
      }

      throw publicError;
    }
  }

  async preview(input: OpenAIPreviewPayload): Promise<OpenAIChatCompletionOutput> {
    try {
      const material = await this.getCredentialMaterial(input.orgId, input.credentialId);

      return await this.provider.createChatCompletion({
        credential: material,
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        topP: input.topP,
        frequencyPenalty: input.frequencyPenalty,
        presencePenalty: input.presencePenalty,
        timeoutMs: input.timeoutMs,
      });
    } catch (error) {
      throw this.toPublicError(error);
    }
  }

  async createSpeech(input: CreateSpeechPayload): Promise<CreateSpeechResult> {
    if (!this.storage) {
      throw new AppError('Storage plugin is required for speech generation', 500);
    }
    if (input.input.length > 5000) {
      throw new ValidationError('Speech input exceeds maximum length (5000)');
    }

    const resolvedModel = this.resolveSpeechModel(input.model);
    const startedAt = Date.now();
    try {
      logger.info(
        {
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: resolvedModel,
          voice: input.voice,
          inputChars: input.input.length,
          action: 'createSpeech',
        },
        'STEP 5: OpenAI service request started',
      );

      if (resolvedModel !== input.model) {
        logger.warn(
          {
            orgId: input.orgId,
            credentialId: input.credentialId,
            requestedModel: input.model,
            resolvedModel,
            action: 'createSpeech',
          },
          'OpenAI speech model is incompatible with /audio/speech; using compatible TTS model',
        );
      }

      const material = await this.getCredentialMaterial(input.orgId, input.credentialId);

      logger.info(
        {
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: resolvedModel,
          voice: input.voice,
          action: 'provider.createSpeech',
        },
        'STEP 6: OpenAI provider request',
      );

      const speech = await this.provider.createSpeech({
        credential: material,
        model: resolvedModel,
        voice: input.voice,
        input: input.input,
        format: input.format,
        speed: input.speed,
        timeoutMs: input.timeoutMs,
      });

      logger.info(
        {
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: speech.model,
          voice: speech.voice,
          mimeType: speech.mimeType,
          outputBytes: speech.audioBuffer.length,
          action: 'provider.createSpeech',
        },
        'STEP 7: OpenAI provider response received',
      );

      const extension = this.mimeToExtension(speech.mimeType, input.format);
      logger.info(
        {
          orgId: input.orgId,
          credentialId: input.credentialId,
          destination: `integrations/openai/${input.orgId}/voice`,
          fileExtension: extension,
          mimeType: speech.mimeType,
          outputBytes: speech.audioBuffer.length,
          action: 'storage.uploadFile',
        },
        'STEP 8: Uploading generated speech audio',
      );

      const upload = await this.storage.uploadFile(
        {
          fieldname: 'audio',
          originalname: `openai-tts-${Date.now()}.${extension}`,
          encoding: '7bit',
          mimetype: speech.mimeType,
          size: speech.audioBuffer.length,
          destination: '',
          filename: '',
          path: '',
          buffer: speech.audioBuffer,
          stream: Readable.from([]),
        },
        `integrations/openai/${input.orgId}/voice`,
      );

      logger.info(
        {
          orgId: input.orgId,
          credentialId: input.credentialId,
          audioUrl: upload.url,
          action: 'storage.uploadFile',
        },
        'STEP 9: Speech audio uploaded successfully',
      );

      logger.info(
        {
          operation: 'openai.create_speech',
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: speech.model,
          latencyMs: Date.now() - startedAt,
          cost: null,
          outputBytes: speech.audioBuffer.length,
        },
        'OpenAI voice call completed',
      );

      return {
        audioUrl: upload.url,
        mimeType: speech.mimeType,
        model: speech.model,
        voice: speech.voice,
      };
    } catch (error) {
      logger.warn(
        {
          operation: 'openai.create_speech',
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: resolvedModel,
          voice: input.voice,
          latencyMs: Date.now() - startedAt,
          ...this.buildErrorDebugMeta(error),
          error: error instanceof Error ? error.message : String(error),
        },
        'OpenAI voice call failed',
      );
      throw this.toPublicError(error);
    }
  }

  async createTranscription(input: CreateTranscriptionPayload): Promise<CreateTranscriptionResult> {
    if (input.audioBuffer.length > 25 * 1024 * 1024) {
      throw new ValidationError('Audio file exceeds maximum size (25MB)');
    }
    if (!/^audio\//.test(input.mimeType)) {
      throw new ValidationError('Invalid audio format');
    }

    const startedAt = Date.now();
    try {
      logger.info(
        {
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: input.model,
          mimeType: input.mimeType,
          audioBytes: input.audioBuffer.length,
          action: 'createTranscription',
        },
        'STEP 5: OpenAI transcription request started',
      );

      const material = await this.getCredentialMaterial(input.orgId, input.credentialId);

      logger.info(
        {
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: input.model,
          action: 'provider.createTranscription',
        },
        'STEP 6: OpenAI transcription provider request',
      );

      const result = await this.provider.createTranscription({
        credential: material,
        model: input.model,
        audioBuffer: input.audioBuffer,
        fileName: input.fileName,
        mimeType: input.mimeType,
        language: input.language,
        prompt: input.prompt,
        timeoutMs: input.timeoutMs,
      });

      logger.info(
        {
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: result.model,
          outputChars: result.text.length,
          action: 'provider.createTranscription',
        },
        'STEP 7: OpenAI transcription provider response received',
      );

      logger.info(
        {
          operation: 'openai.create_transcription',
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: result.model,
          latencyMs: Date.now() - startedAt,
          cost: null,
          outputChars: result.text.length,
          durationSeconds: result.durationSeconds,
        },
        'OpenAI voice call completed',
      );

      return {
        text: result.text,
        model: result.model,
        durationSeconds: result.durationSeconds,
      };
    } catch (error) {
      logger.warn(
        {
          operation: 'openai.create_transcription',
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: input.model,
          latencyMs: Date.now() - startedAt,
          ...this.buildErrorDebugMeta(error),
          error: error instanceof Error ? error.message : String(error),
        },
        'OpenAI voice call failed',
      );
      throw this.toPublicError(error);
    }
  }

  async executeNode(input: ExecuteOpenAINodePayload): Promise<ExecuteOpenAINodeResult> {
    if (input.mode === 'voice') {
      const actionMode = input.voiceAction ?? 'create_speech';

      if (actionMode === 'create_speech') {
        if (!input.voice?.trim()) {
          throw new ValidationError('voice is required for create_speech mode');
        }

        const speech = await this.createSpeech({
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: input.model,
          voice: input.voice.trim(),
          input: input.prompt,
          timeoutMs: input.timeoutMs,
        });

        return {
          content: speech.audioUrl,
          model: speech.model,
          outputType: 'audio',
          mimeType: speech.mimeType,
        };
      }

      const audioUrl = (input.audioUrl ?? input.prompt).trim();
      if (!audioUrl) {
        throw new ValidationError('audio URL is required for create_transcription mode');
      }

      let validatedAudioUrl: URL;
      try {
        validatedAudioUrl = new URL(audioUrl);
      } catch {
        throw new ValidationError('audio URL must be a valid absolute URL for create_transcription mode');
      }

      const response = await fetch(validatedAudioUrl);
      if (!response.ok) {
        throw new AppError(`Could not fetch audio source: HTTP ${response.status}`, 400);
      }

      const arrayBuffer = await response.arrayBuffer();
      const mimeType = response.headers.get('content-type') || 'audio/mpeg';
      const fileName = validatedAudioUrl.pathname.split('/').pop() || `audio-${Date.now()}.mp3`;

      const transcription = await this.createTranscription({
        orgId: input.orgId,
        credentialId: input.credentialId,
        model: input.model,
        audioBuffer: Buffer.from(arrayBuffer),
        fileName,
        mimeType,
        prompt: input.systemPrompt,
        timeoutMs: input.timeoutMs,
      });

      return {
        content: transcription.text,
        model: transcription.model,
        outputType: 'text',
      };
    }

    const messages: OpenAIMessage[] = [
      ...(input.systemPrompt ? [{ role: 'system', content: input.systemPrompt } as const] : []),
      { role: 'user', content: input.prompt },
    ];

    const completion = await this.preview({
      orgId: input.orgId,
      credentialId: input.credentialId,
      model: input.model,
      messages,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      topP: input.topP,
      frequencyPenalty: input.frequencyPenalty,
      presencePenalty: input.presencePenalty,
      timeoutMs: input.timeoutMs,
    });

    return {
      content: completion.content,
      model: completion.model,
      outputType: 'text',
    };
  }

  private async getCredentialMaterial(orgId: string, credentialId: string): Promise<OpenAICredentialMaterial> {
    logger.info({ orgId, credentialId, action: 'getCredentialMaterial' }, 'STEP 4: DB query');
    const secret = await this.credentials.decryptSecret(orgId, credentialId, CredentialType.OPENAI);
    const apiKey = secret['apiKey'];

    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new ValidationError('OpenAI credential payload is invalid');
    }

    return {
      apiKey: apiKey.trim(),
      ...(typeof secret['baseUrl'] === 'string' ? { baseUrl: secret['baseUrl'] } : {}),
      ...(typeof secret['organization'] === 'string' ? { organization: secret['organization'] } : {}),
      ...(typeof secret['project'] === 'string' ? { project: secret['project'] } : {}),
    };
  }

  private buildErrorDebugMeta(error: unknown): Record<string, unknown> {
    if (!(error instanceof Error)) {
      return {};
    }

    const known = error as Error & {
      statusCode?: number;
      code?: string;
      providerStatus?: number;
    };

    return {
      errorName: error.name,
      errorCode: known.code,
      statusCode: known.statusCode,
      providerStatus: known.providerStatus,
      stack: error.stack,
    };
  }

  private toPublicError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }
    return new AppError('OpenAI request failed', 502);
  }

  private shouldUseModelFallback(error: AppError): boolean {
    return error.statusCode === 401 || error.statusCode === 403 || error.statusCode === 408 ||
      error.statusCode === 429 || error.statusCode >= 500;
  }

  private mimeToExtension(mimeType: string, requestedFormat?: string): string {
    if (requestedFormat) return requestedFormat;
    if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
    if (mimeType.includes('wav')) return 'wav';
    if (mimeType.includes('ogg') || mimeType.includes('opus')) return 'opus';
    if (mimeType.includes('flac')) return 'flac';
    return 'audio';
  }

  private resolveSpeechModel(model: string): string {
    const normalized = model.trim();
    const lowered = normalized.toLowerCase();

    if (lowered.includes('audio-preview')) {
      return 'gpt-4o-mini-tts';
    }

    if (lowered.includes('tts')) {
      return normalized;
    }

    throw new ValidationError(
      `Model ${normalized} does not support create_speech. Use a TTS model like gpt-4o-mini-tts, tts-1, or tts-1-hd.`,
    );
  }
}
