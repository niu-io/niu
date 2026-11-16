/** Shared section identity for public navigation and the article sidebar. */
export function documentationSection(path: string): 'Docs' | 'API' | 'SDK' | 'Compare' {
  if (/\/compare(?:\/|$)/.test(path)) return 'Compare';
  if (/\/api\/sdk(?:\/|$)/.test(path)) return 'SDK';
  if (/\/api(?:\/|$)/.test(path)) return 'API';
  return 'Docs';
}

/** Classify explicit machine entry points; task guides remain human documentation. */
export function documentationAudience(path: string): 'human' | 'agent' {
  const normalized = path.replace(/\/+$/, '');
  return /^\/docs\/(?:agents(?:\/|$)|llms\.txt$|(?:install|agents|inference|pools|routing|evaluations|events)\.md$)/.test(normalized) ? 'agent' : 'human';
}

/** Unify documentation under Docs while keeping API, SDK, and Compare navigation scoped. */
export function publicNavigationActive(path: string, label: string): boolean {
  if (path.startsWith('/docs/')) {
    const section = documentationSection(path);
    if (label === 'API' || label === 'SDK' || label === 'Compare') return section === label;
    if (label === 'Docs') return section === 'Docs';
  }
  return false;
}

/** Unified documentation navigation; agent contracts are the primary Docs backbone. */
export const documentationNavigation = [
  { label: 'Docs', href: '/docs/' },
  { label: 'API', href: '/docs/api/rest/' },
  { label: 'SDK', href: '/docs/api/sdk/' },
];
