/** Shared section identity for public navigation and the article sidebar. */
export function documentationSection(path: string): 'Docs' | 'API' | 'SDK' | 'Compare' {
  if (/\/compare(?:\/|$)/.test(path)) return 'Compare';
  if (/\/api\/sdk(?:\/|$)/.test(path)) return 'SDK';
  if (/\/api(?:\/|$)/.test(path)) return 'API';
  return 'Docs';
}

/** Human orientation stays short; operational references primarily serve agents. */
export function documentationAudience(path: string): 'human' | 'agent' {
  const normalized = path.replace(/^\/help(?=\/|$)/, '/docs').replace(/\/+$/, '');
  return normalized === '/docs' || normalized === '/docs/guides/personal-assistant' ? 'human' : 'agent';
}

/** One public Docs entry owns its API and SDK references as well. */
export function publicNavigationActive(path: string, label: string): boolean {
  if (path.startsWith('/docs/')) {
    const agentSource = documentationAudience(path) === 'agent';
    if (label === 'For Human') return documentationSection(path) === 'Docs' && !agentSource;
    if (label === 'For Agents') return agentSource && documentationSection(path) === 'Docs';
    if (label === 'API' || label === 'SDK') return documentationSection(path) === label;
    return label === (documentationSection(path) === 'Compare' ? 'Compare' : 'Docs');
  }
  return false;
}

/** Audience-first documentation navigation, separate from the marketing navigation. */
export const documentationNavigation = [
  { label: 'For Human', href: '/docs/' },
  { label: 'For Agents', href: '/docs/agents/' },
  { label: 'API', href: '/docs/api/rest/' },
  { label: 'SDK', href: '/docs/api/sdk/' },
];
