import { NiuAPIError, type RequestOptions } from './index.js';
import { notifyResponse } from './response-metadata.js';

export type RegistrationMode = 'disabled' | 'approval_required';
export type AuthConfiguration = {
  password_login: boolean;
  browser_token_login?: boolean;
  demo_login?: boolean;
  setup_required?: boolean;
  registration_mode?: RegistrationMode;
};
export type RegistrationSubmissionInput = {
  name: string;
  email: string;
  password: string;
  organization_name?: string;
  workspace_name?: string;
  note?: string;
};
export type RegistrationSubmissionResult = { status: 'pending_approval' };
export type MemberSession = {
  /** Routing references only; do not display internal identifiers. */
  id: string;
  operator_id: string;
  expires_at_unix: number;
  revoked: boolean;
};
export type MemberSignIn = { token: string; session: MemberSession };
export type NiuAuthOptions = { baseURL?: string; fetch?: typeof globalThis.fetch };

/** Explicit member authentication. Does not retain passwords/tokens, set cookies,
 * retry writes or grant installation access. Secure credential storage is caller-owned.
 */
export class NiuAuthClient {
  readonly #base: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: NiuAuthOptions = {}) {
    this.#base = (options.baseURL ?? 'http://localhost:2555/api/v1').replace(/\/+$/, '');
    const url = new URL(this.#base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new TypeError('baseURL must be an HTTP(S) API base without credentials, query or fragment');
    }
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Public capability discovery, independent of sign-in success. */
  getMemberAuthenticationConfiguration(options: RequestOptions = {}): Promise<AuthConfiguration> {
    return this.#request('/auth/config', { method: 'GET', headers: { accept: 'application/json' } }, options) as Promise<AuthConfiguration>;
  }

  /** Submit a Limited Preview account registration pending administrator approval. */
  submitRegistration(input: RegistrationSubmissionInput, options: RequestOptions = {}): Promise<RegistrationSubmissionResult> {
    const encoder = new TextEncoder();
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    if (!name || [...name].length > 120 || /[\x00-\x1f\x7f]/.test(name)) {
      throw new TypeError('Registration name must be 1 to 120 characters without control characters');
    }
    if (!email || encoder.encode(email).length > 254 || !email.includes('@')) {
      throw new TypeError('Registration requires a bounded email address');
    }
    if (typeof input.password !== 'string' || [...input.password].length < 15 || encoder.encode(input.password).length > 1024) {
      throw new TypeError('Registration password requires at least 15 characters and at most 1024 bytes');
    }
    const payload: Record<string, string> = { name, email, password: input.password };
    if (input.organization_name !== undefined && input.organization_name.trim()) {
      const org = input.organization_name.trim();
      if ([...org].length > 120 || /[\x00-\x1f\x7f]/.test(org)) {
        throw new TypeError('Organization name must be at most 120 characters without control characters');
      }
      payload.organization_name = org;
    }
    if (input.workspace_name !== undefined && input.workspace_name.trim()) {
      const ws = input.workspace_name.trim();
      if ([...ws].length > 120 || /[\x00-\x1f\x7f]/.test(ws)) {
        throw new TypeError('Workspace name must be at most 120 characters without control characters');
      }
      payload.workspace_name = ws;
    }
    if (input.note !== undefined && input.note.trim()) {
      const note = input.note.trim();
      if ([...note].length > 500 || /[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/.test(note)) {
        throw new TypeError('Registration note must be at most 500 characters');
      }
      payload.note = note;
    }
    const body = JSON.stringify(payload);
    if (encoder.encode(body).length > 8192) throw new TypeError('Registration request exceeds 8192 bytes');
    return this.#request('/auth/registrations', {
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body,
    }, options) as Promise<RegistrationSubmissionResult>;
  }

  signIn(input: { email: string; password: string }, options: RequestOptions = {}): Promise<MemberSignIn> {
    if (typeof input.email !== 'string' || new TextEncoder().encode(input.email).length > 254
      || typeof input.password !== 'string' || new TextEncoder().encode(input.password).length > 1024) {
      throw new TypeError('Sign-in requires bounded email and password strings');
    }
    // Preserve the password exactly; send only fields accepted by the server.
    const body = JSON.stringify({ email: input.email, password: input.password });
    if (new TextEncoder().encode(body).length > 4096) throw new TypeError('Sign-in request exceeds 4096 bytes');
    return this.#request('/auth/login', {
      headers: { accept: 'application/json', 'content-type': 'application/json' }, body,
    }, options) as Promise<MemberSignIn>;
  }

  signOut(token: string, options: RequestOptions = {}): Promise<void> {
    if (typeof token !== 'string' || !token.length || token.length > 256 || /\s/.test(token)) {
      throw new TypeError('A bounded member bearer session is required');
    }
    return this.#request('/auth/logout', {
      headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    }, options, true).then(() => undefined);
  }

  /** Prove the current password and revoke every own session on success. */
  changePassword(token: string, input: { current_password: string; password: string }, options: RequestOptions = {}): Promise<{revision: number; sign_in_required: true}> {
    if (typeof token !== 'string' || !token.length || token.length > 256 || /\s/.test(token)) {
      throw new TypeError('A bounded member bearer session is required');
    }
    if (typeof input.current_password !== 'string' || new TextEncoder().encode(input.current_password).length > 1024
      || typeof input.password !== 'string' || [...input.password].length < 15 || new TextEncoder().encode(input.password).length > 1024) {
      throw new TypeError('Current password must be bounded; new password requires at least 15 characters and at most 1024 bytes');
    }
    const body = JSON.stringify({current_password: input.current_password, password: input.password});
    if (new TextEncoder().encode(body).length > 4096) throw new TypeError('Password change request exceeds 4096 bytes');
    return this.#request('/auth/password', {method: 'PUT',
      headers: {accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${token}`}, body,
    }, options) as Promise<{revision: number; sign_in_required: true}>;
  }

  async #request(path: string, init: RequestInit, options: RequestOptions, empty = false): Promise<unknown> {
    const response = await this.#fetch(`${this.#base}${path}`, {
      ...init, method: init.method ?? 'POST', signal: options.signal, redirect: 'error',
      credentials: 'omit', cache: 'no-store',
    });
    await notifyResponse(response, options);
    if (empty && response.status === 204) return;
    const text = await response.text();
    let payload: unknown;
    try { payload = text ? JSON.parse(text) : undefined; } catch { payload = text; }
    if (!response.ok) throw NiuAPIError.fromResponse(response, payload);
    if (empty) throw new Error('Expected a 204 sign-out response');
    return payload;
  }
}
