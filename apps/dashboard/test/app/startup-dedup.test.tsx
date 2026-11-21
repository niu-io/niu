import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSessionCache } from '../../app/lib/query-cache';
import { BrandingProvider, defaultBranding } from '../../app/shell/branding';
import { PlatformCurrencyProvider } from '../../app/shell/platform-currency';
import { loadAuthConfig } from '../../app/lib/auth-config';
import IncidentNotice from '../../app/features/incidents/IncidentNotice';
import WorkspaceIncidentNotice from '../../app/features/incidents/WorkspaceIncidentNotice';

describe('startup request coalescing under React StrictMode', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearSessionCache();
  });

  it('coalesces /api/v1/public/branding into one network request on StrictMode mount', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        data: { revision: '1', settings: { ...defaultBranding, display_name: 'Niu Strict' } },
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    render(
      <StrictMode>
        <BrandingProvider>
          <div>ready</div>
        </BrandingProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/public/branding');
  });

  it('coalesces /api/v1/public/currency into one network request on StrictMode mount', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ data: { currency: 'USD', billing_mode: 'currency', unit: null } }),
    );
    vi.stubGlobal('fetch', fetcher);

    render(
      <StrictMode>
        <PlatformCurrencyProvider>
          <div>currency-ready</div>
        </PlatformCurrencyProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/public/currency');
  });

  it('coalesces concurrent /api/v1/auth/config callers into one network request even when one aborts', async () => {
    let resolveFetch!: (value: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>(resolve => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetcher);

    const aborted = new AbortController();
    const first = loadAuthConfig({ signal: aborted.signal });
    const second = loadAuthConfig();
    aborted.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });

    resolveFetch(Response.json({ password_login: true, browser_token_login: false }));
    await expect(second).resolves.toMatchObject({ password_login: true, browser_token_login: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('coalesces platform and workspace incident notices into one request each on StrictMode mount', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/workspaces/')) {
        return Response.json({
          data: [],
          more: false,
          notifications: {
            state: 'none',
            incidents: 0,
            subscribers: 0,
            authorized: 0,
            delivered: 0,
            failed: 0,
            cancelled: 0,
            queued: 0,
            sending: 0,
            not_configured: 0,
            authority_inactive: 0,
          },
        });
      }
      return Response.json({
        data: [],
        next_before: null,
        coverage: { request_observed: true, proactive_probe: 'not_configured' },
      });
    });
    vi.stubGlobal('fetch', fetcher);

    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/workspaces/default/executions']}>
          <IncidentNotice token="session-token" />
          <WorkspaceIncidentNotice token="session-token" workspaceId="ws-1" workspaceSlug="default" />
        </MemoryRouter>
      </StrictMode>,
    );

    await screen.findByText(/Checking connection incidents/i).catch(() => {});
    await waitFor(() => {
      const urls = fetcher.mock.calls.map(call => String(call[0]));
      expect(urls.filter(u => u.includes('/api/v1/admin/incidents'))).toHaveLength(1);
      expect(urls.filter(u => u.includes('/api/v1/workspaces/ws-1/incidents'))).toHaveLength(1);
    });
  });
});
