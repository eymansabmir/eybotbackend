import { AppError } from '../../utils/errors';
import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IAnthropicPlugin } from './anthropic.interface';
import {
  AnthropicChatCompletionInput,
  AnthropicChatCompletionOutput,
  AnthropicCredentialMaterial,
  AnthropicModelInfo,
  AnthropicTestResult,
} from './anthropic.types';
import { ANTHROPIC_API_VERSION, anthropicModels } from './anthropic.constants';

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

type ProviderErrorCode = 'auth_error' | 'quota_error' | 'timeout' | 'network_error' | 'provider_error';

interface RequestOptions {
  credential: AnthropicCredentialMaterial;
  path: string;
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
  timeoutMs?: number;
  attempt?: number;
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

export class AnthropicProviderError extends AppError {
  constructor(
    public readonly code: ProviderErrorCode,
    public readonly providerStatus?: number,
    message?: string,
  ) {
    const defaultMsg = providerStatus ? `Anthropic request failed with status ${providerStatus}` : 'Anthropic request failed';
    super(message || defaultMsg, toStatusCode(code, providerStatus));
  }
}

export class AnthropicPlugin implements IPlugin, IAnthropicPlugin {
  readonly name = 'anthropic';

  async initialize(_registry: IPluginRegistry): Promise<void> {
    logger.info('AnthropicPlugin: ready');
  }

  async shutdown(): Promise<void> {}

  async testConnection(input: {
    credential: AnthropicCredentialMaterial;
    timeoutMs?: number;
  }): Promise<AnthropicTestResult> {
    const startedAt = Date.now();
    try {
      // Make a minimal request to validate the API key
      await this.jsonRequest<any>({
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
      if (error instanceof AnthropicProviderError) {
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

  async listModels(): Promise<AnthropicModelInfo[]> {
    return anthropicModels.map(id => ({ id, name: id }));
  }

  async createChatCompletion(input: AnthropicChatCompletionInput): Promise<AnthropicChatCompletionOutput> {
    const body: Record<string, unknown> = {
      model: input.model,
      messages: input.messages,
    };

    if (input.systemPrompt) body.system = input.systemPrompt;
    if (input.temperature !== undefined) body.temperature = input.temperature;
    if (input.maxTokens !== undefined) body.max_tokens = input.maxTokens;
    else body.max_tokens = 1024; // Anthropic requires max_tokens

    const payload = await this.jsonRequest<any>({
      credential: input.credential,
      path: '/messages',
      method: 'POST',
      body,
      timeoutMs: input.timeoutMs ?? 45_000,
    });

    const contentBlock = payload.content?.find((c: any) => c.type === 'text');
    const content = contentBlock?.text || '';

    if (!content) {
      throw new AnthropicProviderError('provider_error', 502, 'Anthropic returned an empty completion');
    }

    return {
      id: payload.id,
      model: payload.model,
      content,
      finishReason: payload.stop_reason,
      promptTokens: payload.usage?.input_tokens,
      completionTokens: payload.usage?.output_tokens,
      totalTokens: (payload.usage?.input_tokens || 0) + (payload.usage?.output_tokens || 0),
      raw: payload,
    };
  }

  private async jsonRequest<T>(options: RequestOptions): Promise<T> {
    const attempt = options.attempt ?? 0;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const url = `https://api.anthropic.com/v1${options.path}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': options.credential.apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
      });

      const responseText = await response.text();
      let parsed: any = {};
      try {
        parsed = responseText ? JSON.parse(responseText) : {};
      } catch (e) {}

      if (!response.ok) {
        let errorMessage = parsed?.error?.message;
        const mappedError = this.mapHttpError(response.status, errorMessage);

        if (this.shouldRetry(response.status) && attempt < MAX_RETRIES) {
          await sleep((attempt + 1) * 250);
          return this.jsonRequest<T>({ ...options, attempt: attempt + 1 });
        }
        throw mappedError;
      }

      return parsed as T;
    } catch (error) {
      if (error instanceof AnthropicProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AnthropicProviderError('timeout', 504, `Anthropic request timed out after ${timeoutMs}ms`);
      }
      if (attempt < MAX_RETRIES) {
        await sleep((attempt + 1) * 250);
        return this.jsonRequest<T>({ ...options, attempt: attempt + 1 });
      }
      throw new AnthropicProviderError('network_error', undefined, 'Could not reach Anthropic');
    } finally {
      clearTimeout(timer);
    }
  }

  private shouldRetry(status: number): boolean {
    return RETRYABLE_STATUS_CODES.has(status);
  }

  private mapHttpError(status: number, message?: string): AnthropicProviderError {
    if (status === 401 || status === 403) {
      return new AnthropicProviderError('auth_error', status, message || 'Anthropic authentication failed');
    }
    if (status === 429) {
      return new AnthropicProviderError('quota_error', status, message || 'Anthropic rate limit or quota exceeded');
    }
    if (status === 408 || status === 504) {
      return new AnthropicProviderError('timeout', status, message || 'Anthropic request timed out');
    }
    return new AnthropicProviderError('provider_error', status, message || 'Anthropic request failed');
  }
}
