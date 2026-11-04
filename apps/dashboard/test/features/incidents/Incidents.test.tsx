import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import ConnectionIncidents from '@/features/incidents/page';
import IncidentNotice from '@/features/incidents/IncidentNotice';

vi.mock('@/shell/dashboard-context', () => ({ useDashboardContext: () => ({
  token: 'fixture', session: { kind: 'operator', operator: { id: 'fixture-owner' } },
}) }));
const incident = {
  reference: 'incident-1', model: 'Example model', connection_name: 'Production connection',
  provider: { name: 'Example Provider', slug: 'example-provider' }, cause: 'account_restricted',
  status: 'active', first_observed_at: '2026-11-04T00:00:00Z', last_observed_at: '2026-11-04T00:01:00Z',
  observations: '2', recovered_at: null,
};
afterEach(() => vi.useRealTimers());

it('keeps the page actions stable while changing incident views and links to the saved Provider', async () => {
  vi.stubGlobal('fetch', vi.fn(async input => Response.json({
    data: String(input).includes('status=resolved') ? [] : [incident], next_before: null,
  })));
  render(<MemoryRouter><ConnectionIncidents /></MemoryRouter>);
  await screen.findByText('Production connection');
  expect(screen.getByRole('link', { name: 'Manage connection' }).getAttribute('href')).toBe('/admin/providers/example-provider/keys');
  const refresh = screen.getByRole('button', { name: 'Refresh' });
  await userEvent.setup().click(screen.getByRole('tab', { name: 'History' }));
  await screen.findByText('No recovered incidents recorded');
  expect(screen.queryByText('Production connection')).toBeNull();
  expect(screen.getByRole('button', { name: 'Refresh' })).toBe(refresh);
});

it('reports unknown state for malformed evidence instead of claiming no incidents', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{ ...incident, cause: 'unclassified' }], next_before: null })));
  render(<MemoryRouter><ConnectionIncidents /></MemoryRouter>);
  await screen.findByText('Could not load connection incidents. The current state is unknown.');
  expect(screen.queryByText('No active incidents recorded')).toBeNull();
});

it('retains the last active warning when a subsequent monitoring refresh fails', async () => {
  vi.useFakeTimers();
  let calls = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (calls++) throw new Error('Network unavailable');
    return Response.json({ data: [incident], next_before: null });
  }));
  await act(async () => { render(<MemoryRouter><IncidentNotice token="fixture" /></MemoryRouter>); });
  expect(screen.getByText('Upstream connections need attention')).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(screen.getByText('Upstream connections need attention')).toBeTruthy();
  expect(screen.getByText('Could not refresh incident evidence. Review the last known state before assuming recovery.')).toBeTruthy();
});
