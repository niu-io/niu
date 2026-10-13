/** Shared section identity for public navigation and the article sidebar. */
export function documentationSection(path: string): 'Docs' | 'API' | 'SDK' | 'Compare' {
  if (/\/compare(?:\/|$)/.test(path)) return 'Compare';
  if (/\/api\/sdk(?:\/|$)/.test(path)) return 'SDK';
  if (/\/api(?:\/|$)/.test(path)) return 'API';
  return 'Docs';
}
