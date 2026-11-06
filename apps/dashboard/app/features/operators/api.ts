import { readLocale as readUILocale } from '@/shell/ui-locale';
import type { AdminSession } from '@/shell/dashboard-context';
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
  created_at: string;
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
export type MemberInvitationStatus = 'pending' | 'expired' | 'canceled' | 'accepted';
export type MemberInvitation = {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  project_id: string | null;
  project_name: string | null;
  project_slug: string | null;
  role: OperatorRole;
  recipient_email: string;
  recipient_name: string | null;
  status: MemberInvitationStatus;
  delivery: 'not_configured';
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  invited_by: string | null;
};
export type CreatedMemberInvitation = {
  invitation: MemberInvitation;
  token: string;
  accept_path: string;
  delivery: { state: 'not_configured'; email_sent: false };
};
export type MemberInvitationPreview = MemberInvitation & {
  caller_email: string | null;
  email_matches: boolean;
  already_accepted_by_caller: boolean;
};
export type NewMemberInvitation = {
  email: string;
  name?: string | null;
  role: OperatorRole;
  projectId: string | null;
  expiresInSeconds: number;
};

/** Absolute one-time link for an invitation secret. The secret is shown only once. */
export function memberInvitationLink(token: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  return new URL(`${base}invite/${encodeURIComponent(token)}`, window.location.origin).toString();
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(readUILocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

export function createMemberInvitation(token: string, organization: string, input: NewMemberInvitation, signal?: AbortSignal): Promise<CreatedMemberInvitation> {
  return request<CreatedMemberInvitation>(token, `/api/v1/organizations/${organization}/invitations`, 'POST', {
    email: input.email.trim().toLowerCase(),
    ...(input.name?.trim() ? { name: input.name.trim() } : {}),
    role: input.role,
    project_id: input.projectId,
    expires_in_seconds: input.expiresInSeconds,
  }, signal);
}

export function listMemberInvitations(token: string, organization: string, signal?: AbortSignal): Promise<{ data: MemberInvitation[] }> {
  return request<{ data: MemberInvitation[] }>(token, `/api/v1/organizations/${organization}/invitations`, 'GET', undefined, signal);
}

export function cancelMemberInvitation(token: string, invitationId: string): Promise<void> {
  return request<void>(token, `/api/v1/invitations/${invitationId}`, 'DELETE');
}

export function previewMemberInvitation(token: string, invitationToken: string, signal?: AbortSignal): Promise<{ data: MemberInvitationPreview }> {
  return request<{ data: MemberInvitationPreview }>(token, '/api/v1/invitations/preview', 'POST', { token: invitationToken }, signal);
}

export type AcceptedMemberInvitation = {
  data: AdminSession;
  invitation: MemberInvitation;
  replayed: boolean;
};

export function acceptMemberInvitation(token: string, invitationToken: string): Promise<AcceptedMemberInvitation> {
  return request<AcceptedMemberInvitation>(token, '/api/v1/session/invitations', 'POST', { token: invitationToken });
}

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
  if (!organization) {
    primeQuery(token || 'public', '/api/v1/operators?limit=1000', { data, next_cursor: null });
  }
  return { data };
}

import { ApiRequestError as AdminRequestError, cachedGet, peekCachedGet, request } from '@/lib/api-client';
import { primeQuery } from '@/lib/query-cache';
export { AdminRequestError, cachedGet, peekCachedGet, request };

export function formatExpiry(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleString(readUILocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
