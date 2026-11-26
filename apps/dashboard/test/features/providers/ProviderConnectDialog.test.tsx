import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import ProviderConnectDialog from '../../../app/features/providers/components/ProviderConnectDialog';
import { providerPreset } from '../../../app/features/providers/provider-presets';
import { request, ProviderRequestError } from '../../../app/features/providers/api';

const refreshWorkspace = vi.fn(async () => {});
vi.mock('../../../app/shell/dashboard-context', () => ({
  useDashboardContext: () => ({
    token: 'fixture',
    session: { operating_mode: 'resale' },
    organization: { id: 'account', name: 'Personal account' },
    refreshWorkspace,
  }),
}));
vi.mock('../../../app/features/providers/api', async original => ({
  ...(await original<typeof import('../../../app/features/providers/api')>()),
  request: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(request).mockReset();
  refreshWorkspace.mockClear();
});

function show(onSaved = vi.fn(), onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <ProviderConnectDialog
        preset={providerPreset({
          id: 'deepseek',
          name: 'DeepSeek',
          protocol: 'openai',
          api_base: 'https://api.deepseek.com',
          website: 'https://platform.deepseek.com/api_keys',
          price_source: 'https://api-docs.deepseek.com/quick_start/pricing/',
          price_support: 'official_catalog_unqualified',
        })}
        onSaved={onSaved}
        onClose={onClose}
      />
    </MemoryRouter>,
  );
  return { user: userEvent.setup(), onSaved, onClose };
}

it('prefills official settings and cancelling never creates a connection', async () => {
  const { user, onClose } = show();
  await user.click(screen.getByText('Connection settings'));
  expect((screen.getByLabelText('API base URL') as HTMLInputElement).value).toBe('https://api.deepseek.com');
  await user.type(screen.getByLabelText('Provider API key'), 'draft-secret');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(request).not.toHaveBeenCalled();
});

it('blocks blind replay after uncertain key creation and clears the secret', async () => {
  vi.mocked(request).mockRejectedValue(new TypeError('Network failure'));
  const { user } = show();
  await user.type(screen.getByLabelText('Provider API key'), 'private-key');
  await user.click(screen.getByRole('button', { name: 'Connect and import models' }));
  await screen.findByRole('alert');
  expect(screen.queryByLabelText('Provider API key')).toBeNull();
  expect(
    (within(screen.getByRole('dialog')).getByRole('button', { name: 'Connect and import models' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(request).toHaveBeenCalledOnce();
});

it('discovers models under the unified workflow and links directly to Provider configuration with autosync', async () => {
  vi.mocked(request).mockImplementation(async (_token, path) =>
    path.endsWith('/supplier')
      ? { data: { id: 'resale-provider', slug: 'deepseek' } }
      : path.endsWith('/integration')
        ? { data: { effective_type: 'deepseek', revision: 0 } }
        : path.endsWith('/import')
          ? { data: { imported: 2, discovered: 2 } }
          : { data: { id: 'resale-key', revision: 1 } },
  );
  const { user } = show();
  await user.type(screen.getByLabelText('Provider API key'), 'resale-private-key');
  await user.click(screen.getByRole('button', { name: 'Connect and import models' }));
  const nextLink = await screen.findByRole('link', { name: 'Configure Provider' });
  expect(nextLink.getAttribute('href')).toBe('/admin/providers/deepseek?autosync=1');
  expect(screen.getByRole('status').textContent).toContain('2 models discovered');
  expect(vi.mocked(request).mock.calls.filter(([, path]) => path.endsWith('/import'))).toHaveLength(1);
  expect(vi.mocked(request).mock.calls[0][3]).not.toHaveProperty('personal_organization_id');
  expect(vi.mocked(request).mock.calls[0][3]).not.toHaveProperty('access_scope');
});

it('keeps a saved connection recoverable when discovery has no catalog without saving the secret twice', async () => {
  let imports = 0;
  vi.mocked(request).mockImplementation(async (_token, path) => {
    if (path === '/api/v1/admin/providers/connections') return { data: { id: 'saved-resale-key', revision: 1 } };
    if (path.endsWith('/supplier')) return { data: { id: 'resale-provider' } };
    if (path.endsWith('/integration')) return { data: { effective_type: 'deepseek', revision: 0 } };
    if (path.endsWith('/import')) {
      imports += 1;
      throw new ProviderRequestError('Catalog unavailable.', 502);
    }
    throw new Error('Unexpected request');
  });
  const { user, onSaved } = show();
  await user.type(screen.getByLabelText('Provider API key'), 'resale-private-key');
  await user.click(screen.getByRole('button', { name: 'Connect and import models' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Catalog unavailable.');
  expect(screen.queryByLabelText('Provider API key')).toBeNull();
  expect(screen.getByRole('button', { name: 'Retry model import' })).toBeTruthy();
  expect(onSaved).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Retry model import' }));
  await waitFor(() => expect(imports).toBe(2));
  const creates = vi
    .mocked(request)
    .mock.calls.filter(([, path, method]) => path === '/api/v1/admin/providers/connections' && method === 'POST');
  expect(creates).toHaveLength(1);
  expect(creates[0][3]).toMatchObject({ api_key: 'resale-private-key' });
  expect(creates[0][3]).not.toHaveProperty('personal_organization_id');
  expect(creates[0][3]).not.toHaveProperty('access_scope');
});
