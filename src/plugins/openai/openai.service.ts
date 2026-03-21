import { CredentialType } from '@prisma/client';
import { Readable } from 'stream';
import { AppError, ValidationError } from '../../utils/errors';
import type { ICredentialService } from '../../features/credentials';
import type { IStoragePlugin } from '../storage';
import { MAX_TOOL_CALLS } from './openai.constants';
import type {
  AskAssistantPayload,
  AskAssistantResult,
  CreateImagePayload,
  CreateImageResult,
  CreateSpeechPayload,
  CreateSpeechResult,
  CreateTranscriptionPayload,
  CreateTranscriptionResult,
  ExecuteOpenAINodePayload,
  ExecuteOpenAINodeResult,
  GenerateVariablesPayload,
  GenerateVariablesResult,
  IOpenAIIntegrationService,
  IOpenAIProvider,
  ListSpeechModelsPayload,
  OpenAIModelActionMode,
  OpenAIChatCompletionOutput,
  OpenAICredentialMaterial,
  OpenAIAssistantInfo,
  OpenAIMessage,
  OpenAIModelInfo,
  OpenAISpeechModelInfo,
  OpenAIPreviewPayload,
  OpenAITestResult,
  VariableToExtract,
} from './openai.types';

export class OpenAIIntegrationService implements IOpenAIIntegrationService {
  private static readonly DEFAULT_TEXT_MODELS: OpenAIModelInfo[] = [
    { id: 'gpt-3.5-turbo' },
    { id: 'gpt-4' },
    { id: 'gpt-4o-mini' },
    { id: 'gpt-4o' },
    { id: 'gpt-4.1-mini' },
    { id: 'gpt-4.1' },
    { id: 'gpt-5-mini' },
    { id: 'gpt-5' },
  ];

  private static readonly DEFAULT_GENERATE_VARIABLE_MODELS: OpenAIModelInfo[] = [
    { id: 'gpt-4o-mini' },
    { id: 'gpt-4.1-mini' },
    { id: 'gpt-4.1' },
    { id: 'gpt-5-mini' },
    { id: 'gpt-5' },
  ];

