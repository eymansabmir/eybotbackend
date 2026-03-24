import { AppError } from '../../utils/errors';
import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IDeepSeekPlugin } from './deepseek.interface';
import type {
  DeepSeekCredentialMaterial,
  DeepSeekModelInfo,
  DeepSeekTestResult,
  DeepSeekChatCompletionInput,
  DeepSeekChatCompletionOutput,
} from './deepseek.types';
import { DEEPSEEK_MODELS, DEEPSEEK_API_BASE_URL } from './deepseek.constants';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

type ProviderErrorCode = 'auth_error' | 'quota_error' | 'timeout' | 'network_error' | 'provider_error';

interface RequestOptions {
  credential: DeepSeekCredentialMaterial;
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

export class DeepSeekProviderError extends AppError {
  constructor(
    public readonly code: ProviderErrorCode,
    public readonly providerStatus?: number,
    message?: string,
  ) {
    const defaultMsg = providerStatus ? `DeepSeek request failed with status ${providerStatus}` : 'DeepSeek request failed';
    super(message || defaultMsg, toStatusCode(code, providerStatus));
  }
}

export class DeepSeekPlugin implements IPlugin, IDeepSeekPlugin {
  readonly name = 'deepseek';

  async initialize(_registry: IPluginRegistry): Promise<void> {
    logger.info('DeepSeekPlugin: ready');
  }

  async shutdown(): Promise<void> {
    // Stateless HTTP client; nothing to close.
  }

  async testConnection(input: {
    credential: DeepSeekCredentialMaterial;
    timeoutMs?: number;
  }): Promise<DeepSeekTestResult> {
    const startedAt = Date.now();
    try {
      await this.jsonRequest<{ data: any[] }>({
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
      if (error instanceof DeepSeekProviderError) {
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

  async listModels(): Promise<DeepSeekModelInfo[]> {
    return DEEPSEEK_MODELS.map((id) => ({ id, name: id === 'deepseek-chat' ? 'DeepSeek V3 (Chat)' : 'DeepSeek R1 (Reasoner)' }));
  }

  async createChatCompletion(input: DeepSeekChatCompletionInput): Promise<DeepSeekChatCompletionOutput> {
    const messages: any[] = [];
    if (input.systemPrompt) {
      messages.push({ role: 'system', content: input.systemPrompt });
    }
    messages.push(...input.messages);

    const body: Record<string, unknown> = {
      model: input.model,
      messages,
    };

    if (input.temperature !== undefined) body.temperature = input.temperature;
    if (input.maxTokens !== undefined) body.max_tokens = input.maxTokens;

    const payload = await this.jsonRequest<{
      id: string;
      model: string;
      choices: Array<{
        finish_reason?: string;
        message?: {
          content?: string;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    }>({
      credential: input.credential,
      path: '/chat/completions',
      method: 'POST',
      body,
      timeoutMs: input.timeoutMs ?? 60_000,
    });

    const firstChoice = payload.choices?.[0];
    const content = firstChoice?.message?.content;

    if (!content) {
      throw new DeepSeekProviderError('provider_error', 502, 'DeepSeek returned an empty completion');
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

  private async jsonRequest<T>(options: RequestOptions): Promise<T> {
    const attempt = options.attempt ?? 0;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const url = `${DEEPSEEK_API_BASE_URL}${options.path.startsWith('/') ? options.path : '/' + options.path}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.credential.apiKey}`,
      };

      const response = await fetch(url, {
        method: options.method,
        headers,
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
      });

      const responseText = await response.text();
      let parsed: any;
      try {
        parsed = responseText ? JSON.parse(responseText) : {};
      } catch {
        parsed = {};
      }

      if (!response.ok) {
        let errorMessage: string | undefined;
        if (parsed && typeof parsed === 'object' && parsed.error?.message) {
          errorMessage = parsed.error.message;
        }
        
        const mappedError = this.mapHttpError(response.status, errorMessage);

        if (this.shouldRetry(response.status) && attempt < MAX_RETRIES) {
          await sleep((attempt + 1) * 500);
          return this.jsonRequest<T>({ ...options, attempt: attempt + 1 });
        }

        throw mappedError;
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new DeepSeekProviderError('provider_error', response.status, 'Invalid JSON response from DeepSeek');
      }

      return parsed as T;
    } catch (error) {
      if (error instanceof DeepSeekProviderError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new DeepSeekProviderError('timeout', 504, `DeepSeek request timed out after ${timeoutMs}ms`);
      }

      if (attempt < MAX_RETRIES) {
        await sleep((attempt + 1) * 500);
        return this.jsonRequest<T>({ ...options, attempt: attempt + 1 });
      }

      throw new DeepSeekProviderError('network_error', undefined, 'Could not reach DeepSeek');
    } finally {
      clearTimeout(timer);
    }
  }

  private shouldRetry(status: number): boolean {
    return RETRYABLE_STATUS_CODES.has(status);
  }

  private mapHttpError(status: number, message?: string): DeepSeekProviderError {
    if (status === 401 || status === 403) {
      return new DeepSeekProviderError('auth_error', status, message || 'DeepSeek authentication failed');
    }
    if (status === 402) {
      return new DeepSeekProviderError('quota_error', status, message || 'DeepSeek balance is insufficient');
    }
    if (status === 429) {
      return new DeepSeekProviderError('quota_error', status, message || 'DeepSeek rate limit exceeded');
    }
    if (status === 408 || status === 504) {
      return new DeepSeekProviderError('timeout', status, message || 'DeepSeek request timed out');
    }
    return new DeepSeekProviderError('provider_error', status, message || `DeepSeek request failed with status ${status}`);
  }
}
