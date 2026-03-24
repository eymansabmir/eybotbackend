import type { IPlugin } from '../plugin.interface';
import { AppError } from '../../shared/errors';
import type { IHttpRequestPlugin } from './http-request.interface';
import type { HttpRequestMethod, HttpRequestResponse } from './http-request.types';

const DEFAULT_TIMEOUT_MS = 15000;
const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_HTTP_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
} as const;

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
            formatHttpErrorMessage(response),
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
        headers: withDefaultHeaders(input.headers),
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

function formatHttpErrorMessage(response: HttpRequestResponse): string {
  const challengeHint = detectChallengeBlock(response);
  if (challengeHint) {
    return `HTTP request failed with status ${response.statusCode}: ${challengeHint}`;
  }

  const details = extractErrorDetails(response);
  return details
    ? `HTTP request failed with status ${response.statusCode}: ${details}`
    : `HTTP request failed with status ${response.statusCode}`;
}

function detectChallengeBlock(response: HttpRequestResponse): string | undefined {
  const contentType = (response.headers['content-type'] ?? '').toLowerCase();
  const server = (response.headers['server'] ?? '').toLowerCase();
  const body = response.bodyText.toLowerCase();

  const looksHtml = contentType.includes('text/html') || body.includes('<html');
  const cloudflareMarkers =
    server.includes('cloudflare') ||
    body.includes('just a moment') ||
    body.includes('cf-challenge') ||
    body.includes('cloudflare');

  if (response.statusCode === 403 && looksHtml && cloudflareMarkers) {
    return 'Request was blocked by Cloudflare bot protection (challenge page). Use an official API endpoint, server allowlisting, or a proxy/session that provides required clearance.';
  }

  return undefined;
}

function extractErrorDetails(response: HttpRequestResponse): string | undefined {
  const fromJson = pickMessageFromJson(response.bodyJson);
  if (fromJson) return truncate(fromJson, 220);

  const text = response.bodyText?.trim();
  if (!text) return undefined;
  return truncate(text.replace(/\s+/g, ' '), 220);
}

function pickMessageFromJson(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const source = payload as Record<string, unknown>;

  const candidates = [source['message'], source['error'], source['detail'], source['description']];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

function withDefaultHeaders(input?: Record<string, string>): Record<string, string> {
  const headers = { ...(input ?? {}) };

  if (!hasHeader(headers, 'user-agent')) {
    headers['User-Agent'] = DEFAULT_HTTP_HEADERS['User-Agent'];
  }

  if (!hasHeader(headers, 'accept')) {
    headers['Accept'] = DEFAULT_HTTP_HEADERS.Accept;
  }

  return headers;
}

function hasHeader(headers: Record<string, string>, key: string): boolean {
  const target = key.toLowerCase();
  return Object.keys(headers).some((name) => name.toLowerCase() === target);
}
