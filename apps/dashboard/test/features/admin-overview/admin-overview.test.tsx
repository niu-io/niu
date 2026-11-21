import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import AdminOverviewPage from '../../../app/features/admin-overview/page';
import type { DashboardContext } from '../../../app/shell/dashboard-context';

const fixture = vi.hoisted(() => ({
  context: {} as DashboardContext,
  currency: {
    currency: 'USD',
    billingMode: 'currency' as 'currency' | 'credits',
    ready: true,
    failed: false,
    reload: vi.fn(),
  },
}));

vi.mock('../../../app/shell/dashboard-context', () => ({
  useDashboardContext: () => fixture.context,
}));

vi.mock('../../../app/shell/platform-currency', () => ({
  usePlatformCurrency: () => fixture.currency,
}));

describe('AdminOverviewPage', () => {
  it('renders ordered Resale setup steps and actionable attention alerts', async () => {
    fixture.context = {
      token: 'admin-token',
      session: { kind: 'installation', operating_mode: 'resale', operator: null, permissions: { read: true, write: true, platform_admin: true } },
      workspace: { id: 'ws-1', slug: 'default', organization_id: 'org-1', name: 'Default' },
      workspaces: [{ id: 'ws-1', slug: 'default', organization_id: 'org-1', name: 'Default' }],
    } as unknown as DashboardContext;
    fixture.currency = {
      currency: '',
      billingMode: 'currency',
      ready: true,
      failed: false,
      reload: vi.fn(),
    };

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/v1/admin/providers') {
        return Response.json({
          data: [
            { id: 'prov-1', slug: 'openrouter', name: 'OpenRouter', api_keys: 1, enabled_api_keys: 1, models: 3, enabled_model_routes: 2, offers: 1, ready_offers: 0 },
          ],
        });
      }
      if (path.startsWith('/api/v1/admin/incidents')) {
        return Response.json({
          data: [
            {
              reference: 'incident-1',
              connection_name: 'Primary key',
              model: 'openai/gpt-4o',
              cause: 'authentication_rejected',
              status: 'active',
              first_observed_at: '2026-11-20T00:00:00Z',
              last_observed_at: '2026-11-20T01:00:00Z',
              recovered_at: null,
              observations: '2',
              provider: { name: 'OpenRouter', slug: 'openrouter' },
              notifications: {
                state: 'no_recipients',
                workspaces: 0,
                delivered: 0,
                failed: 0,
                cancelled: 0,
                queued: 0,
                sending: 0,
                not_configured: 0,
                authority_inactive: 0,
              },
            },
          ],
          next_before: null,
          coverage: { request_observed: true, proactive_probe: 'not_configured' },
        });
      }
      if (path.startsWith('/api/v1/admin/routing/index')) return Response.json({ data: [], has_more: false, next_after: null });
      if (path.startsWith('/api/v1/admin/pricing/standard-prices')) return Response.json({ data: [], next_after: null });
      if (path === '/api/v1/admin/units/tariffs') return Response.json({ data: { text_tariffs: [], media_tariffs: [] } });
      if (path === '/api/v1/admin/configuration') return Response.json({ data: { payment_gateways: [], verification: { currency_configured: false, gateways: [] } } });
      if (path === '/api/v1/admin/payments/bank') return Response.json({ data: { details: null } });
      if (path.startsWith('/api/v1/admin/registrations')) return Response.json({ data: [], counts: { pending: 2, approved: 1, rejected: 0 }, next_cursor: null });
      if (path.startsWith('/api/v1/admin/customers')) return Response.json({ data: [], next_after: null });
      return Response.json({ data: [] });
    }));

    render(<MemoryRouter><AdminOverviewPage /></MemoryRouter>);

    expect(await screen.findByText('1. Configure platform currency & billing mode')).toBeTruthy();
    expect(screen.getByText('3. Approve commercial purchase offers')).toBeTruthy();
    expect(screen.getByText('4. Publish customer selling prices')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Set currency' }).getAttribute('href')).toBe('/admin/settings');
    expect(screen.getByRole('link', { name: 'Review offers' }).getAttribute('href')).toBe('/admin/providers/openrouter/models');
    expect(await screen.findByText('2 registration requests awaiting approval.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Review requests' }).getAttribute('href')).toBe('/admin/registrations');
  });

  it('renders streamlined Internal use setup steps without commercial billing steps', async () => {
    fixture.context = {
      token: 'admin-token',
      session: { kind: 'installation', operating_mode: 'internal', operator: null, permissions: { read: true, write: true, platform_admin: true } },
      workspace: { id: 'ws-1', slug: 'engineering', organization_id: 'org-1', name: 'Engineering' },
      workspaces: [{ id: 'ws-1', slug: 'engineering', organization_id: 'org-1', name: 'Engineering' }],
    } as unknown as DashboardContext;

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/v1/admin/providers') return Response.json({ data: [] });
      if (path.startsWith('/api/v1/admin/incidents')) {
        return Response.json({ data: [], next_before: null, coverage: { request_observed: true, proactive_probe: 'not_configured' } });
      }
      if (path.startsWith('/api/v1/admin/routing/index')) return Response.json({ data: [], has_more: false, next_after: null });
      return Response.json({ data: [] });
    }));

    render(<MemoryRouter><AdminOverviewPage /></MemoryRouter>);

    expect(await screen.findByText('Internal use mode')).toBeTruthy();
    expect(screen.getByText('1. Connect Providers & import models')).toBeTruthy();
    expect(screen.getByText('2. Custom models & routing (optional)')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open workspace' }).getAttribute('href')).toBe('/workspaces/engineering');
    expect(screen.queryByText('1. Configure platform currency & billing mode')).toBeNull();
    expect(screen.queryByText('4. Publish customer selling prices')).toBeNull();
  });
});