  private static readonly DEFAULT_IMAGE_MODELS: OpenAIModelInfo[] = [
    { id: 'gpt-image-1' },
    { id: 'dall-e-3' },
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

  // ── Existing methods ────────────────────────────────────────────────────

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
        return this.getFallbackModels(actionMode);
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

  // ── New: Assistants API ─────────────────────────────────────────────────

  async listAssistants(orgId: string, credentialId: string): Promise<OpenAIAssistantInfo[]> {
    const material = await this.getCredentialMaterial(orgId, credentialId);
    try {
      return await this.provider.listAssistants({ credential: material, limit: 100 });
    } catch (error) {
      throw this.toPublicError(error);
    }
  }

  async askAssistant(input: AskAssistantPayload): Promise<AskAssistantResult> {
    const startedAt = Date.now();
    try {
      const material = await this.getCredentialMaterial(input.orgId, input.credentialId);

      // 1. Create or reuse thread
      let threadId = input.threadId;
      if (!threadId) {
        const thread = await this.provider.createThread({ credential: material });
        threadId = thread.id;
        logger.info(
          { orgId: input.orgId, threadId, action: 'askAssistant.createThread' },
          'Created new OpenAI thread',
        );
      }

      // 2. Send user message
      await this.provider.createThreadMessage({
        credential: material,
        threadId,
        role: 'user',
        content: input.message,
      });

      // 3. Create a run
      let run = await this.provider.createRun({
        credential: material,
        threadId,
        assistantId: input.assistantId,
        additionalInstructions: input.additionalInstructions,
        timeoutMs: input.timeoutMs,
      });

      // 4. Poll until completed (with tool call handling)
      let toolCallIterations = 0;

      while (run.status !== 'completed' && run.status !== 'failed' && run.status !== 'cancelled' && run.status !== 'expired') {
        if (run.status === 'requires_action' && run.requiredAction?.toolCalls) {
          if (toolCallIterations >= MAX_TOOL_CALLS) {
            throw new AppError(`Assistant exceeded maximum tool call iterations (${MAX_TOOL_CALLS})`, 400);
          }

          const toolOutputs = await this.executeToolCalls(run.requiredAction.toolCalls, input.functions ?? []);

          run = await this.provider.submitToolOutputs({
            credential: material,
            threadId,
            runId: run.id,
            toolOutputs,
            timeoutMs: input.timeoutMs,
          });

          toolCallIterations++;
          continue;
        }

        // Status is 'queued' or 'in_progress' — poll
        await this.sleep(1000);

        run = await this.provider.retrieveRun({
          credential: material,
          threadId,
          runId: run.id,
          timeoutMs: input.timeoutMs,
        });
      }

      if (run.status !== 'completed') {
        throw new AppError(`Assistant run ended with status: ${run.status}`, 502);
      }

      // 5. Fetch assistant response
      const messages = await this.provider.listMessages({
        credential: material,
        threadId,
        limit: 1,
      });

      const assistantMessage = messages.find((m) => m.role === 'assistant');
      const response = assistantMessage?.content ?? '';

      logger.info(
        {
          operation: 'openai.ask_assistant',
          orgId: input.orgId,
          assistantId: input.assistantId,
          threadId,
          latencyMs: Date.now() - startedAt,
          toolCallIterations,
          responseLength: response.length,
        },
        'OpenAI assistant call completed',
      );

      return {
        response,
        threadId,
        model: '', // The Assistants API doesn't return the model in the message
      };
    } catch (error) {
      logger.warn(
        {
          operation: 'openai.ask_assistant',
          orgId: input.orgId,
          assistantId: input.assistantId,
          latencyMs: Date.now() - startedAt,
          ...this.buildErrorDebugMeta(error),
          error: error instanceof Error ? error.message : String(error),
        },
        'OpenAI assistant call failed',
      );
      throw this.toPublicError(error);
    }
  }

  // ── New: Generate Variables ─────────────────────────────────────────────

  async generateVariables(input: GenerateVariablesPayload): Promise<GenerateVariablesResult> {
    const startedAt = Date.now();
    try {
      const material = await this.getCredentialMaterial(input.orgId, input.credentialId);

      const jsonSchema = this.buildExtractionSchema(input.variablesToExtract);
      const messages = [
        { role: 'system' as const, content: 'Extract the requested information from the user message. Respond with a JSON object matching the schema.' },
        { role: 'user' as const, content: input.prompt },
      ];

      const result = await this.provider.createJsonCompletion({
        credential: material,
        model: input.model,
        messages,
        jsonSchema,
        temperature: input.temperature,
        timeoutMs: input.timeoutMs,
      });

      logger.info(
        {
          operation: 'openai.generate_variables',
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: result.model,
          latencyMs: Date.now() - startedAt,
          variableCount: input.variablesToExtract.length,
        },
        'OpenAI generate variables completed',
      );

      return {
        variables: result.parsed,
        model: result.model,
      };
    } catch (error) {
      logger.warn(
        {
          operation: 'openai.generate_variables',
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: input.model,
          latencyMs: Date.now() - startedAt,
          ...this.buildErrorDebugMeta(error),
          error: error instanceof Error ? error.message : String(error),
        },
        'OpenAI generate variables failed',
      );
      throw this.toPublicError(error);
    }
  }

  // ── New: Image Generation ───────────────────────────────────────────────

  async createImage(input: CreateImagePayload): Promise<CreateImageResult> {
    if (!this.storage) {
      throw new AppError('Storage plugin is required for image generation', 500);
    }

    const startedAt = Date.now();
    try {
      const material = await this.getCredentialMaterial(input.orgId, input.credentialId);

      logger.info(
        {
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: input.model ?? 'dall-e-3',
          promptChars: input.prompt.length,
          action: 'createImage',
        },
        'OpenAI image generation request started',
      );

      const images = await this.provider.createImage({
        credential: material,
        model: input.model,
        prompt: input.prompt,
        size: input.size,
        quality: input.quality,
        n: input.n,
        timeoutMs: input.timeoutMs,
      });

      if (images.length === 0) {
        throw new AppError('OpenAI returned no images', 502);
      }

      const firstImage = images[0]!;

      // Download the image and upload to our storage
      const response = await fetch(firstImage.url);
      if (!response.ok) {
        throw new AppError('Failed to download generated image from OpenAI', 502);
      }

      const arrayBuffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);
      const mimeType = response.headers.get('content-type') || 'image/png';

      const upload = await this.storage.uploadFile(
        {
          fieldname: 'image',
          originalname: `openai-image-${Date.now()}.png`,
          encoding: '7bit',
          mimetype: mimeType,
          size: imageBuffer.length,
          destination: '',
          filename: '',
          path: '',
          buffer: imageBuffer,
          stream: Readable.from([]),
        },
        `integrations/openai/${input.orgId}/images`,
      );

      logger.info(
        {
          operation: 'openai.create_image',
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: input.model ?? 'dall-e-3',
          latencyMs: Date.now() - startedAt,
          imageUrl: upload.url,
        },
        'OpenAI image generation completed',
      );

      return {
        imageUrl: upload.url,
        revisedPrompt: firstImage.revisedPrompt,
        model: input.model ?? 'dall-e-3',
      };
    } catch (error) {
      logger.warn(
        {
          operation: 'openai.create_image',
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: input.model,
          latencyMs: Date.now() - startedAt,
          ...this.buildErrorDebugMeta(error),
          error: error instanceof Error ? error.message : String(error),
        },
        'OpenAI image generation failed',
      );
      throw this.toPublicError(error);
    }
  }

