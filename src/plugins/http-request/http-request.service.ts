import { CredentialType } from '@prisma/client';
import { AppError, ValidationError } from '../../shared/errors';
import type { ICredentialService } from '../../features/credentials';
import type {
  ExecuteHttpRequestNodePayload,
  ExecuteHttpRequestNodeResult,
  HttpRequestCredentialMaterial,
  HttpRequestMappedMutation,
  HttpRequestProxyCredentialMaterial,
  HttpRequestResponseMapping,
  IHttpClientProvider,
  IHttpRequestIntegrationService,
} from './http-request.types';
import { HttpRequestSecurityGuard } from './http-request.security';

const DEFAULT_TIMEOUT_MS = 15000;

export class HttpRequestIntegrationService implements IHttpRequestIntegrationService {
  constructor(
    private readonly credentials: ICredentialService,
    private readonly provider: IHttpClientProvider,
    private readonly security: HttpRequestSecurityGuard = new HttpRequestSecurityGuard(),
  ) {}

  async executeNode(input: ExecuteHttpRequestNodePayload): Promise<ExecuteHttpRequestNodeResult> {
    if (!input.url.trim()) {
      throw new ValidationError('url is required');
    }

    const inlineHeaders = input.headers ?? {};
    const inlineQuery = input.queryParams ?? {};

    const credentialMaterial = input.credentialId
      ? await this.getHttpCredentialMaterial(input.orgId, input.credentialId)
      : undefined;

    const proxyMaterial = input.proxyCredentialsId
      ? await this.getProxyCredentialMaterial(input.orgId, input.proxyCredentialsId)
      : undefined;

    const headers = mergeStringMaps(credentialMaterial?.headers, inlineHeaders);
    const queryParams = mergeStringMaps(credentialMaterial?.queryParams, inlineQuery);

    if (credentialMaterial?.bearerToken && !hasHeader(headers, 'authorization')) {
      headers.Authorization = toAuthorizationHeaderValue(credentialMaterial.bearerToken);
    }

    const resolvedUrl = resolveRequestUrl(input.url, credentialMaterial?.baseUrl);

    await this.security.validateOutboundRequest(resolvedUrl, headers);

    const response = await this.provider.execute({
      url: resolvedUrl,
      method: input.method,
      headers,
      queryParams,
      body: input.body,
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      proxyUrl: proxyMaterial?.proxyUrl,
    });

    const responseBody = response.bodyJson ?? response.bodyText;
    const mappedMutations = this.mapResponse(responseBody, input.responseMapping);

    return {
      statusCode: response.statusCode,
      headers: response.headers,
      body: responseBody,
      mappedMutations,
    };
  }

  private async getHttpCredentialMaterial(orgId: string, credentialId: string): Promise<HttpRequestCredentialMaterial> {
    const secret = await this.credentials.decryptSecret(orgId, credentialId, CredentialType.HTTP_REQUEST);

    return {
      headers: ensureStringRecord(secret['headers']),
      queryParams: ensureStringRecord(secret['queryParams']),
      ...(typeof secret['bearerToken'] === 'string' ? { bearerToken: secret['bearerToken'] } : {}),
      ...(typeof secret['baseUrl'] === 'string' ? { baseUrl: secret['baseUrl'] } : {}),
    };
  }

  private async getProxyCredentialMaterial(orgId: string, credentialId: string): Promise<HttpRequestProxyCredentialMaterial> {
    const secret = await this.credentials.decryptSecret(orgId, credentialId, CredentialType.HTTP_REQUEST);
    if (typeof secret['proxyUrl'] !== 'string' || !secret['proxyUrl'].trim()) {
      throw new ValidationError('proxy credential payload is invalid');
    }

    return {
      proxyUrl: secret['proxyUrl'].trim(),
    };
  }

  private mapResponse(body: unknown, mapping?: HttpRequestResponseMapping[]): HttpRequestMappedMutation[] {
    if (!mapping || mapping.length === 0) return [];

    const source = normalizeResponseBody(body);
    return mapping.map((entry) => ({
      scope: entry.scope,
      key: entry.variableName,
      value: extractJsonPath(source, entry.jsonPath),
    }));
  }
}

function mergeStringMaps(
  base?: Record<string, string>,
  override?: Record<string, string>,
): Record<string, string> {
  return {
    ...(base ?? {}),
    ...(override ?? {}),
  };
}

function hasHeader(headers: Record<string, string>, key: string): boolean {
  const target = key.toLowerCase();
  return Object.keys(headers).some((header) => header.toLowerCase() === target);
}

function toAuthorizationHeaderValue(rawToken: string): string {
  const token = rawToken.trim();
  if (!token) return '';

  // Preserve explicit auth schemes if user stored full Authorization value.
  if (/^[A-Za-z][A-Za-z0-9_-]*\s+.+$/.test(token)) {
    return token;
  }

  return `Bearer ${token}`;
}

function ensureStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') {
      output[key] = raw;
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function resolveRequestUrl(inputUrl: string, baseUrl?: string): string {
  if (/^https?:\/\//i.test(inputUrl)) {
    return inputUrl;
  }

  if (!baseUrl) {
    throw new ValidationError('Relative URL requires a baseUrl from credential secret');
  }

  try {
    return new URL(inputUrl, baseUrl).toString();
  } catch {
    throw new AppError('Could not resolve request URL against baseUrl', 400);
  }
}

function normalizeResponseBody(body: unknown): unknown {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

function extractJsonPath(input: unknown, jsonPath: string): unknown {
  if (!jsonPath.startsWith('$')) {
    return undefined;
  }

  const path = jsonPath.slice(1);
  if (!path) {
    return input;
  }

  const tokens = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);

  let current: unknown = input;
  for (const token of tokens) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current) && /^\d+$/.test(token)) {
      current = current[Number(token)];
      continue;
    }

    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[token];
      continue;
    }

    return undefined;
  }

  return current;
}
