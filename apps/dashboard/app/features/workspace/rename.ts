import { request } from '@/lib/api-client';
import type { Workspace } from '@/shell/dashboard-context';

/** The backend counts UTF-8 bytes, while the input's maxLength counts UTF-16 code units. */
export const WORKSPACE_NAME_MAX_BYTES = 200;

export type WorkspaceRenameResponse = { id: string; name: string };

/** Distinguished from API errors so the route action can offer safe retry guidance. */
export class WorkspaceRenameUnconfirmedError extends Error {
  constructor() {
    super('Could not confirm the workspace name. Reload before retrying.');
    this.name = 'WorkspaceRenameUnconfirmedError';
  }
}

export function workspaceNameByteLength(name: string): number {
  return new TextEncoder().encode(name.trim()).length;
}

export function validateWorkspaceName(name: string): 'empty' | 'too-long' | null {
  const trimmed = name.trim();
  if (!trimmed) return 'empty';
  if (workspaceNameByteLength(trimmed) > WORKSPACE_NAME_MAX_BYTES) return 'too-long';
  return null;
}

/**
 * Idempotent workspace rename request used by the workspace settings route
 * action. Repeating the same PATCH leaves the workspace in the same state, so
 * callers may safely retry after an uncertain response.
 */
export async function requestWorkspaceRename(
  token: string,
  workspace: Pick<Workspace, 'id' | 'organization_id'>,
  name: string,
): Promise<WorkspaceRenameResponse> {
  const result = await request<WorkspaceRenameResponse>(
    token,
    `/api/v1/organizations/${workspace.organization_id}/projects/${workspace.id}`,
    'PATCH',
    { name: name.trim() },
  );
  if (!result || result.id !== workspace.id || typeof result.name !== 'string' || !result.name.trim()) {
    throw new WorkspaceRenameUnconfirmedError();
  }
  return result;
}
