import { AppError } from '../../utils/errors';
import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IElevenLabsPlugin } from './elevenlabs.interface';
import type {
  ElevenLabsCredentialMaterial,
  ElevenLabsModelInfo,
  ElevenLabsTestResult,
  ElevenLabsVoiceInfo,
} from './elevenlabs.types';

const DEFAULT_TIMEOUT_MS = 20_000;

type ProviderErrorCode = 'auth_error' | 'quota_error' | 'timeout' | 'network_error' | 'provider_error';

function toStatusCode(code: ProviderErrorCode, providerStatus?: number): number {
  if (code === 'auth_error') return 401;
  if (code === 'quota_error') return 429;
  if (code === 'timeout') return 504;
  if (providerStatus && providerStatus >= 400 && providerStatus < 600) return providerStatus;
  return 502;
}

type ElevenLabsModelPayload = {
  model_id: string;
  name?: string;
  can_do_text_to_speech?: boolean;
};

type ElevenLabsModelsResponse =
  | ElevenLabsModelPayload[]
  | {
      models?: ElevenLabsModelPayload[];
    };

interface ElevenLabsVoicesResponse {
  voices?: Array<{
    voice_id: string;
    name: string;
    category?: string;
    labels?: {
      description?: string;
    };
  }>;
}

export class ElevenLabsProviderError extends AppError {
  constructor(
    public readonly code: ProviderErrorCode,
    public readonly providerStatus?: number,
    message?: string,
  ) {
    super(message ?? 'ElevenLabs request failed', toStatusCode(code, providerStatus));
  }
}

export class ElevenLabsPlugin implements IPlugin, IElevenLabsPlugin {
  readonly name = 'elevenlabs';

  async initialize(_registry: IPluginRegistry): Promise<void> {
    logger.info('ElevenLabsPlugin: ready');
  }

  async shutdown(): Promise<void> {
    // Stateless HTTP client; nothing to close.
  }

