import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeyHistoryDialog from '@/features/keys/components/KeyHistoryDialog';
import type { ProjectKey } from '@/features/keys/api';

const key: ProjectKey = {
  id: 'key-1',
  name: 'Application key',
  allowed_models: ['*'],
  expires_at_ms: null,
  revoked: false,
  expired: false,
  spending_limits: [{ currency: 'USD', limit_nanos: '10500000000', committed_nanos: '0', remaining_nanos: '10500000000', revision: '5' }],
  unit_spending_limit: {
    unit: { definition_revision: '1', name: 'Credits', display_precision: 2, atoms_per_unit: '1000000000' },
    limit_atoms: '100000000000',
    revision: '3',
    definition_revision: '1',
    committed_atoms: '0',
    remaining_atoms: '100000000000',
  },
};
const row = (revision: string, values: Record<string, unknown>) => ({ revision, recorded_at: '2026-11-05T00:00:00Z', actor_kind: 'member', actor_name: 'Ada', ...values });

it('reads all policy histories from one dialog', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.includes('/request-rate-limit/history')) return Response.json({ data: [row('3', { requests_per_minute: 15 }), row('2', { requests_per_minute: null })] });
    if (path.includes('/ip-policy/history')) return Response.json({ data: [row('4', { allowed_cidrs: null }), row('3', { allowed_cidrs: [] }), row('2', { allowed_cidrs: ['203.0.113.0/24'] })] });
    if (path.includes('/spending-limit/USD/history')) return Response.json({ data: [row('5', { currency: 'USD', limit_nanos: '10500000000' })] });
    if (path.includes('/units/limit/history')) return Response.json({ data: [row('6', { limit_atoms: '100000000000', definition_revision: '1' })] });
    return Response.json({ error: { message: `Unexpected request: ${path}` } }, { status: 500 });
  });
  vi.stubGlobal('fetch', fetcher);
  render(<KeyHistoryDialog token="test" projectKey={key} keyPath="/key" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'History' }));
  await screen.findByText('15');
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Requests per minute history' })).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Policy history' }));
  await user.click(await screen.findByRole('menuitemradio', { name: 'Source IP access' }));
  await screen.findByText('Block all sources');
  expect(screen.getByText('Allow all sources')).toBeTruthy();
  expect(screen.getByText('203.0.113.0/24')).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'Policy history' }));
  await user.click(await screen.findByRole('menuitemradio', { name: 'USD spending limit' }));
  await screen.findByText('$10.5');

  await user.click(screen.getByRole('button', { name: 'Policy history' }));
  await user.click(await screen.findByRole('menuitemradio', { name: 'Credits spending limit' }));
  await screen.findByText('100.00 Credits');
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

it('shows a retry without fabricating history rows', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{ revision: 'not-a-revision' }] })));
  render(<KeyHistoryDialog token="test" projectKey={key} keyPath="/key" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'History' }));
  await screen.findByText('The history response could not be read.');
  expect(screen.getByRole('button', { name: 'Retry history' })).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
});
