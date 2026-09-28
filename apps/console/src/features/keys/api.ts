export type ProjectKey = {
  id: string;
  name: string;
  allowed_models: string[];
  expires_at_ms: number;
  revoked: boolean;
  expired: boolean;
};

export type IssuedProjectKey = { id: string; token: string };

export function projectKeyPath(organization: string, project: string) {
  return `/admin/v1/organizations/${encodeURIComponent(organization)}/projects/${encodeURIComponent(project)}/keys`;
}

export async function keyRequest<T>(token: string, path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? `Request failed (${response.status}).`);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export function workspacePath(pathname: string) {
  return pathname.match(/^\/workspaces\/[^/]+/)?.[0] ?? '/workspaces/default';
}

export function keyStatus(key: ProjectKey) {
  return key.revoked ? 'Revoked' : key.expired ? 'Expired' : 'Active';
}