  async testConnection(input: {
    credential: ElevenLabsCredentialMaterial;
    timeoutMs?: number;
  }): Promise<ElevenLabsTestResult> {
    const startedAt = Date.now();
    try {
      // Use an auth-protected endpoint. /voices can be misleading because some
      // public voices may still be listed without full credential authorization.
      await this.jsonRequest<Record<string, unknown>>({
        credential: input.credential,
        path: '/user/subscription',
        timeoutMs: input.timeoutMs ?? 10_000,
      });
      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      if (error instanceof ElevenLabsProviderError) {
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
    credential: ElevenLabsCredentialMaterial;
    timeoutMs?: number;
  }): Promise<ElevenLabsModelInfo[]> {
    const payload = await this.jsonRequest<ElevenLabsModelsResponse>({
      credential: input.credential,
      path: '/models',
      timeoutMs: input.timeoutMs,
    });

    const models = Array.isArray(payload) ? payload : (payload.models ?? []);

    return models
      .filter(
        (m) =>
          typeof m.model_id === 'string' &&
          m.model_id.length > 0 &&
          (m.can_do_text_to_speech === undefined || m.can_do_text_to_speech === true),
      )
      .map((m) => ({
        id: m.model_id,
        name: typeof m.name === 'string' && m.name.length > 0 ? m.name : undefined,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async listVoices(input: {
    credential: ElevenLabsCredentialMaterial;
    timeoutMs?: number;
  }): Promise<ElevenLabsVoiceInfo[]> {
    const payload = await this.jsonRequest<ElevenLabsVoicesResponse>({
      credential: input.credential,
      path: '/voices',
      timeoutMs: input.timeoutMs,
    });

    return (payload.voices ?? [])
      .filter((v) => typeof v.voice_id === 'string' && v.voice_id.length > 0)
      .map((v) => ({
        id: v.voice_id,
        name: v.name,
        category: v.category,
        description: v.labels?.description,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createSpeech(input: {
    credential: ElevenLabsCredentialMaterial;
    voiceId: string;
    text: string;
    modelId?: string;
    outputFormat?: string;
    timeoutMs?: number;
  }): Promise<{ audioBuffer: Buffer; mimeType: string; voiceId: string; modelId?: string }> {
    const timeoutMs = input.timeoutMs ?? 45_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.buildUrl(input.credential, `/text-to-speech/${input.voiceId}`), {
        method: 'POST',
        headers: {
          ...this.buildHeaders(input.credential),
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: input.text,
          ...(input.modelId ? { model_id: input.modelId } : {}),
          ...(input.outputFormat ? { output_format: input.outputFormat } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const providerBody = await this.readProviderErrorBody(response);
        throw this.mapHttpError(response.status, providerBody);
      }

      const arrayBuffer = await response.arrayBuffer();
      return {
        audioBuffer: Buffer.from(arrayBuffer),
        mimeType: response.headers.get('content-type') || 'audio/mpeg',
        voiceId: input.voiceId,
        ...(input.modelId ? { modelId: input.modelId } : {}),
      };
    } catch (error) {
      if (error instanceof ElevenLabsProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ElevenLabsProviderError('timeout', 504, `ElevenLabs request timed out after ${timeoutMs}ms`);
      }
      throw new ElevenLabsProviderError('network_error', undefined, 'Could not reach ElevenLabs');
    } finally {
      clearTimeout(timer);
    }
  }

  private async jsonRequest<T>(input: {
    credential: ElevenLabsCredentialMaterial;
    path: string;
    timeoutMs?: number;
  }): Promise<T> {
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = this.buildUrl(input.credential, input.path);

    logger.info(
      {
        action: 'elevenlabs.jsonRequest',
        method: 'GET',
        path: input.path,
        url,
      },
      'STEP 4: Provider request',
    );

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(input.credential),
        signal: controller.signal,
      });

      if (!response.ok) {
        const providerBody = await this.readProviderErrorBody(response);
        throw this.mapHttpError(response.status, providerBody);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ElevenLabsProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ElevenLabsProviderError('timeout', 504, `ElevenLabs request timed out after ${timeoutMs}ms`);
      }
      throw new ElevenLabsProviderError('network_error', undefined, 'Could not reach ElevenLabs');
    } finally {
      clearTimeout(timer);
    }
  }

  private buildHeaders(credential: ElevenLabsCredentialMaterial): Record<string, string> {
    return {
      'xi-api-key': credential.apiKey,
    };
  }

  private buildUrl(credential: ElevenLabsCredentialMaterial, path: string): string {
    const base = this.normalizeBaseUrl(credential.baseUrl ?? 'https://api.elevenlabs.io/v1').replace(/\/{1,10}$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }

  private normalizeBaseUrl(baseUrl: string): string {
    const trimmed = baseUrl.trim();

    try {
      const url = new URL(trimmed);
      const host = url.hostname.toLowerCase();
      const path = url.pathname.replace(/\/{1,10}$/, '');

      // ElevenLabs API endpoints are versioned under /v1.
      if (host === 'api.elevenlabs.io' && (!path || path === '/')) {
        url.pathname = '/v1';
      }

      return url.toString();
    } catch {
      return trimmed;
    }
  }

  private async readProviderErrorBody(response: Response): Promise<string | undefined> {
    try {
      const text = (await response.text()).trim();
      if (!text) return undefined;
      // Keep errors compact in logs/API responses.
      return text.slice(0, 600);
    } catch {
      return undefined;
    }
  }

  private mapHttpError(status: number, providerBody?: string): ElevenLabsProviderError {
    const withDetails = (base: string): string =>
      providerBody ? `${base}. Provider response: ${providerBody}` : base;

    if (status === 401 || status === 403) {
      return new ElevenLabsProviderError('auth_error', status, withDetails('ElevenLabs authentication/authorization failed'));
    }
    if (status === 429) {
      return new ElevenLabsProviderError('quota_error', status, withDetails('ElevenLabs rate limit or quota exceeded'));
    }
    if (status === 408 || status === 504) {
      return new ElevenLabsProviderError('timeout', status, withDetails('ElevenLabs request timed out'));
    }
    return new ElevenLabsProviderError('provider_error', status, withDetails(`ElevenLabs request failed with status ${status}`));
  }
}
