import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import SupplierPropertiesFields from '../../../src/features/provider-business/SupplierPropertiesFields';

it('loads linked settings and preserves credentials and availability on revision-aware saves', async () => {
  const vendor = { id: 'configuration-fixture', name: 'Stored configuration', adapter: 'openrouter', api_base: 'https://openrouter.ai/api/v1', enabled: false, revision: 3, has_credential: true };
  const writes: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)); writes.push(body);
      return Response.json({ data: { ...vendor, ...body, revision: 4 } });
    }
    expect(String(input)).toBe('/admin/v1/vendors?supplier=supplier-fixture');
    return Response.json({ data: [vendor] });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<MemoryRouter><SupplierPropertiesFields supplierId="supplier-fixture" supplierName="OpenRouter" token="test-token" /></MemoryRouter>);
  const user = userEvent.setup();
  await screen.findByLabelText('API endpoint');
  expect((screen.getByLabelText('Supplier name') as HTMLInputElement).readOnly).toBe(true);
  expect((screen.getByLabelText('Replace API key (optional)') as HTMLInputElement).value).toBe('');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Supplier API settings saved.');
  expect(writes[0]).toEqual({ name: vendor.name, enabled: false, api_base: vendor.api_base, expected_revision: 3 });
  await user.type(screen.getByLabelText('Replace API key (optional)'), 'test-replacement');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1].expected_revision).toBe(4);
  expect(writes[1].api_key).toBe('test-replacement');
  await waitFor(() => expect((screen.getByLabelText('Replace API key (optional)') as HTMLInputElement).value).toBe(''));
});
