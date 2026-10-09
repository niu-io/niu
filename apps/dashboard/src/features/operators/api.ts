export type NamedResource = { id: string; name: string };
export type OperatorRole = 'owner' | 'admin' | 'viewer';
export type Operator = NamedResource & {
  role: OperatorRole;
  organization_id: string | null;
  project_id: string | null;
  revoked: boolean;
};
export type OperatorSession = {
  id: string;
  operator_id: string;
  expires_at_unix: number;
  revoked: boolean;
};
export type OperatorAuditEvent = {
  id: string;
  action: 'operator_created' | 'session_created' | 'session_revoked' | 'operator_revoked' | string;
  actor_kind: 'installation' | 'operator';
  actor_operator_id: string | null;
  target_operator_id: string;
  target_session_id: string | null;
  organization_id: string;
  project_id: string | null;
  created_at: string;
};
export type IssuedSession = { session: OperatorSession; token: string };

export class AdminRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AdminRequestError';
  }
}

export async function request<T>(
  token: string,
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    signal,
    headers: {
      authorization: 'Bearer ' + token,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new AdminRequestError(payload?.error?.message ?? 'Request failed (' + response.status + ')', response.status);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function formatExpiry(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
