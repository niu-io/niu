/** Shared section identity for public navigation and the article sidebar. */
export function documentationSection(path: string): 'Docs' | 'API' | 'Compare' {
  if (/\/compare(?:\/|$)/.test(path)) return 'Compare';
  if (/\/reference\/(api|handler-operations|backend-business|backend-text-load|workspace-materials)(?:\/|$)/.test(path)) return 'API';
  return 'Docs';
}
