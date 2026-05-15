import type {
  OpenAIModelActionMode,
  OpenAIVoiceActionMode,
  OpenAIChatCompletionInput,
  OpenAIChatCompletionOutput,
  OpenAICredentialMaterial,
  OpenAIModelInfo,
  OpenAISpeechModelInfo,
  OpenAITestResult,
  OpenAIAssistantInfo,
  OpenAIThreadInfo,
  OpenAIRunInfo,
  OpenAIThreadMessage,
  OpenAIImageResult,
} from './openai.types';
import { AppError } from '../../utils/errors';
import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IOpenAIPlugin } from './openai.interface';
import {
  isTextChatCompletionModel,
  usesMaxCompletionTokensParam,
} from './openai-model-capabilities';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_CHAT_COMPLETION_TIMEOUT_MS = 90_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

type ProviderErrorCode = 'auth_error' | 'quota_error' | 'timeout' | 'network_error' | 'provider_error';

interface RequestOptions {
  credential: OpenAICredentialMaterial;
  path: string;
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
  timeoutMs?: number;
  attempt?: number;
}

interface OpenAIModelListResponse {
  data: Array<{
    id: string;
    owned_by?: string;
  }>;
}

interface OpenAIChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    finish_reason?: string;
    text?: string;
    message?: {
      content?: unknown;
      refusal?: string;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface OpenAITranscriptionResponse {
  text?: string;
  duration?: number;
  model?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toStatusCode(code: ProviderErrorCode, providerStatus?: number): number {
  if (code === 'auth_error') return 401;
  if (code === 'quota_error') return 429;
  if (code === 'timeout') return 504;
  if (providerStatus && providerStatus >= 400 && providerStatus < 600) return providerStatus;
  return 502;
}

export class OpenAIProviderError extends AppError {
  constructor(
    public readonly code: ProviderErrorCode,
    public readonly providerStatus?: number,
    message?: string,
  ) {
    const defaultMsg = providerStatus ? `OpenAI request failed with status ${providerStatus}` : 'OpenAI request failed';
    super(message || defaultMsg, toStatusCode(code, providerStatus));
  }
}

export class OpenAIPlugin implements IPlugin, IOpenAIPlugin {
  readonly name = 'openai';

  async initialize(_registry: IPluginRegistry): Promise<void> {
    logger.info('OpenAIPlugin: ready');
  }

  async shutdown(): Promise<void> {
    // Stateless HTTP client; nothing to close.
  }

  async testConnection(input: {
    credential: OpenAICredentialMaterial;
    timeoutMs?: number;
  }): Promise<OpenAITestResult> {
    const startedAt = Date.now();
    try {
      await this.jsonRequest<OpenAIModelListResponse>({
        credential: input.credential,
        path: '/models',
        method: 'GET',
        timeoutMs: input.timeoutMs ?? 10_000,
      });

      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (error instanceof OpenAIProviderError) {
        return {
          ok: false,
          latencyMs: Date.now() - startedAt,
          statusCode: error.providerStatus ?? error.statusCode,
          errorCode: error.code,
          errorMessage: error.message,
        };
      }
      throw error;
    }
  }

  async listModels(input: {
    credential: OpenAICredentialMaterial;
    actionMode?: OpenAIModelActionMode;
    timeoutMs?: number;
  }): Promise<OpenAIModelInfo[]> {
    const payload = await this.jsonRequest<OpenAIModelListResponse>({
      credential: input.credential,
      path: '/models',
      method: 'GET',
      timeoutMs: input.timeoutMs,
    });

    if (!Array.isArray(payload.data)) {
      throw new OpenAIProviderError('provider_error', 502, 'Invalid model list response from OpenAI');
    }

    return payload.data
      .filter((item) => typeof item.id === 'string' && item.id.length > 0)
      .filter((item) => {
        if (!input.actionMode) return true;
        if (input.actionMode === 'chat_completion' || input.actionMode === 'generate_variables' || input.actionMode === 'assistant') {
          return isTextChatCompletionModel(item.id);
        }
        if (input.actionMode === 'image') {
          const id = item.id.toLowerCase();
          return id.includes('dall') || id.includes('image');
        }
        return true;
      })
      .map((item) => ({
        id: item.id,
        ownedBy: item.owned_by,
      }));
  }

  async createChatCompletion(input: OpenAIChatCompletionInput): Promise<OpenAIChatCompletionOutput> {
    const body: Record<string, unknown> = {
      model: input.model,
      messages: input.messages.map((m) => ({
        role: m.role === 'dialogue' ? 'user' : m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
      })),
    };

    if (input.tools && input.tools.length > 0) {
      body.tools = input.tools.map((t: any) => {
        if (typeof t.function?.parameters === 'string') {
          try {
            return {
              ...t,
              function: {
                ...t.function,
                parameters: JSON.parse(t.function.parameters)
              }
            };
          } catch {
            return t;
          }
        }
        return t;
      });
    }

    if (input.temperature !== undefined) body.temperature = input.temperature;
    const safeMaxTokens =
      typeof input.maxTokens === 'number' && Number.isFinite(input.maxTokens) && input.maxTokens > 0
        ? Math.floor(input.maxTokens)
        : undefined;
    if (safeMaxTokens !== undefined) {
      if (usesMaxCompletionTokensParam(input.model)) {
        body.max_completion_tokens = safeMaxTokens;
      } else {
        body.max_tokens = safeMaxTokens;
      }
    }
    if (input.topP !== undefined) body.top_p = input.topP;
    if (input.frequencyPenalty !== undefined) body.frequency_penalty = input.frequencyPenalty;
    if (input.presencePenalty !== undefined) body.presence_penalty = input.presencePenalty;

    const payload = await this.jsonRequest<OpenAIChatCompletionResponse>({
      credential: input.credential,
      path: '/chat/completions',
      method: 'POST',
      body,
      timeoutMs: input.timeoutMs ?? DEFAULT_CHAT_COMPLETION_TIMEOUT_MS,
    });

    const firstChoice = payload.choices?.[0];
    const content = this.normalizeChatCompletionText(firstChoice);

    if (!content) {
      throw new OpenAIProviderError(
        'provider_error',
        502,
        `OpenAI returned an empty completion (finish_reason=${firstChoice?.finish_reason ?? 'unknown'})`,
      );
    }

    return {
      id: payload.id,
      model: payload.model,
      content,
      finishReason: firstChoice?.finish_reason,
      promptTokens: payload.usage?.prompt_tokens,
      completionTokens: payload.usage?.completion_tokens,
      totalTokens: payload.usage?.total_tokens,
      raw: payload,
    };
  }

  async listSpeechModels(input: {
    credential: OpenAICredentialMaterial;
    actionMode?: OpenAIVoiceActionMode;
    timeoutMs?: number;
  }): Promise<OpenAISpeechModelInfo[]> {
    const payload = await this.jsonRequest<OpenAIModelListResponse>({
      credential: input.credential,
      path: '/models',
      method: 'GET',
      timeoutMs: input.timeoutMs,
    });

    if (!Array.isArray(payload.data)) {
      throw new OpenAIProviderError('provider_error', 502, 'Invalid model list response from OpenAI');
    }

    const mode = input.actionMode;
    const models: OpenAISpeechModelInfo[] = [];

    for (const item of payload.data) {
      if (typeof item.id !== 'string' || item.id.length === 0) continue;
      const id = item.id.toLowerCase();
      const isSpeech = id.includes('tts');
      const isTranscription = id.includes('transcribe') || id.includes('whisper');

      if ((!mode || mode === 'create_speech') && isSpeech) {
        models.push({ id: item.id, ownedBy: item.owned_by, mode: 'create_speech' });
      }
      if ((!mode || mode === 'create_transcription') && isTranscription) {
        models.push({ id: item.id, ownedBy: item.owned_by, mode: 'create_transcription' });
      }
    }

    const dedup = new Map<string, OpenAISpeechModelInfo>();
    for (const model of models) {
      dedup.set(`${model.id}:${model.mode}`, model);
    }

    return [...dedup.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  async createSpeech(input: {
    credential: OpenAICredentialMaterial;
    model: string;
    voice: string;
    input: string;
    format?: 'mp3' | 'wav' | 'opus' | 'aac' | 'flac' | 'pcm';
    speed?: number;
    timeoutMs?: number;
  }): Promise<{
    audioBuffer: Buffer;
    mimeType: string;
    model: string;
    voice: string;
  }> {
    const timeoutMs = input.timeoutMs ?? 45_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.buildUrl(input.credential, '/audio/speech'), {
        method: 'POST',
        headers: this.buildHeaders(input.credential),
        body: JSON.stringify({
          model: input.model,
          voice: input.voice,
          input: input.input,
          ...(input.format ? { format: input.format } : {}),
          ...(input.speed !== undefined ? { speed: input.speed } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseText = await response.text();
        const parsed = this.parseJson(responseText);
        let errorMessage: string | undefined;
        if (parsed && typeof parsed === 'object' && (parsed as any).error?.message) {
          errorMessage = (parsed as any).error.message;
        }
        throw this.mapHttpError(response.status, errorMessage);
      }

      const arrayBuffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'audio/mpeg';

      return {
        audioBuffer: Buffer.from(arrayBuffer),
        mimeType: contentType,
        model: input.model,
        voice: input.voice,
      };
    } catch (error) {
      if (error instanceof OpenAIProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new OpenAIProviderError('timeout', 504, `OpenAI speech request timed out after ${timeoutMs}ms`);
      }
      throw new OpenAIProviderError('network_error', undefined, 'Could not reach OpenAI speech API');
    } finally {
      clearTimeout(timer);
    }
  }

  async createTranscription(input: {
    credential: OpenAICredentialMaterial;
    model: string;
    audioBuffer: Buffer;
    fileName: string;
    mimeType: string;
    language?: string;
    prompt?: string;
    timeoutMs?: number;
  }): Promise<{
    text: string;
    model: string;
    durationSeconds?: number;
    raw?: unknown;
  }> {
    const timeoutMs = input.timeoutMs ?? 45_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const form = new FormData();
      const normalizedMimeType = input.mimeType.split(';')[0]?.trim().toLowerCase() || 'audio/ogg';
      form.append('model', input.model);
      form.append('file', new Blob([input.audioBuffer], { type: normalizedMimeType }), input.fileName);
      if (input.language) form.append('language', input.language);
      if (input.prompt) form.append('prompt', input.prompt);

      const headers = this.buildHeaders(input.credential);
      delete headers['Content-Type'];

      const response = await fetch(this.buildUrl(input.credential, '/audio/transcriptions'), {
        method: 'POST',
        headers,
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseText = await response.text();
        const parsed = this.parseJson(responseText);
        let errorMessage: string | undefined;
        if (parsed && typeof parsed === 'object' && (parsed as any).error?.message) {
          errorMessage = (parsed as any).error.message;
        }
        throw this.mapHttpError(response.status, errorMessage);
      }

      const payload = (await response.json()) as OpenAITranscriptionResponse;
      if (!payload || typeof payload.text !== 'string') {
        throw new OpenAIProviderError('provider_error', 502, 'Invalid transcription response from OpenAI');
      }

      return {
        text: payload.text,
        model: payload.model ?? input.model,
        durationSeconds: payload.duration,
        raw: payload,
      };
    } catch (error) {
      if (error instanceof OpenAIProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new OpenAIProviderError('timeout', 504, `OpenAI transcription request timed out after ${timeoutMs}ms`);
      }
      throw new OpenAIProviderError('network_error', undefined, 'Could not reach OpenAI transcription API');
    } finally {
      clearTimeout(timer);
    }
  }

  private async jsonRequest<T>(options: RequestOptions): Promise<T> {
    const attempt = options.attempt ?? 0;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const url = this.buildUrl(options.credential, options.path);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: this.buildHeaders(options.credential),
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
      });

      const responseText = await response.text();
      const parsed = this.parseJson(responseText);

      if (!response.ok) {
        let errorMessage: string | undefined;
        if (parsed && typeof parsed === 'object' && (parsed as any).error?.message) {
          errorMessage = (parsed as any).error.message;
        }
        
        const mappedError = this.mapHttpError(response.status, errorMessage);

        if (this.shouldRetry(response.status) && attempt < MAX_RETRIES) {
          await sleep((attempt + 1) * 250);
          return this.jsonRequest<T>({ ...options, attempt: attempt + 1 });
        }

        throw mappedError;
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new OpenAIProviderError('provider_error', response.status, 'Invalid JSON response from OpenAI');
      }

      return parsed as T;
    } catch (error) {
      if (error instanceof OpenAIProviderError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new OpenAIProviderError('timeout', 504, `OpenAI request timed out after ${timeoutMs}ms`);
      }

      if (attempt < MAX_RETRIES) {
        await sleep((attempt + 1) * 250);
        return this.jsonRequest<T>({ ...options, attempt: attempt + 1 });
      }

      throw new OpenAIProviderError('network_error', undefined, 'Could not reach OpenAI');
    } finally {
      clearTimeout(timer);
    }
  }

  private buildHeaders(credential: OpenAICredentialMaterial): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credential.apiKey}`,
    };

    if (credential.organization) {
      headers['OpenAI-Organization'] = credential.organization;
    }
    if (credential.project) {
      headers['OpenAI-Project'] = credential.project;
    }

    return headers;
  }

  private buildUrl(credential: OpenAICredentialMaterial, path: string): string {
    const base = (credential.baseUrl ?? 'https://api.openai.com/v1').replace(/\/{1,10}$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }

  private parseJson(raw: string): unknown {
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private shouldRetry(status: number): boolean {
    return RETRYABLE_STATUS_CODES.has(status);
  }

  private mapHttpError(status: number, message?: string): OpenAIProviderError {
    if (status === 401 || status === 403) {
      return new OpenAIProviderError('auth_error', status, message || 'OpenAI authentication failed');
    }
    if (status === 429) {
      return new OpenAIProviderError('quota_error', status, message || 'OpenAI rate limit or quota exceeded');
    }
    if (status === 408 || status === 504) {
      return new OpenAIProviderError('timeout', status, message || 'OpenAI request timed out');
    }
    return new OpenAIProviderError('provider_error', status, message || 'OpenAI request failed');
  }

  // ── Assistants API (beta) ──────────────────────────────────────────────

  async listAssistants(input: {
    credential: OpenAICredentialMaterial;
    limit?: number;
    timeoutMs?: number;
  }): Promise<OpenAIAssistantInfo[]> {
    const payload = await this.betaJsonRequest<{ data: Array<{ id: string; name: string | null; model: string }> }>({
      credential: input.credential,
      path: '/assistants',
      method: 'GET',
      timeoutMs: input.timeoutMs,
    });

    if (!Array.isArray(payload.data)) {
      throw new OpenAIProviderError('provider_error', 502, 'Invalid assistant list response from OpenAI');
    }

    return payload.data.map((a) => ({
      id: a.id,
      name: a.name,
      model: a.model,
    }));
  }

  async createThread(input: {
    credential: OpenAICredentialMaterial;
    timeoutMs?: number;
  }): Promise<OpenAIThreadInfo> {
    const payload = await this.betaJsonRequest<{ id: string }>({
      credential: input.credential,
      path: '/threads',
      method: 'POST',
      body: {},
      timeoutMs: input.timeoutMs,
    });

    return { id: payload.id };
  }

  async createThreadMessage(input: {
    credential: OpenAICredentialMaterial;
    threadId: string;
    role: 'user' | 'assistant';
    content: string;
    timeoutMs?: number;
  }): Promise<void> {
    await this.betaJsonRequest<unknown>({
      credential: input.credential,
      path: `/threads/${input.threadId}/messages`,
      method: 'POST',
      body: { role: input.role, content: input.content },
      timeoutMs: input.timeoutMs,
    });
  }

  async createRun(input: {
    credential: OpenAICredentialMaterial;
    threadId: string;
    assistantId: string;
    additionalInstructions?: string;
    timeoutMs?: number;
  }): Promise<OpenAIRunInfo> {
    const payload = await this.betaJsonRequest<{
      id: string;
      status: string;
      required_action?: {
        type: string;
        submit_tool_outputs?: {
          tool_calls: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
      };
    }>({
      credential: input.credential,
      path: `/threads/${input.threadId}/runs`,
      method: 'POST',
      body: {
        assistant_id: input.assistantId,
        ...(input.additionalInstructions
          ? { additional_instructions: input.additionalInstructions }
          : {}),
      },
      timeoutMs: input.timeoutMs ?? 60_000,
    });

    return this.mapRunPayload(payload);
  }

  async retrieveRun(input: {
    credential: OpenAICredentialMaterial;
    threadId: string;
    runId: string;
    timeoutMs?: number;
  }): Promise<OpenAIRunInfo> {
    const payload = await this.betaJsonRequest<{
      id: string;
      status: string;
      required_action?: {
        type: string;
        submit_tool_outputs?: {
          tool_calls: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
      };
    }>({
      credential: input.credential,
      path: `/threads/${input.threadId}/runs/${input.runId}`,
      method: 'GET',
      timeoutMs: input.timeoutMs,
    });

    return this.mapRunPayload(payload);
  }

  async submitToolOutputs(input: {
    credential: OpenAICredentialMaterial;
    threadId: string;
    runId: string;
    toolOutputs: { tool_call_id: string; output: string }[];
    timeoutMs?: number;
  }): Promise<OpenAIRunInfo> {
    const payload = await this.betaJsonRequest<{
      id: string;
      status: string;
      required_action?: {
        type: string;
        submit_tool_outputs?: {
          tool_calls: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
      };
    }>({
      credential: input.credential,
      path: `/threads/${input.threadId}/runs/${input.runId}/submit_tool_outputs`,
      method: 'POST',
      body: { tool_outputs: input.toolOutputs },
      timeoutMs: input.timeoutMs ?? 60_000,
    });

    return this.mapRunPayload(payload);
  }

  async listMessages(input: {
    credential: OpenAICredentialMaterial;
    threadId: string;
    limit?: number;
    timeoutMs?: number;
  }): Promise<OpenAIThreadMessage[]> {
    const limitParam = input.limit ?? 10;
    const payload = await this.betaJsonRequest<{
      data: Array<{
        role: string;
        content: Array<{ type: string; text?: { value: string } }>;
      }>;
    }>({
      credential: input.credential,
      path: `/threads/${input.threadId}/messages?limit=${limitParam}`,
      method: 'GET',
      timeoutMs: input.timeoutMs,
    });

    if (!Array.isArray(payload.data)) {
      return [];
    }

    return payload.data.map((m) => {
      const textParts = (m.content ?? [])
        .filter((c) => c.type === 'text' && c.text?.value)
        .map((c) => c.text!.value);

      return {
        role: m.role,
        content: textParts.join('\n'),
      };
    });
  }

  // ── JSON / Structured Completion ───────────────────────────────────────

  async createJsonCompletion(input: {
    credential: OpenAICredentialMaterial;
    model: string;
    messages: Array<{ role: string; content: string }>;
    jsonSchema: Record<string, unknown>;
    temperature?: number;
    timeoutMs?: number;
  }): Promise<{ parsed: Record<string, unknown>; model: string; raw?: unknown }> {
    const body: Record<string, unknown> = {
      model: input.model,
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
      response_format: {
        type: 'json_schema',
        json_schema: input.jsonSchema,
      },
    };

    if (input.temperature !== undefined) body.temperature = input.temperature;

    const payload = await this.jsonRequest<{
      id: string;
      model: string;
      choices: Array<{ message?: { content?: string } }>;
    }>({
      credential: input.credential,
      path: '/chat/completions',
      method: 'POST',
      body,
      timeoutMs: input.timeoutMs ?? DEFAULT_CHAT_COMPLETION_TIMEOUT_MS,
    });

    const rawContent = payload.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new OpenAIProviderError('provider_error', 502, 'OpenAI returned an empty JSON completion');
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawContent) as Record<string, unknown>;
    } catch {
      throw new OpenAIProviderError('provider_error', 502, 'OpenAI response was not valid JSON');
    }

    return { parsed, model: payload.model, raw: payload };
  }

  // ── Image Generation ──────────────────────────────────────────────────

  async createImage(input: {
    credential: OpenAICredentialMaterial;
    model?: string;
    prompt: string;
    size?: string;
    quality?: string;
    n?: number;
    timeoutMs?: number;
  }): Promise<OpenAIImageResult[]> {
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      model: input.model ?? 'dall-e-3',
      n: input.n ?? 1,
    };

    if (input.size) body.size = input.size;
    if (input.quality) body.quality = input.quality;

    const payload = await this.jsonRequest<{
      data: Array<{ url?: string; revised_prompt?: string }>;
    }>({
      credential: input.credential,
      path: '/images/generations',
      method: 'POST',
      body,
      timeoutMs: input.timeoutMs ?? 60_000,
    });

    if (!Array.isArray(payload.data)) {
      throw new OpenAIProviderError('provider_error', 502, 'Invalid image generation response from OpenAI');
    }

    return payload.data
      .filter((item) => typeof item.url === 'string')
      .map((item) => ({
        url: item.url!,
        revisedPrompt: item.revised_prompt,
      }));
  }

  // ── Beta request helper (Assistants API v2 header) ────────────────────

  private async betaJsonRequest<T>(options: RequestOptions): Promise<T> {
    const attempt = options.attempt ?? 0;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const url = this.buildUrl(options.credential, options.path);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = this.buildHeaders(options.credential);
      headers['OpenAI-Beta'] = 'assistants=v2';

      const response = await fetch(url, {
        method: options.method,
        headers,
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
      });

      const responseText = await response.text();
      const parsed = this.parseJson(responseText);

      if (!response.ok) {
        let errorMessage: string | undefined;
        if (parsed && typeof parsed === 'object' && (parsed as any).error?.message) {
          errorMessage = (parsed as any).error.message;
        }
        
        const mappedError = this.mapHttpError(response.status, errorMessage);

        if (this.shouldRetry(response.status) && attempt < MAX_RETRIES) {
          await sleep((attempt + 1) * 250);
          return this.betaJsonRequest<T>({ ...options, attempt: attempt + 1 });
        }

        throw mappedError;
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new OpenAIProviderError('provider_error', response.status, 'Invalid JSON response from OpenAI');
      }

      return parsed as T;
    } catch (error) {
      if (error instanceof OpenAIProviderError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new OpenAIProviderError('timeout', 504, `OpenAI request timed out after ${timeoutMs}ms`);
      }

      if (attempt < MAX_RETRIES) {
        await sleep((attempt + 1) * 250);
        return this.betaJsonRequest<T>({ ...options, attempt: attempt + 1 });
      }

      throw new OpenAIProviderError('network_error', undefined, 'Could not reach OpenAI');
    } finally {
      clearTimeout(timer);
    }
  }

  private mapRunPayload(payload: {
    id: string;
    status: string;
    required_action?: {
      type: string;
      submit_tool_outputs?: {
        tool_calls: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
    };
  }): OpenAIRunInfo {
    const info: OpenAIRunInfo = {
      id: payload.id,
      status: payload.status,
    };

    if (
      payload.required_action?.type === 'submit_tool_outputs' &&
      payload.required_action.submit_tool_outputs?.tool_calls
    ) {
      info.requiredAction = {
        toolCalls: payload.required_action.submit_tool_outputs.tool_calls.map((tc) => ({
          id: tc.id,
          functionName: tc.function.name,
          arguments: tc.function.arguments,
        })),
      };
    }

    return info;
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      const parts: string[] = [];

      for (const item of content) {
        if (typeof item === 'string') {
          parts.push(item);
          continue;
        }

        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          const text = record['text'];
          if (typeof text === 'string') {
            parts.push(text);
            continue;
          }

          // Handles shapes like { text: { value: "..." } }
          if (text && typeof text === 'object') {
            const value = (text as Record<string, unknown>)['value'];
            if (typeof value === 'string') {
              parts.push(value);
              continue;
            }
          }

          // Handles shapes like { type: "output_text", content: "..." }
          const contentValue = record['content'];
          if (typeof contentValue === 'string') {
            parts.push(contentValue);
            continue;
          }

          // Handles nested shape { content: [{ text: "..." }, ...] }
          if (Array.isArray(contentValue)) {
            const nested = this.extractText(contentValue);
            if (nested) {
              parts.push(nested);
            }
          }
        }
      }

      return parts.join('\n').trim();
    }

    if (content && typeof content === 'object') {
      const record = content as Record<string, unknown>;

      if (typeof record['text'] === 'string') {
        return record['text'].trim();
      }

      if (typeof record['refusal'] === 'string') {
        return record['refusal'].trim();
      }

      const text = record['text'];
      if (text && typeof text === 'object') {
        const value = (text as Record<string, unknown>)['value'];
        if (typeof value === 'string') {
          return value.trim();
        }
      }

      if (typeof record['content'] === 'string') {
        return record['content'].trim();
      }

      if (Array.isArray(record['content'])) {
        return this.extractText(record['content']);
      }

      if (Array.isArray(record['output'])) {
        return this.extractText(record['output']);
      }
    }

    return '';
  }

  private extractFallbackText(content: unknown): string {
    const extracted = this.extractText(content);
    if (extracted) return extracted;

    // Final fallback: preserve something meaningful instead of failing hard.
    if (content && typeof content === 'object') {
      try {
        return JSON.stringify(content);
      } catch {
        return '';
      }
    }

    return '';
  }

  private normalizeChatCompletionText(
    choice:
      | {
          finish_reason?: string;
          text?: string;
          message?: {
            content?: unknown;
            refusal?: string;
            tool_calls?: Array<{
              id?: string;
              type?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }
      | undefined,
  ): string {
    if (!choice) return '';

    const content = this.extractText(choice.message?.content);
    if (content) return content;

    if (typeof choice.message?.refusal === 'string' && choice.message.refusal.trim()) {
      return choice.message.refusal.trim();
    }

    if (typeof choice.text === 'string' && choice.text.trim()) {
      return choice.text.trim();
    }

    if (Array.isArray(choice.message?.tool_calls) && choice.message.tool_calls.length > 0) {
      const firstToolName = choice.message.tool_calls[0]?.function?.name;
      return firstToolName
        ? `Model requested tool call: ${firstToolName}.`
        : 'Model requested a tool call but returned no direct text.';
    }

    // Graceful handling for token truncation/content filtering outcomes with no text payload.
    if (choice.finish_reason === 'length') {
      return 'Model output was truncated due to token limits.';
    }
    if (choice.finish_reason === 'content_filter') {
      return 'Model response was blocked by content filtering.';
    }

    return this.extractFallbackText(choice.message?.content);
  }
}
