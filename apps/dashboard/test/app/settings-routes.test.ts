import { describe, expect, it } from 'vitest';
import {
  canonicalSettingsSection,
  legacySettingsTarget,
  settingsHref,
} from '../../app/features/account/settings-routes';

const operator = { kind: 'operator' } as const;
const installation = { kind: 'installation' } as const;

describe('canonical settings routes', () => {
  it('keeps the public sections on their own paths', () => {
    for (const section of ['organization', 'account', 'appearance', 'billing', 'members', 'about'] as const) {
      expect(canonicalSettingsSection(section, operator)).toBe(section);
    }
    expect(settingsHref('organization')).toBe('/settings/organization');
    expect(settingsHref('billing')).toBe('/settings/billing');
  });

  it('maps legacy Payments to Billing', () => {
    expect(canonicalSettingsSection('payments', operator)).toBe('billing');
    expect(settingsHref('payments')).toBe('/settings/billing');
  });

  it('chooses the usable default for the current session', () => {
    expect(canonicalSettingsSection(undefined, operator)).toBe('account');
    expect(canonicalSettingsSection(undefined, installation)).toBe('appearance');
    expect(canonicalSettingsSection('account', installation)).toBe('appearance');
    expect(canonicalSettingsSection('unknown', operator)).toBe('account');
  });

  it('resolves a legacy ?settings query without dropping other scope', () => {
    expect(
      legacySettingsTarget(
        '/workspaces/default/keys',
        '?filter=active&settings=payments',
        '#operations',
        operator,
      ),
    ).toEqual({
      to: '/settings/billing?filter=active#operations',
      returnTo: '/workspaces/default/keys?filter=active#operations',
    });
  });

  it('resolves the legacy organization query to the canonical organization section', () => {
    expect(
      legacySettingsTarget('/workspaces/default', '?settings=organization&period=month', '#general', operator),
    ).toEqual({
      to: '/settings/organization?period=month#general',
      returnTo: '/workspaces/default?period=month#general',
    });
  });

  it('uses the session default for a legacy account query on installation sessions', () => {
    expect(
      legacySettingsTarget('/workspaces/default', '?settings=account', '', installation),
    ).toEqual({
      to: '/settings/appearance',
      returnTo: '/workspaces/default',
    });
  });

  it('redirects dead or unrelated legacy settings values without hijacking other queries', () => {
    expect(legacySettingsTarget('/workspaces/default', '?settings=unknown', '', operator)).toEqual({
      to: '/settings/account',
      returnTo: '/workspaces/default',
    });
    expect(legacySettingsTarget('/workspaces/default', '?filter=active', '', operator)).toBeNull();
    expect(legacySettingsTarget('/workspaces/default', '?settings=', '', operator)).toBeNull();
  });
});
