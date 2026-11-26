import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { NiuAdminClient } from '@niu-io/sdk/admin';
import { Customers } from '../../../app/features/customers/page';
import { clearSessionCache } from '../../../app/lib/query-cache';

vi.mock('@/shell/platform-currency', () => ({ usePlatformCurrency: () => ({ currency: 'USD', ready: true, error: null }) }));
afterEach(() => {
  cleanup();
  clearSessionCache();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('preserves the original organization creation request on retry and requires explicit acknowledgement before editing', async () => {
  let createdCompany: { id: string; name: string; account_kind: 'organization' } | null = null;
  const create = vi
    .spyOn(NiuAdminClient.prototype, 'createCompany')
    .mockRejectedValueOnce(new Error('Lost response'))
    .mockRejectedValueOnce(new Error('Lost response again'))
    .mockImplementationOnce(async () => {
      createdCompany = {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Acme revised',
        account_kind: 'organization',
      };
      return createdCompany as never;
    });
  vi.stubGlobal(
    'fetch',
    vi.fn(async input => {
      const url = String(input);
      if (url.includes('/admin/customers') || url.includes('/platform/customer-accounts')) {
        return Response.json({
          data: createdCompany
            ? [
                {
                  organization_id: createdCompany.id,
                  organization_name: createdCompany.name,
                  account_kind: 'organization',
                  owner: null,
                  workspace_count: 0,
                  member_count: 0,
                  custom_price_count: 0,
                  accounts: [],
                  credits: null,
                },
              ]
            : [],
          next_after: null,
        });
      }
      if (url.includes('/admin/registrations')) {
        return Response.json({ data: [], counts: { pending: 0, approved: 0, rejected: 0 }, next_after: null });
      }
      if (url.includes('/workspaces')) return Response.json({ data: [], next_cursor: null });
      if (url.includes('/operators')) return Response.json({ data: [], next_cursor: null });
      if (url.includes('/auth/config')) return Response.json({ password_login: true });
      throw new Error('Unexpected ' + url);
    }),
  );

  const user = userEvent.setup();
  render(<MemoryRouter><Customers token="company-create-test" canSetup onWorkspaceCreated={() => {}} /></MemoryRouter>);
  await user.click((await screen.findAllByRole('button', { name: 'New customer' }))[0]);
  await user.click(screen.getByRole('button', { name: 'New organization' }));

  await user.type(screen.getByLabelText('Organization name'), 'Acme');
  await user.click(screen.getByRole('button', { name: 'Create customer' }));
  await screen.findByText(/Creation could not be confirmed/);
  await user.click(screen.getByRole('button', { name: 'Retry creation' }));
  await screen.findByText(/Creation could not be confirmed/);
  expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);

  await user.type(screen.getByLabelText('Organization name'), ' revised');
  expect((screen.getByRole('button', { name: 'Retry creation' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/previous request may have succeeded/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Start a new request' }));
  await user.click(screen.getByRole('button', { name: 'Create customer' }));

  await screen.findByText('Acme revised');
  expect(create.mock.calls[2][0]).toEqual({
    name: 'Acme revised',
    account_kind: 'organization',
    attach_creator: false,
  });
  expect(create.mock.calls[2][1]?.idempotencyKey).not.toBe(create.mock.calls[0][1]?.idempotencyKey);
});

it('defaults to creating a personal customer account with Default workspace, login credentials, and optional trial credit in one step', async () => {
  const createCompany = vi.spyOn(NiuAdminClient.prototype, 'createCompany').mockResolvedValueOnce({
    id: '20000000-0000-4000-8000-000000000002',
    name: 'alice',
    account_kind: 'personal',
  } as never);
  const createWorkspace = vi.spyOn(NiuAdminClient.prototype, 'createWorkspace').mockResolvedValueOnce({
    id: 'ws-default',
    organization_id: '20000000-0000-4000-8000-000000000002',
    name: 'Default',
    slug: 'alice',
  } as never);
  const createOwner = vi.spyOn(NiuAdminClient.prototype, 'createOperatorIdentity').mockResolvedValueOnce({
    operator: {
      id: 'op-alice',
      organization_id: '20000000-0000-4000-8000-000000000002',
      project_id: null,
      name: 'alice',
      role: 'owner',
      revoked: false,
    },
  } as never);
  const setPassword = vi.spyOn(NiuAdminClient.prototype, 'setMemberPassword').mockResolvedValueOnce({ revision: 1 } as never);
  const grantCalls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async input => {
      const url = String(input);
      if (url.includes('/grants/prepare') || url.endsWith('/grants')) {
        grantCalls.push(url);
        return Response.json({ data: { id: 'grant-1' } });
      }
      if (url.includes('/admin/customers') || url.includes('/platform/customer-accounts')) {
        return Response.json({ data: [], next_after: null });
      }
      if (url.includes('/admin/registrations')) {
        return Response.json({ data: [], counts: { pending: 0, approved: 0, rejected: 0 }, next_after: null });
      }
      return Response.json({ data: [] });
    }),
  );

  const user = userEvent.setup();
  render(<MemoryRouter><Customers token="one-step-personal-token" canSetup onWorkspaceCreated={() => {}} /></MemoryRouter>);
  await user.click((await screen.findAllByRole('button', { name: 'New customer' }))[0]);
  await user.type(screen.getByLabelText('Login email'), 'alice@acme.com');
  await user.click(screen.getByRole('button', { name: 'Generate' }));
  await user.click(screen.getByRole('button', { name: '$10' }));
  await user.click(screen.getByRole('button', { name: 'Create customer' }));

  expect(await screen.findByText('Customer ready')).toBeTruthy();
  expect(screen.getByText('alice@acme.com')).toBeTruthy();
  expect(screen.getByText('$10.00')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Copy sign-in details' })).toBeTruthy();
  expect(createCompany).toHaveBeenCalledWith(
    { name: 'alice', account_kind: 'personal', attach_creator: false },
    expect.objectContaining({ idempotencyKey: expect.any(String) }),
  );
  expect(createWorkspace).toHaveBeenCalledWith(
    { organization_id: '20000000-0000-4000-8000-000000000002', name: 'Default', slug: 'alice' },
    expect.objectContaining({ idempotencyKey: expect.any(String) }),
  );
  expect(createOwner).toHaveBeenCalledTimes(1);
  expect(setPassword).toHaveBeenCalledWith(
    'op-alice',
    expect.objectContaining({ email: 'alice@acme.com', expected_revision: 0 }),
  );
  expect(grantCalls).toHaveLength(2);
});

it('can optionally add a login directly to an existing organization without creating a new one', async () => {
  const createCompany = vi.spyOn(NiuAdminClient.prototype, 'createCompany');
  const createWorkspace = vi.spyOn(NiuAdminClient.prototype, 'createWorkspace');
  const createMember = vi.spyOn(NiuAdminClient.prototype, 'createOperatorIdentity').mockResolvedValueOnce({
    operator: {
      id: 'op-bob',
      organization_id: '30000000-0000-4000-8000-000000000003',
      project_id: null,
      name: 'Bob',
      role: 'admin',
      revoked: false,
    },
  } as never);
  const setPassword = vi.spyOn(NiuAdminClient.prototype, 'setMemberPassword').mockResolvedValueOnce({ revision: 1 } as never);

  vi.stubGlobal(
    'fetch',
    vi.fn(async input => {
      const url = String(input);
      if (url.includes('/admin/customers')) {
        return Response.json({
          data: [
            {
              organization_id: '30000000-0000-4000-8000-000000000003',
              organization_name: 'Acme Studio',
              account_kind: 'organization',
              owner: { name: 'Alex', email: 'alex@acme.com' },
              workspace_count: 2,
              member_count: 1,
              custom_price_count: 0,
              accounts: [],
              credits: null,
            },
          ],
          next_after: null,
        });
      }
      if (url.includes('/admin/registrations')) {
        return Response.json({ data: [], counts: { pending: 0, approved: 0, rejected: 0 }, next_after: null });
      }
      return Response.json({ data: [] });
    }),
  );

  const user = userEvent.setup();
  render(<MemoryRouter><Customers token="join-existing-token" canSetup onWorkspaceCreated={() => {}} /></MemoryRouter>);
  expect(await screen.findByText('Acme Studio')).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'New customer' }));
  await user.click(screen.getByRole('button', { name: 'Join organization' }));
  await user.type(screen.getByLabelText('Login email'), 'bob@acme.com');
  await user.type(screen.getByLabelText('Name (optional)'), 'Bob');
  await user.click(screen.getByRole('button', { name: 'Generate' }));
  await user.click(screen.getByRole('button', { name: 'Add account' }));

  expect(await screen.findByText('Customer ready')).toBeTruthy();
  expect(screen.getByText('bob@acme.com')).toBeTruthy();
  expect(createCompany).not.toHaveBeenCalled();
  expect(createWorkspace).not.toHaveBeenCalled();
  expect(createMember).toHaveBeenCalledWith(
    {
      organization_id: '30000000-0000-4000-8000-000000000003',
      project_id: null,
      name: 'Bob',
      role: 'admin',
    },
    expect.objectContaining({ idempotencyKey: expect.any(String) }),
  );
  expect(setPassword).toHaveBeenCalledWith(
    'op-bob',
    expect.objectContaining({ email: 'bob@acme.com', expected_revision: 0 }),
  );
});

it('places Account type at the top of the dialog and preserves personal name across mode switches without aliasing it to Organization name', async () => {
  const createCompany = vi.spyOn(NiuAdminClient.prototype, 'createCompany').mockResolvedValueOnce({
    id: '40000000-0000-4000-8000-000000000004',
    name: 'Tiwater',
    account_kind: 'organization',
  } as never);
  vi.spyOn(NiuAdminClient.prototype, 'createWorkspace').mockResolvedValueOnce({
    id: 'ws-tiwater',
    organization_id: '40000000-0000-4000-8000-000000000004',
    name: 'Default',
    slug: 'tiwater',
  } as never);
  const createOwner = vi.spyOn(NiuAdminClient.prototype, 'createOperatorIdentity').mockResolvedValueOnce({
    operator: {
      id: 'op-hugh',
      organization_id: '40000000-0000-4000-8000-000000000004',
      project_id: null,
      name: 'Hugh',
      role: 'owner',
      revoked: false,
    },
  } as never);
  vi.spyOn(NiuAdminClient.prototype, 'setMemberPassword').mockResolvedValueOnce({ revision: 1 } as never);

  vi.stubGlobal(
    'fetch',
    vi.fn(async input => {
      const url = String(input);
      if (url.includes('/admin/customers')) {
        return Response.json({
          data: [
            {
              organization_id: '30000000-0000-4000-8000-000000000003',
              organization_name: 'Existing Co',
              account_kind: 'organization',
              owner: { name: 'Alex', email: 'alex@existing.com' },
              workspace_count: 1,
              member_count: 1,
              custom_price_count: 0,
              accounts: [],
              credits: null,
            },
          ],
          next_after: null,
        });
      }
      if (url.includes('/admin/registrations')) {
        return Response.json({ data: [], counts: { pending: 0, approved: 0, rejected: 0 }, next_after: null });
      }
      return Response.json({ data: [] });
    }),
  );

  const user = userEvent.setup();
  render(<MemoryRouter><Customers token="preserve-person-name-token" canSetup onWorkspaceCreated={() => {}} /></MemoryRouter>);
  expect(await screen.findByText('Existing Co')).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'New customer' }));

  const accountTypeGroup = screen.getByRole('group', { name: 'Account type' });
  const emailInput = screen.getByLabelText('Login email') as HTMLInputElement;
  const personNameInput = screen.getByLabelText('Name (optional)') as HTMLInputElement;
  expect(accountTypeGroup.compareDocumentPosition(emailInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Account organization' })).toBeNull();

  // Fill personal info first while in default Personal account mode
  await user.type(emailInput, 'hugh@tiwater.com');
  await user.type(personNameInput, 'Hugh');
  await user.click(screen.getByRole('button', { name: 'Generate' }));

  // Switch to New organization — personal name and email must stay intact, while Organization name starts blank
  await user.click(screen.getByRole('button', { name: 'New organization' }));
  const orgNameInput = screen.getByLabelText('Organization name') as HTMLInputElement;
  const ownerNameInput = screen.getByLabelText('Owner name (optional)') as HTMLInputElement;
  const ownerEmailInput = screen.getByLabelText('Owner email (optional)') as HTMLInputElement;
  expect(accountTypeGroup.compareDocumentPosition(orgNameInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(orgNameInput.value).toBe('');
  expect(ownerNameInput.value).toBe('Hugh');
  expect(ownerEmailInput.value).toBe('hugh@tiwater.com');

  await user.type(orgNameInput, 'Tiwater');

  // Switch to Join organization and back — neither Hugh nor Tiwater is cleared
  await user.click(screen.getByRole('button', { name: 'Join organization' }));
  expect((screen.getByLabelText('Name (optional)') as HTMLInputElement).value).toBe('Hugh');
  expect((screen.getByLabelText('Login email') as HTMLInputElement).value).toBe('hugh@tiwater.com');

  await user.click(screen.getByRole('button', { name: 'New organization' }));
  expect((screen.getByLabelText('Organization name') as HTMLInputElement).value).toBe('Tiwater');
  expect((screen.getByLabelText('Owner name (optional)') as HTMLInputElement).value).toBe('Hugh');

  await user.click(screen.getByRole('button', { name: 'Create customer' }));

  expect(await screen.findByText('Customer ready')).toBeTruthy();
  expect(createCompany).toHaveBeenCalledWith(
    { name: 'Tiwater', account_kind: 'organization', attach_creator: false },
    expect.objectContaining({ idempotencyKey: expect.any(String) }),
  );
  expect(createOwner).toHaveBeenCalledWith(
    {
      organization_id: '40000000-0000-4000-8000-000000000004',
      project_id: null,
      name: 'Hugh',
      role: 'owner',
    },
    expect.objectContaining({ idempotencyKey: expect.any(String) }),
  );
  expect(screen.getByText('Hugh')).toBeTruthy();
});
