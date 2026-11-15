import { fetchQuery, invalidateQueries } from './query-cache';

export type AuthConfig = {
  password_login?: boolean;
  browser_token_login?: boolean;
  demo_login?: boolean;
  [key: string]: unknown;
};

export const AUTH_CONFIG_ENDPOINT = '/api/v1/auth/config';

export async function loadAuthConfig(options?: {
  signal?: AbortSignal;
  force?: boolean;
  freshMs?: number;
}): Promise<AuthConfig> {
  try {
    return await fetchQuery<AuthConfig>(
      'public',
      AUTH_CONFIG_ENDPOINT,
      async signal => {
        const response = await fetch(AUTH_CONFIG_ENDPOINT, {
          signal,
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error('Sign-in configuration unavailable');
        }
        const value = await response.json();
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error('Invalid capability response');
        }
        return value as AuthConfig;
      },
      {
        signal: options?.signal,
        force: options?.force,
        freshMs: options?.freshMs ?? 0,
        awaitRevalidate: true,
        background: true,
      },
    );
  } catch (error) {
    invalidateQueries(key => key.startsWith(`public::${AUTH_CONFIG_ENDPOINT}`));
    throw error;
  }
}
