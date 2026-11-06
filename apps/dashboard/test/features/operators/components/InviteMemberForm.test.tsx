import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import InviteMemberForm from '@/features/operators/components/InviteMemberForm';

it('discloses shared billing access only for organization-wide administrators and owners', async () => {
  const user = userEvent.setup();
  render(<InviteMemberForm disabled={false} onCreate={vi.fn()} canChooseOrganizationScope projects={[{ id: 'workspace', name: 'Workspace' }]} />);
  const disclosure = /organization-wide role can access organization billing and shared funds/;
  expect(screen.queryByText(disclosure)).toBeNull();
  await user.click(screen.getByRole('button', { name: /^Role:/ }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Admin · change workspace data' }));
  expect(screen.getByText(disclosure)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: /^Scope:/ }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Workspace' }));
  expect(screen.queryByText(disclosure)).toBeNull();
  await user.click(screen.getByRole('button', { name: /^Scope:/ }));
  await user.click(screen.getByRole('menuitemradio', { name: 'All workspaces · organization-wide' }));
  await user.click(screen.getByRole('button', { name: /^Role:/ }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Owner · manage users and access' }));
  expect(screen.getByText(disclosure)).toBeTruthy();
});

it('creates a seven-day workspace invitation by default without a raw credential', async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn();
  render(<InviteMemberForm disabled={false} onCreate={onCreate} projects={[{ id: 'workspace', name: 'Workspace' }]} defaultProjectId="workspace" />);

  expect(screen.getByRole('button', { name: 'Invitation expires in: 7 days' })).toBeTruthy();
  expect(screen.getByText(/must already have a Niu account/)).toBeTruthy();
  expect(screen.queryByLabelText('Access token')).toBeNull();

  await user.type(screen.getByLabelText('Email'), ' Person@Example.Test ');
  await user.type(screen.getByLabelText('Name (optional)'), ' Alex Chen ');
  await user.click(screen.getByRole('button', { name: 'Create invitation' }));
  expect(onCreate).toHaveBeenCalledWith({
    email: 'Person@Example.Test',
    name: 'Alex Chen',
    role: 'viewer',
    projectId: 'workspace',
    expiresInSeconds: 7 * 86400,
  });
});

it('does not submit an invalid email and can choose a one-day invitation', async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn();
  render(<InviteMemberForm disabled={false} onCreate={onCreate} />);
  await user.type(screen.getByLabelText('Email'), 'not-an-email');
  expect((screen.getByRole('button', { name: 'Create invitation' }) as HTMLButtonElement).disabled).toBe(true);
  await user.clear(screen.getByLabelText('Email'));
  await user.type(screen.getByLabelText('Email'), 'person@example.test');
  await user.click(screen.getByRole('button', { name: /^Invitation expires in:/ }));
  await user.click(screen.getByRole('menuitemradio', { name: '1 day' }));
  await user.click(screen.getByRole('button', { name: 'Create invitation' }));
  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ expiresInSeconds: 86400, name: null }));
});
