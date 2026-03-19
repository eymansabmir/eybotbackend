import type { IPlugin } from '../plugin.interface';
import { AppError } from '../../shared/errors';
import type { IHttpRequestPlugin } from './http-request.interface';
import type { HttpRequestMethod, HttpRequestResponse } from './http-request.types';

const DEFAULT_TIMEOUT_MS = 15000;
const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class HttpRequestProviderError extends AppError {
  constructor(
    message: string,
    public readonly providerStatus?: number,
  ) {
    super(message, providerStatus && providerStatus >= 400 ? providerStatus : 502);
  }
}

export class HttpRequestPlugin implements IPlugin, IHttpRequestPlugin {
  readonly name = 'http-request';

  async initialize(): Promise<void> {
    logger.info('HttpRequestPlugin: ready');
  }

  async shutdown(): Promise<void> {
    // Stateless HTTP client.
  }

  async execute(input: {
    url: string;
    method: HttpRequestMethod;
    headers?: Record<string, string>;
    queryParams?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    retries?: number;
    proxyUrl?: string;
  }): Promise<HttpRequestResponse> {
    const url = buildUrl(input.url, input.queryParams);
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retries = Math.max(0, input.retries ?? defaultRetries(input.method));

    if (input.proxyUrl) {
      logger.warn({ proxyUrl: input.proxyUrl }, 'Per-request proxy is configured but currently not applied by fetch transport');
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await this.fetchOnce({
          url,
          method: input.method,
          headers: input.headers,
          body: input.body,
          timeoutMs,
        });

        if (response.statusCode >= 400) {
          if (attempt < retries && shouldRetryStatus(response.statusCode, input.method)) {
            await sleep(backoffMs(attempt));
            continue;
          }
          throw new HttpRequestProviderError(
            `HTTP request failed with status ${response.statusCode}`,
            response.statusCode,
          );
        }

        return response;
      } catch (error) {
        lastError = error;
        if (attempt < retries && shouldRetryError(error, input.method)) {
          await sleep(backoffMs(attempt));
          continue;
        }
        break;
      }
    }

    if (lastError instanceof AppError) {
      throw lastError;
    }

    if (lastError instanceof Error) {
      throw new HttpRequestProviderError(lastError.message);
    }

    throw new HttpRequestProviderError('HTTP request failed');
  }

  private async fetchOnce(input: {
    url: string;
    method: HttpRequestMethod;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs: number;
  }): Promise<HttpRequestResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const response = await fetch(input.url, {
        method: input.method,
        headers: input.headers,
        body: canHaveBody(input.method) ? input.body : undefined,
        signal: controller.signal,
      });

      const bodyText = await response.text();
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      const bodyJson = contentType.includes('application/json')
        ? tryParseJson(bodyText)
        : undefined;

      return {
        statusCode: response.status,
        headers: headersToRecord(response.headers),
        bodyText,
        ...(bodyJson !== undefined ? { bodyJson } : {}),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HttpRequestProviderError(`HTTP request timed out after ${input.timeoutMs}ms`, 504);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function headersToRecord(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

function buildUrl(baseUrl: string, queryParams?: Record<string, string>): string {
  const url = new URL(baseUrl);
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function canHaveBody(method: HttpRequestMethod): boolean {
  return method !== 'GET';
}

function defaultRetries(method: HttpRequestMethod): number {
  return method === 'GET' ? 2 : 0;
}

function shouldRetryStatus(statusCode: number, method: HttpRequestMethod): boolean {
  return method === 'GET' && RETRIABLE_STATUS.has(statusCode);
}

function shouldRetryError(error: unknown, method: HttpRequestMethod): boolean {
  if (method !== 'GET') return false;
  if (error instanceof HttpRequestProviderError) {
    return error.providerStatus !== undefined && RETRIABLE_STATUS.has(error.providerStatus);
  }
  return true;
}

function tryParseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(2000, 250 * (attempt + 1));
}
