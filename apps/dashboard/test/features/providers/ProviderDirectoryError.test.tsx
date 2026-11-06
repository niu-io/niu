const directoryState = vi.hoisted(() => ({
  error: 'Could not load providers.',
  directory: [] as {id:string;slug?:string;name:string}[],
  reload: null as null | (() => void),
}));
vi.mock('../../../app/shell/dashboard-context', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../app/shell/dashboard-context')>();
  return {
    ...actual,
    useDashboardContext: () => ({
      token: 'test-token',
      session: {kind:'installation', operator:null, permissions:{read:true,write:true,manage_operators:true}},
      providerDirectory: directoryState.directory,
      providerDirectoryError: directoryState.error,
      reloadProviderDirectory: () => directoryState.reload?.(),
    }),
  };
});
vi.mock('../../../app/features/provider-business/admin', () => ({
  default: () => <h1>Provider admin loaded</h1>,
}));
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import ProvidersRoute from '../../../app/features/providers/page';

it('turns a failed directory read into a retryable status instead of a false missing Provider', async () => {
  const reload = vi.fn(() => {
    directoryState.error = '';
    directoryState.directory = [{id:'example',slug:'example-provider',name:'Example'}];
  });
  directoryState.reload = reload;
  const user = userEvent.setup();
  const page = () => <MemoryRouter initialEntries={['/admin/providers/example']}>
    <Routes><Route path="/admin/providers/:providerId" element={<ProvidersRoute/>}/></Routes>
  </MemoryRouter>;

  const view = render(page());
  expect(await screen.findByText('The Provider directory could not be loaded. Retry before opening this Provider.')).toBeTruthy();
  expect(screen.queryByText('Provider unavailable.')).toBeNull();

  await user.click(screen.getByRole('button',{name:'Retry Provider directory'}));
  expect(reload).toHaveBeenCalledTimes(1);
  view.rerender(page());

  expect(await screen.findByRole('heading',{name:'Provider admin loaded'})).toBeTruthy();
  expect(screen.queryByText('The Provider directory could not be loaded. Retry before opening this Provider.')).toBeNull();
});
