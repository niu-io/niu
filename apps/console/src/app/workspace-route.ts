import type { Workspace } from './console-context';

function workspaceNameSlug(name: string) {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56)
    .replace(/-+$/g, '');
  return slug || 'workspace';
}

function workspaceSuffix(id: string) {
  const compactId = id.replace(/[^a-z\d]/gi, '');
  return compactId.slice(0, 8) || 'project';
}

export function workspacePathSegment(workspace: Workspace, workspaces: Workspace[]) {
  const slug = workspaceNameSlug(workspace.name);
  const collisions = workspaces.filter(item => item.id !== workspace.id && workspaceNameSlug(item.name) === slug);
  if (!collisions.length) return slug;

  const suffix = workspaceSuffix(workspace.id);
  const suffixCollisions = workspaces.some(item => item.id !== workspace.id
    && workspaceNameSlug(item.name) === slug
    && workspaceSuffix(item.id) === suffix);
  return suffixCollisions
    ? `${slug}-${workspace.id.replace(/[^a-z\d]/gi, '')}`
    : `${slug}-${suffix}`;
}

export function resolveWorkspacePathSegment(segment: string, workspaces: Workspace[]) {
  const slugMatches = workspaces.filter(item => workspacePathSegment(item, workspaces) === segment);
  if (slugMatches.length === 1) return slugMatches[0];
  const idMatches = workspaces.filter(item => item.id === segment);
  return idMatches.length === 1 ? idMatches[0] : undefined;
}
