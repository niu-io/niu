import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceKeyConnection, { type DocsKeySelection } from '../../../../docs/src/components/live-api/WorkspaceKeyConnection';

describe('WorkspaceKeyConnection', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('auto-selects the preferred workspace and first active API key, supports inline disconnect, and reconnects on workspace switch', async () => {
    const onChange = vi.fn<(selection: DocsKeySelection | null) => void>();
    window.localStorage.setItem('niu.active-workspace', '00000000-0000-4000-8000-000000000102');

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/v1/session') {
        return new Response(JSON.stringify({
          data: {
            kind: 'operator',
            operator: { id: '00000000-0000-4000-8000-000000000001', organization_id: '00000000-0000-4000-8000-000000000010', project_id: null },
            permissions: { write: true },
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/api/v1/workspaces?')) {
        return new Response(JSON.stringify({
          data: [
            { id: '00000000-0000-4000-8000-000000000101', name: 'Production Gateway', organization_name: 'Niu Cloud', route_slug: 'production-gateway', created_at_ms: 1760000000000 },
            { id: '00000000-0000-4000-8000-000000000102', name: 'Staging Sandbox', organization_name: 'Niu Cloud', route_slug: 'staging-sandbox', created_at_ms: 1760005000000 },
          ],
          next_cursor: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/00000000-0000-4000-8000-000000000102/keys')) {
        return new Response(JSON.stringify({
          data: [
            { id: '00000000-0000-4000-8000-000000000200', name: 'Revoked Key', revoked: true, expired: false },
            { id: '00000000-0000-4000-8000-000000000201', name: 'Staging Active Key', revoked: false, expired: false },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/00000000-0000-4000-8000-000000000101/keys')) {
        return new Response(JSON.stringify({
          data: [
            { id: '00000000-0000-4000-8000-000000000301', name: 'Production Primary Key', revoked: false, expired: false },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }));

    render(<WorkspaceKeyConnection onChange={onChange} description="Same-origin inference APIs only" />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'API test workspace' }).textContent).toContain('Staging Sandbox'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'API test key' }).textContent).toContain('Staging Active Key'));
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      keyId: '00000000-0000-4000-8000-000000000201',
      keyName: 'Staging Active Key',
      canWrite: true,
    }));

    // Disconnect inline without unmounting workspaces
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Disconnect reference/i }));
    expect(screen.getByRole('button', { name: 'API test key' }).textContent).toContain('Choose API key');
    expect(screen.queryByText('Connected')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith(null);

    // Refresh while disconnected keeps the reference disconnected
    await user.click(screen.getByRole('button', { name: /Refresh access/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'API test workspace' }).textContent).toContain('Staging Sandbox'));
    expect(screen.getByRole('button', { name: 'API test key' }).textContent).toContain('Choose API key');
    expect(onChange).toHaveBeenLastCalledWith(null);

    // Switching workspace reconnects to the new workspace's first active key
    await user.click(screen.getByRole('button', { name: 'API test workspace' }));
    const prodOption = await screen.findByRole('menuitemradio', { name: /Production Gateway/i });
    expect(prodOption.textContent).not.toContain('Created');
    await user.click(prodOption);

    await waitFor(() => expect(screen.getByRole('button', { name: 'API test key' }).textContent).toContain('Production Primary Key'));
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      keyId: '00000000-0000-4000-8000-000000000301',
      keyName: 'Production Primary Key',
    }));
  });
});
