export type ProjectKey = {
  id: string;
  revision?: number;
  name: string;
  allowed_models: string[];
  expires_at_ms: number;
  last_used_at_ms?: number | null;
  revoked: boolean;
  expired: boolean;
};

export type IssuedProjectKey = { id: string; token: string };

export class KeyRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function projectKeyPath(organization: string, project: string) {
  return `/admin/v1/organizations/${encodeURIComponent(organization)}/projects/${encodeURIComponent(project)}/keys`;
}

export async function keyRequest<T>(token: string, path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method,
    signal,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new KeyRequestError(payload?.error?.message ?? `Request failed (${response.status}).`, response.status);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export function workspacePath(pathname: string) {
  return pathname.match(/^\/workspaces\/[^/]+/)?.[0] ?? '/workspaces/default';
}

export function keyStatus(key: ProjectKey) {
  return key.revoked ? 'Revoked' : key.expired ? 'Expired' : 'Active';
}

export function keyLastUsed(key: ProjectKey) {
  if (key.last_used_at_ms === undefined) return 'Unavailable';
  if (key.last_used_at_ms === null) return 'No recorded requests';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(key.last_used_at_ms));
}
