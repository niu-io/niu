import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import ConnectionIncidents from '@/features/incidents/page';
import IncidentNotice from '@/features/incidents/IncidentNotice';
import WorkspaceIncidentNotice from '@/features/incidents/WorkspaceIncidentNotice';

vi.mock('@/shell/dashboard-context', () => ({ useDashboardContext: () => ({
  token: 'fixture', session: { kind: 'operator', operator: { id: 'fixture-owner' } },
}) }));
const incident = {
  reference: 'incident-1', model: 'Example model', connection_name: 'Production connection',
  provider: { name: 'Example Provider', slug: 'example-provider' }, cause: 'account_restricted',
  status: 'active', first_observed_at: '2026-11-04T00:00:00Z', last_observed_at: '2026-11-04T00:01:00Z',
  observations: '2', recovered_at: null,
  notifications: { state: 'incomplete', workspaces: 2, delivered: 1, failed: 0, cancelled: 0, queued: 0, sending: 0, not_configured: 1, authority_inactive: 0 },
};
const notifications = { state: 'not_configured', incidents: 1, subscribers: 0, authorized: 0, delivered: 0, failed: 0, cancelled: 0, queued: 0, sending: 0, not_configured: 1, authority_inactive: 0 };
afterEach(() => vi.useRealTimers());

it('keeps the page actions stable while changing incident views and links to the saved Provider', async () => {
  vi.stubGlobal('fetch', vi.fn(async input => Response.json({
    data: String(input).includes('status=resolved') ? [] : [incident], next_before: null, coverage: { request_observed: true, proactive_probe: 'not_configured' },
  })));
  render(<MemoryRouter><ConnectionIncidents /></MemoryRouter>);
  await screen.findByText('Production connection');
  expect(screen.getByText('Incomplete · 1 not notified')).toBeTruthy();
  expect(screen.getByText('Detection uses requests actually sent to Providers. No proactive upstream probe is configured, so an idle connection can be unhealthy without an incident here.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Manage connection' }).getAttribute('href')).toBe('/admin/providers/example-provider/keys');
  const refresh = screen.getByRole('button', { name: 'Refresh' });
  await userEvent.setup().click(screen.getByRole('tab', { name: 'History' }));
  await screen.findByText('No recovered incidents recorded');
  expect(screen.queryByText('Production connection')).toBeNull();
  expect(screen.getByRole('button', { name: 'Refresh' })).toBe(refresh);
});

it('reports an absent receiver instead of claiming a notification was sent', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{ model: 'Example model', owner_funded: false }], more: false, notifications })));
  render(<MemoryRouter><WorkspaceIncidentNotice token="fixture" workspaceId="workspace" workspaceSlug="example" /></MemoryRouter>);
  await screen.findByText('Some model requests need attention');
  expect(screen.getByText('No external notification receiver is configured for this workspace. Niu records the incident here; no message was sent.')).toBeTruthy();
});

it('reports unknown state for malformed evidence instead of claiming no incidents', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{ ...incident, cause: 'unclassified' }], next_before: null, coverage: { request_observed: true, proactive_probe: 'not_configured' } })));
  render(<MemoryRouter><ConnectionIncidents /></MemoryRouter>);
  await screen.findByText('Could not load connection incidents. The current state is unknown.');
  expect(screen.queryByText('No active incidents recorded')).toBeNull();
});

it('retains the last active warning when a subsequent monitoring refresh fails', async () => {
  vi.useFakeTimers();
  let calls = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (calls++) throw new Error('Network unavailable');
    return Response.json({ data: [incident], next_before: null, coverage: { request_observed: true, proactive_probe: 'not_configured' } });
  }));
  await act(async () => { render(<MemoryRouter><IncidentNotice token="fixture" /></MemoryRouter>); });
  expect(screen.getByText('Upstream connections need attention')).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(screen.getByText('Upstream connections need attention')).toBeTruthy();
  expect(screen.getByText('Could not refresh incident evidence. Review the last known state before assuming recovery.')).toBeTruthy();
});

it('suppresses unconfirmed monitoring errors on non-connection admin pages while showing them on connection surfaces', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Network unavailable'); }));
  const { unmount } = render(<MemoryRouter initialEntries={['/admin/branding']}><IncidentNotice token="unconfirmed-token" /></MemoryRouter>);
  await screen.findByRole('status', { hidden: true }).catch(() => null);
  await act(async () => {});
  expect(screen.queryByText('Connection monitoring unavailable')).toBeNull();
  unmount();
  render(<MemoryRouter initialEntries={['/admin/providers']}><IncidentNotice token="unconfirmed-token" /></MemoryRouter>);
  expect(await screen.findByText('Connection monitoring unavailable')).toBeTruthy();
});
