import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import OperatorCreateForm from '@/features/operators/components/OperatorCreateForm';

it('discloses shared billing access only for organization-wide administrators and owners', async () => {
  const user = userEvent.setup();
  render(<OperatorCreateForm disabled={false} onCreate={vi.fn()} canChooseOrganizationScope projects={[{id:'workspace',name:'Workspace'}]} />);
  const disclosure = /organization-wide role can access organization billing and shared funds/;
  expect(screen.queryByText(disclosure)).toBeNull();
  await user.click(screen.getByRole('button', {name:'Role'}));
  await user.click(screen.getByRole('menuitemradio', {name:'Admin · change workspace data'}));
  expect(screen.getByText(disclosure)).toBeTruthy();
  await user.click(screen.getByRole('button', {name:'Scope'}));
  await user.click(screen.getByRole('menuitemradio', {name:'Workspace'}));
  expect(screen.queryByText(disclosure)).toBeNull();
  await user.click(screen.getByRole('button', {name:'Scope'}));
  await user.click(screen.getByRole('menuitemradio', {name:'All workspaces · organization-wide'}));
  await user.click(screen.getByRole('button', {name:'Role'}));
  await user.click(screen.getByRole('menuitemradio', {name:'Owner · manage users and access'}));
  expect(screen.getByText(disclosure)).toBeTruthy();
});
