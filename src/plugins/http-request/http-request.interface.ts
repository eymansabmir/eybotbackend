import type { IHttpClientProvider } from './http-request.types';

export const HTTP_REQUEST_PLUGIN = 'http-request' as const;

export type IHttpRequestPlugin = IHttpClientProvider;
