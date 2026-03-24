export type HttpRequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpRequestResponseMapping {
  jsonPath: string;
  variableName: string;
  scope: 'session' | 'contact';
}

export interface HttpRequestCredentialMaterial {
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  bearerToken?: string;
  baseUrl?: string;
}

export interface HttpRequestProxyCredentialMaterial {
  proxyUrl?: string;
}

export interface HttpRequestResponse {
  statusCode: number;
  headers: Record<string, string>;
  bodyText: string;
  bodyJson?: unknown;
}

export interface HttpRequestMappedMutation {
  scope: 'session' | 'contact';
  key: string;
  value: unknown;
}

export interface ExecuteHttpRequestNodePayload {
  orgId: string;
  url: string;
  method: HttpRequestMethod;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  credentialId?: string;
  proxyCredentialsId?: string;
  responseMapping?: HttpRequestResponseMapping[];
}

export interface ExecuteHttpRequestNodeResult {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  mappedMutations: HttpRequestMappedMutation[];
}

export interface IHttpClientProvider {
  execute(input: {
    url: string;
    method: HttpRequestMethod;
    headers?: Record<string, string>;
    queryParams?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    retries?: number;
    proxyUrl?: string;
  }): Promise<HttpRequestResponse>;
}

export interface IHttpRequestIntegrationService {
  executeNode(input: ExecuteHttpRequestNodePayload): Promise<ExecuteHttpRequestNodeResult>;
}
