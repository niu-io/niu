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
  before_role?: OperatorRole | null;
  after_role?: OperatorRole | null;
  created_at: string;
};
export type IssuedSession = { session: OperatorSession; token: string };

/** Complete scoped inventory: never interpret a failed later page as no user. */
export async function listOperators(token: string, organization?: string, signal?: AbortSignal): Promise<{ data: Operator[] }> {
  const data: Operator[] = [];
  const identities = new Set<string>();
  const cursors = new Set<string>();
  let after: string | undefined;
  do {
    const query = new URLSearchParams({ limit: '1000' });
    if (organization) query.set('organization_id', organization);
    if (after) query.set('after', after);
    const page = await request<{data: Operator[]; next_cursor?: string | null}>(token, '/api/v1/operators?' + query, 'GET', undefined, signal);
    signal?.throwIfAborted();
    if (!Array.isArray(page.data) || (page.next_cursor != null && typeof page.next_cursor !== 'string')) throw new Error('The user directory could not be read. Refresh users.');
    for (const row of page.data) {
      if (!row?.id || (organization && row.organization_id !== organization)) throw new Error('The user directory returned an unexpected company. Refresh users.');
      if (!identities.has(row.id)) { identities.add(row.id); data.push(row); }
    }
    after = page.next_cursor ?? undefined;
    if (after) {
      if (cursors.has(after) || !page.data.length) throw new Error('The user directory did not advance. Refresh users.');
      cursors.add(after);
    }
  } while (after);
  return { data };
}

import { ApiRequestError as AdminRequestError, request } from '@/lib/api-client';
export { AdminRequestError, request };

export function formatExpiry(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