  // ── Node execution (engine integration) ─────────────────────────────────

  async executeNode(input: ExecuteOpenAINodePayload): Promise<ExecuteOpenAINodeResult> {
    // ── Voice mode ──
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

    // ── Assistant mode ──
    if (input.mode === 'assistant') {
      if (!input.assistantId?.trim()) {
        throw new ValidationError('assistantId is required for assistant mode');
      }

      const result = await this.askAssistant({
        orgId: input.orgId,
        credentialId: input.credentialId,
        assistantId: input.assistantId.trim(),
        message: input.prompt,
        threadId: input.threadId,
        additionalInstructions: input.additionalInstructions,
        functions: input.functions,
        timeoutMs: input.timeoutMs,
      });

      return {
        content: result.response,
        model: result.model,
        outputType: 'text',
        threadId: result.threadId,
      };
    }

    // ── Generate Variables mode ──
    if (input.mode === 'generate_variables') {
      if (!input.variablesToExtract || input.variablesToExtract.length === 0) {
        throw new ValidationError('variablesToExtract is required for generate_variables mode');
      }

      const result = await this.generateVariables({
        orgId: input.orgId,
        credentialId: input.credentialId,
        model: input.model,
        prompt: input.prompt,
        variablesToExtract: input.variablesToExtract,
        temperature: input.temperature,
        timeoutMs: input.timeoutMs,
      });

      return {
        content: JSON.stringify(result.variables),
        model: result.model,
        outputType: 'text',
        variables: result.variables,
      };
    }

    // ── Image mode ──
    if (input.mode === 'image') {
      const result = await this.createImage({
        orgId: input.orgId,
        credentialId: input.credentialId,
        model: input.model,
        prompt: input.prompt,
        size: input.imageSize,
        quality: input.imageQuality,
        timeoutMs: input.timeoutMs,
      });

      return {
        content: result.imageUrl,
        model: result.model,
        outputType: 'image',
      };
    }

    // ── Chat Completion mode (default) ──
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

  // ── Private helpers ─────────────────────────────────────────────────────

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

  private async executeToolCalls(
    toolCalls: Array<{ id: string; functionName: string; arguments: string }>,
    functions: Array<{ name: string; code: string }>,
  ): Promise<Array<{ tool_call_id: string; output: string }>> {
    const outputs: Array<{ tool_call_id: string; output: string }> = [];

    for (const tc of toolCalls) {
      const fn = functions.find((f) => f.name === tc.functionName);
      if (!fn) {
        outputs.push({
          tool_call_id: tc.id,
          output: JSON.stringify({ error: `Function "${tc.functionName}" not found` }),
        });
        continue;
      }

      try {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.arguments);
        } catch {
          // noop — keep empty args
        }

        // Execute the function code in a safe-ish manner
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const executor = new AsyncFunction('args', fn.code);
        const result = await executor(args);
        outputs.push({
          tool_call_id: tc.id,
          output: typeof result === 'string' ? result : JSON.stringify(result ?? null),
        });
      } catch (error) {
        outputs.push({
          tool_call_id: tc.id,
          output: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
        });
      }
    }

    return outputs;
  }

  private buildExtractionSchema(variables: VariableToExtract[]): Record<string, unknown> {
    const properties: Record<string, unknown> = {};

    for (const v of variables) {
      const prop: Record<string, unknown> = {
        type: v.type ?? 'string',
      };
      if (v.description) {
        prop.description = v.description;
      }
      properties[v.name] = prop;
    }

    return {
      name: 'extracted_variables',
      strict: true,
      schema: {
        type: 'object',
        properties,
        required: variables.map((v) => v.name),
        additionalProperties: false,
      },
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
    const message = error instanceof Error ? error.message : String(error);
    const prefix = 'OpenAI request failed: ';
    
    // If it's already an AppError, we might want to preserve its status code
    const statusCode = (error as any)?.statusCode || 502;

    if (message.startsWith(prefix)) {
      return error instanceof AppError ? error : new AppError(message, statusCode);
    }
    
    return new AppError(`${prefix}${message}`, statusCode);
  }

  private shouldUseModelFallback(error: AppError): boolean {
    return error.statusCode === 401 || error.statusCode === 403 || error.statusCode === 408 ||
      error.statusCode === 429 || error.statusCode >= 500;
  }

  private getFallbackModels(actionMode?: OpenAIModelActionMode): OpenAIModelInfo[] {
    if (actionMode === 'image') {
      return OpenAIIntegrationService.DEFAULT_IMAGE_MODELS;
    }

    if (actionMode === 'generate_variables') {
      return OpenAIIntegrationService.DEFAULT_GENERATE_VARIABLE_MODELS;
    }

    return OpenAIIntegrationService.DEFAULT_TEXT_MODELS;
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
