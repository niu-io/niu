import { it, expect, vi } from 'vitest';

vi.mock('@/shell/platform-currency', () => ({ usePlatformCurrency: () => ({ currency: 'USD', unit: null }) }));
import { render, screen } from '@testing-library/react';
import KeySpendingLimits from '@/features/keys/components/KeySpendingLimits';
import type { ProjectKey } from '@/features/keys/api';

const key: ProjectKey = {
  id: 'key-1',
  name: 'Application key',
  allowed_models: ['*'],
  expires_at_ms: null,
  revoked: false,
  expired: false,
  spending_limits: [
    { currency: 'USD', limit_nanos: '10500000000', committed_nanos: '2250000000', remaining_nanos: '8250000000', revision: '5' },
    { currency: 'EUR', limit_nanos: null, committed_nanos: '0', remaining_nanos: null, revision: null },
  ],
  unit_spending_limit: {
    unit: { definition_revision: '1', name: 'Credits', display_precision: 2, atoms_per_unit: '1000000000' },
    limit_atoms: '100000000000',
    revision: '3',
    definition_revision: '1',
    committed_atoms: '20000000000',
    remaining_atoms: '80000000000',
  },
};

it('shows lifetime, committed and remaining allowances without edit or history controls', () => {
  render(<KeySpendingLimits projectKey={key} />);
  expect(screen.getByText('USD')).toBeTruthy();
  expect(screen.getByText('$10.5')).toBeTruthy();
  expect(screen.getByText('$2.25')).toBeTruthy();
  expect(screen.getByText('$8.25')).toBeTruthy();
  expect(screen.getByText('Credits')).toBeTruthy();
  expect(screen.getByText('100.00 Credits')).toBeTruthy();
  expect(screen.getByText('20.00 Credits')).toBeTruthy();
  expect(screen.getByText('80.00 Credits')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByText('EUR')).toBeNull();
});

it('shows the platform currency as unlimited before an explicit key limit exists', () => {
  render(<KeySpendingLimits projectKey={{ ...key, spending_limits: [], unit_spending_limit: null }} />);
  expect(screen.getByText('USD')).toBeTruthy();
  expect(screen.getByText('$0.00')).toBeTruthy();
  expect(screen.getAllByText('Unlimited').length).toBe(2);
});
