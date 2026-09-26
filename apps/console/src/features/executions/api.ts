export type Named = { id: string; name: string };
export type Summary = {
  id: string; source: string; record_id: string; task_id: string;
  coverage: 'complete' | 'partial' | 'unknown'; imported_at: string;
};
export type Page = { data: Summary[]; next_cursor: string | null };
export type ScopeFocus = { organizationId: string; projectId: string; executionId?: string };

export async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('authorization', 'Bearer ' + token);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    if (response.status === 409) throw new Error('This source and record ID already exist with different content.');
    if (response.status === 400) throw new Error('The record was rejected. Check the version 1 schema, identifiers, references and intervals.');
    throw new Error('Request failed (' + response.status + ').');
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function projectPath(organization: string, project: string) {
  return '/admin/v1/organizations/' + organization + '/projects/' + project + '/executions';
}

export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unknown' : new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
}

export function kindLabel(kind: string): string {
  return kind.replaceAll('_', ' ');
}
