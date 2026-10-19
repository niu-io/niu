import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import RoutePoolsPage from '../../../src/features/route-pools/page';
import { request, VendorRequestError } from '../../../src/features/providers/api';

vi.mock('../../../src/app/dashboard-context', () => ({
  useDashboardContext: () => ({
    token: 'admin-token',
    organizations: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Acme Production' }],
  }),
}));

vi.mock('../../../src/features/providers/api', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../src/features/providers/api')>()),
  request: vi.fn(),
}));

describe('RoutePoolsPage', () => {
  it('lists pools without exposing organization UUIDs, filters via secondary popover, and edits candidates', async () => {
    const user = userEvent.setup();
    const writes: Array<Record<string, unknown>> = [];
    vi.mocked(request).mockImplementation(async (_token, path, method = 'GET', body) => {
      if (path.startsWith('/api/v1/model-route-pools/index')) {
        return {
          data: [
            {
              alias: 'claude-sonnet-4',
              organization_id: null,
              enabled: true,
              revision: 4,
              candidates: [
                { alias: 'anthropic-direct-sonnet-4', priority: 100, weight: 800, enabled: true },
                { alias: 'openrouter-sonnet-4', priority: 50, weight: 1000, enabled: true },
              ],
            },
            {
              alias: 'acme-private-sonnet',
              organization_id: '11111111-1111-4111-8111-111111111111',
              enabled: true,
              revision: 2,
              candidates: [{ alias: 'acme-byok-sonnet', priority: 100, weight: 1000, enabled: true }],
            },
          ],
          has_more: false,
          next_after: null,
        };
      }
      if (path === '/api/v1/vendors') return { data: [] };
      if (path === '/api/v1/model-route-pools' && method === 'PUT') {
        writes.push(body as Record<string, unknown>);
        return { data: { revision: 5 } };
      }
      if (path.startsWith('/api/v1/model-route-pools/history')) {
        return {
          data: [
            {
              alias: 'claude-sonnet-4',
              organization_id: null,
              enabled: true,
              revision: 4,
              recorded_at: '2026-10-19T05:00:00Z',
              candidates: [{ alias: 'anthropic-direct-sonnet-4', priority: 100, weight: 800, enabled: true }],
            },
          ],
        };
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    });

    const { container } = render(
      <MemoryRouter>
        <RoutePoolsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('claude-sonnet-4')).toBeTruthy();
    expect(screen.getByText('acme-private-sonnet')).toBeTruthy();
    expect(screen.getAllByText('Acme Production').length).toBeGreaterThan(0);
    // Must never expose raw organization UUIDs in product UI
    expect(container.textContent).not.toContain('11111111-1111-4111-8111-111111111111');

    // Secondary search popover filter
    await user.click(screen.getByRole('button', { name: 'Filter route pools' }));
    const searchInput = await screen.findByRole('searchbox', { name: 'Filter route pools' });
    await user.type(searchInput, 'claude-sonnet-4');
    expect(screen.queryByText('acme-private-sonnet')).toBeNull();
    expect(within(screen.getByRole('table', { name: 'Model route pools' })).getByText('claude-sonnet-4')).toBeTruthy();

    // Edit pool
    await user.click(screen.getByRole('button', { name: 'Edit pool' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Edit claude-sonnet-4' })).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]).toEqual({
      alias: 'claude-sonnet-4',
      organization_id: null,
      enabled: true,
      expected_revision: 4,
      candidates: [
        { alias: 'anthropic-direct-sonnet-4', priority: 100, weight: 800, enabled: true },
        { alias: 'openrouter-sonnet-4', priority: 50, weight: 1000, enabled: true },
      ],
    });
  });

  it('reconciles uncertain pool writes without reposting', async () => {
    const user = userEvent.setup();
    vi.mocked(request).mockImplementation(async (_token, path, method = 'GET') => {
      if (path.startsWith('/api/v1/model-route-pools/index')) {
        return { data: [], has_more: false, next_after: null };
      }
      if (path === '/api/v1/vendors') return { data: [] };
      if (path === '/api/v1/model-route-pools' && method === 'PUT') {
        throw new VendorRequestError('Service unavailable', 503);
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    });

    render(
      <MemoryRouter>
        <RoutePoolsPage />
      </MemoryRouter>,
    );

    await screen.findByText('No model route pools configured yet.');
    await user.click(screen.getAllByRole('button', { name: 'Create route pool' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Pool alias'), 'gpt-5');
    await user.type(within(dialog).getByLabelText('Candidate route alias #1'), 'openai-gpt-5');
    await user.click(within(dialog).getByRole('button', { name: 'Create route pool' }));

    expect(await screen.findByText(/write could not be confirmed/i)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
