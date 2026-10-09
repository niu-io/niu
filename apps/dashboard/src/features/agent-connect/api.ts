export type ProjectScope = { organizationId: string; projectId: string };
export type ExecutionCollectorKey = {
  id: string;
  name: string;
  purpose: 'quota' | 'execution';
  created_at_ms: number;
  expires_at_ms: number;
  revoked: boolean;
  expired: boolean;
};
export type IssuedSecret = { id: string; token: string };
export type IssuedProjectKey = IssuedSecret & { allowed_models: string[] };

function scopePath(scope: ProjectScope) {
  if (!uuid.test(scope.organizationId) || !uuid.test(scope.projectId)) throw new Error('Choose a valid workspace.');
  return `/admin/v1/organizations/${scope.organizationId}/projects/${scope.projectId}`;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function request<T>(token: string, path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method,
    signal,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(detail?.error?.message ?? `Request failed (${response.status}).`);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export function issueAiderProjectKey(token: string, scope: ProjectScope, model: string): Promise<IssuedProjectKey> {
  return request(token, `${scopePath(scope)}/keys`, 'POST', {
    name: 'Agent Connect - Aider',
    allowed_models: [model],
    ttl_seconds: 90 * 24 * 60 * 60,
  });
}

export async function listExecutionCollectorKeys(token: string, scope: ProjectScope, signal?: AbortSignal): Promise<ExecutionCollectorKey[]> {
  const value = await request<{ data: ExecutionCollectorKey[] }>(
    token,
    `${scopePath(scope)}/collector-keys?purpose=execution`,
    'GET',
    undefined,
    signal,
  );
  return value.data;
}

export function issueExecutionCollectorKey(token: string, scope: ProjectScope): Promise<IssuedSecret> {
  return request(token, `${scopePath(scope)}/collector-keys`, 'POST', {
    purpose: 'execution',
    name: 'Agent Connect - Claude Code',
    ttl_seconds: 90 * 24 * 60 * 60,
  });
}

export function revokeExecutionCollectorKey(token: string, scope: ProjectScope, id: string): Promise<void> {
  if (!uuid.test(id)) throw new Error('Collector key ID is invalid.');
  return request(token, `${scopePath(scope)}/collector-keys/${id}`, 'DELETE');
}
