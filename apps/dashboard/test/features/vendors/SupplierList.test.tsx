import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import SupplierList from '../../../src/features/vendors/SupplierList';
vi.mock('../../../src/app/dashboard-context', () => ({ useDashboardContext: () => ({ token: 'fixture' }) }));
vi.mock('../../../src/features/vendors/api', () => ({ request: vi.fn(async () => ({ data: [{ id: 'fixture', name: 'Example', members: 0, api_keys: 0, models: 0 }, { id: 'active', name: 'Active supplier', members: 0, api_keys: 1, models: 25 }] })) }));

it('restores the opening control after cancelling creation and deletion', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><SupplierList /></MemoryRouter>);
  await screen.findByRole('link', { name: 'Example' });
  const add = screen.getByRole('button', { name: 'Add Supplier' });
  await user.click(add);
  let dialog = screen.getByRole('dialog');
  expect(document.activeElement).toBe(within(dialog).getByRole('textbox', { name: 'Supplier name' }));
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(document.activeElement).toBe(add));
  const actions = screen.getByRole('button', { name: 'Actions for Example' });
  await user.click(actions);
  await user.click(screen.getByRole('menuitem', { name: 'Delete Supplier' }));
  dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(document.activeElement).toBe(actions));
});

it('explains why a populated supplier cannot be deleted before submission', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><SupplierList /></MemoryRouter>);
  await user.click(await screen.findByRole('button', { name: 'Actions for Active supplier' }));
  await user.click(screen.getByRole('menuitem', { name: 'Delete Supplier' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText(/has API keys, models, or members and cannot be deleted/)).toBeTruthy();
  expect((within(dialog).getByRole('button', { name: 'Delete Supplier' }) as HTMLButtonElement).disabled).toBe(true);
});
