import { CredentialType } from '@prisma/client';
import { Readable } from 'stream';
import { AppError, ValidationError } from '../../utils/errors';
import type { ICredentialService } from '../../features/credentials';
import type { IStoragePlugin } from '../storage';
import type {
  CreateSpeechPayload,
  CreateSpeechResult,
  CreateOpenAICredentialPayload,
  CreateTranscriptionPayload,
  CreateTranscriptionResult,
  ExecuteOpenAINodePayload,
  ExecuteOpenAINodeResult,
  IOpenAIIntegrationService,
  IOpenAIProvider,
  ListSpeechModelsPayload,
  OpenAIChatCompletionOutput,
  OpenAICredentialMaterial,
  OpenAICredentialView,
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

  async createCredential(input: CreateOpenAICredentialPayload): Promise<OpenAICredentialView> {
    const orgId = input.orgId.trim();
    const name = input.name.trim();
    const apiKey = input.apiKey.trim();

    if (!orgId) throw new ValidationError('orgId is required');
    if (!name) throw new ValidationError('Credential name is required');
    if (!apiKey) throw new ValidationError('API key is required');

    const view = await this.credentials.createCredential({
      orgId,
      name,
      type: CredentialType.OPENAI,
      secret: {
        apiKey,
        ...(this.normalizeOptional(input.baseUrl) ? { baseUrl: this.normalizeOptional(input.baseUrl) } : {}),
        ...(this.normalizeOptional(input.organization) ? { organization: this.normalizeOptional(input.organization) } : {}),
        ...(this.normalizeOptional(input.project) ? { project: this.normalizeOptional(input.project) } : {}),
      },
      metadata: {
        ...(this.normalizeOptional(input.baseUrl) ? { baseUrl: this.normalizeOptional(input.baseUrl) } : {}),
        ...(this.normalizeOptional(input.organization) ? { organization: this.normalizeOptional(input.organization) } : {}),
        ...(this.normalizeOptional(input.project) ? { project: this.normalizeOptional(input.project) } : {}),
      },
      isActive: true,
    });

    return view;
  }

  async listCredentials(orgId: string): Promise<OpenAICredentialView[]> {
    return this.credentials.listCredentials(orgId, {
      type: CredentialType.OPENAI,
      includeInactive: true,
      includeRevoked: true,
    });
  }

  async testCredential(orgId: string, credentialId: string): Promise<OpenAITestResult> {
    const material = await this.getCredentialMaterial(orgId, credentialId);
    const result = await this.provider.testConnection({ credential: material });

    if (result.ok) {
      await this.credentials.markTested(orgId, credentialId);
    }

    return result;
  }

  async listModels(orgId: string, credentialId: string): Promise<OpenAIModelInfo[]> {
    const material = await this.getCredentialMaterial(orgId, credentialId);
    try {
      const models = await this.provider.listModels({ credential: material });
      return [...models].sort((a, b) => a.id.localeCompare(b.id));
    } catch (error) {
      const publicError = this.toPublicError(error);
      logger.warn(
        {
          operation: 'openai.list_models',
          orgId,
          credentialId,
          statusCode: publicError.statusCode,
          error: error instanceof Error ? error.message : String(error),
        },
        'OpenAI model listing failed; using fallback model catalog',
      );

      if (this.shouldUseModelFallback(publicError)) {
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

    const startedAt = Date.now();
    try {
      const material = await this.getCredentialMaterial(input.orgId, input.credentialId);
      const speech = await this.provider.createSpeech({
        credential: material,
        model: input.model,
        voice: input.voice,
        input: input.input,
        format: input.format,
        speed: input.speed,
        timeoutMs: input.timeoutMs,
      });

      const extension = this.mimeToExtension(speech.mimeType, input.format);
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
          operation: 'openai.create_speech',
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
          latencyMs: Date.now() - startedAt,
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
      const material = await this.getCredentialMaterial(input.orgId, input.credentialId);
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
          operation: 'openai.create_transcription',
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
          latencyMs: Date.now() - startedAt,
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

      const audioUrl = input.prompt.trim();
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

  async revokeCredential(orgId: string, credentialId: string): Promise<OpenAICredentialView> {
    return this.credentials.revokeCredential(orgId, credentialId);
  }

  private async getCredentialMaterial(orgId: string, credentialId: string): Promise<OpenAICredentialMaterial> {
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

  private normalizeOptional(value?: string): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
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
}
