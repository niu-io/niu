import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import KeyLimits from '@/features/keys/components/KeyLimits';
import type { ProjectKey } from '@/features/keys/api';

const key: ProjectKey = {
  id: 'key-1',
  name: 'Application key',
  allowed_models: ['*'],
  expires_at_ms: null,
  revoked: false,
  expired: false,
  concurrency_limit: { max_concurrent_requests: 5, active_requests: 2, revision: '8' },
  token_rate_limit: { tokens_per_minute: 1000, revision: '3', snapshot_at: '2026-11-05T00:00:00Z', known_tokens: '10', reserved_tokens: '5', unbounded_requests: 1, committed_tokens: null },
};

it('shows recent usage and capacity without per-field edit or history controls', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { window_seconds: 60, window_end: '2026-11-05T00:00:00Z', requests: 3, known_usage_requests: 2, unknown_usage_requests: 1, known_prompt_tokens: '10', known_completion_tokens: '4' } })));
  render(<KeyLimits token="test" projectKey={key} keyPath="/key" />);
  await screen.findByText('2 unresolved requests at last refresh.');
  expect(screen.getByText('Committed usage unknown at last refresh. 1 request has no usage estimate.')).toBeTruthy();
  expect(screen.getByText('Recent token usage')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Inspect unresolved requests' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Inspect token reservations' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /history/ })).toBeNull();
});

it('does not render capacity links when no work is unresolved', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { window_seconds: 60, window_end: '2026-11-05T00:00:00Z', requests: 0, known_usage_requests: 0, unknown_usage_requests: 0, known_prompt_tokens: '0', known_completion_tokens: '0' } })));
  render(<KeyLimits token="test" projectKey={{ ...key, concurrency_limit: { max_concurrent_requests: null, active_requests: 0, revision: null }, token_rate_limit: { tokens_per_minute: null, revision: null, snapshot_at: '2026-11-05T00:00:00Z', known_tokens: '0', reserved_tokens: '0', unbounded_requests: 0, committed_tokens: '0' } }} keyPath="/key" />);
  await screen.findByText('No requests dispatched in this window.');
  expect(screen.queryByRole('button', { name: 'Inspect unresolved requests' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Inspect token reservations' })).toBeNull();
});
