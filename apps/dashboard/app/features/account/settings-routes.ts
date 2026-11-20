export const SETTINGS_SECTIONS = [
  'organization',
  'account',
  'appearance',
  'billing',
  'members',
  'about',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

type SettingsSession = { kind: 'installation' | 'operator' } | null | undefined;

export function defaultSettingsSection(session: SettingsSession): SettingsSection {
  return session?.kind === 'operator' ? 'account' : 'appearance';
}

/**
 * Resolve a settings section to its one canonical path segment. Legacy
 * `payments` and unknown/unauthorized account bookmarks fall back to the
 * section that remains usable for the current session.
 */
export function canonicalSettingsSection(
  value: string | null | undefined,
  session: SettingsSession,
): SettingsSection {
  if (value === 'payments') return 'billing';
  if (value && (SETTINGS_SECTIONS as readonly string[]).includes(value)) {
    const section = value as SettingsSection;
    if (section === 'account' && session?.kind !== 'operator') return 'appearance';
    return section;
  }
  return defaultSettingsSection(session);
}

export function settingsHref(section: string): string {
  return `/settings/${section === 'payments' ? 'billing' : section}`;
}

export type LegacySettingsTarget = {
  /** Canonical Settings URL, keeping unrelated query parameters and the hash. */
  to: string;
  /** The originating product URL without the transient `settings` parameter. */
  returnTo: string;
};

/**
 * Translate the legacy `?settings=<section>` entry point into a canonical
 * route. Unknown values resolve to the session's usable default so stale
 * bookmarks do not leave a dead settings query on the current page.
 */
export function legacySettingsTarget(
  pathname: string,
  search: string,
  hash: string,
  session: SettingsSession,
): LegacySettingsTarget | null {
  const query = new URLSearchParams(search);
  const requested = query.get('settings');
  if (!requested) return null;
  const section = canonicalSettingsSection(requested, session);
  query.delete('settings');
  const suffix = query.toString();
  return {
    to: `/settings/${section}${suffix ? `?${suffix}` : ''}${hash}`,
    returnTo: `${pathname}${suffix ? `?${suffix}` : ''}${hash}`,
  };
}
