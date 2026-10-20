import { pinyin } from 'pinyin-pro';
import type { Workspace } from './dashboard-context';

export function workspaceDisplayName(name: string) {
  return name === 'Default project' ? 'Default workspace' : name;
}

export function workspaceNameSlug(name: string) {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56)
    .replace(/-+$/g, '');
  return slug || 'workspace';
}

export function workspaceSlugFromName(name: string) {
  if (!name.trim()) return '';
  const romanized = pinyin(name, { toneType: 'none', nonZh: 'consecutive', v: true });
  const slug = romanized.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/g, '') || 'workspace';
  return slug === 'default' ? 'default-workspace' : slug;
}

function workspaceSuffix(id: string) {
  const compactId = id.replace(/[^a-z\d]/gi, '');
  return compactId.slice(0, 8) || 'workspace';
}

function legacyWorkspacePathSegment(workspace: Workspace, workspaces: Workspace[]) {
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

/** Use the backend's immutable routing reference; names remain display labels. */
export function workspacePathSegment(workspace: Workspace, workspaces: Workspace[]) {
  return workspace.slug || workspace.route_slug || legacyWorkspacePathSegment(workspace, workspaces);
}

/** Explicit scope selects dashboard browsing; the unscoped root is the public catalog. */
export function workspaceModelsHref(workspace: Workspace | null | undefined, workspaces: Workspace[]) {
  return `/models?workspace=${encodeURIComponent(workspace ? workspacePathSegment(workspace, workspaces) : 'default')}`;
}

export function resolveWorkspacePathSegment(segment: string, workspaces: Workspace[]) {
  const slugMatches = workspaces.filter(item => workspacePathSegment(item, workspaces) === segment || item.slug_aliases?.includes(segment));
  if (slugMatches.length === 1) return slugMatches[0];
  // Retain existing name-based bookmarks, but only when they identify one workspace.
  const legacyMatches = workspaces.filter(item => legacyWorkspacePathSegment(item, workspaces) === segment);
  if (legacyMatches.length === 1) return legacyMatches[0];
  const idMatches = workspaces.filter(item => item.id === segment);
  return idMatches.length === 1 ? idMatches[0] : undefined;
}
