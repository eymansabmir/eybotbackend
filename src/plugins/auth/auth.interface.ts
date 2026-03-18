export const AUTH_PLUGIN = 'auth' as const;

export interface IAuthPlugin {
  readonly auth: unknown;
}
