import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import OperatorDetails from '@/features/operators/components/OperatorDetails';
import type { OperatorSession } from '@/features/operators/api';

it('shows active sessions before optional expired and revoked history', async () => {
  const now = Math.floor(Date.now() / 1000);
  const sessions: OperatorSession[] = [
    {id:'expired',operator_id:'member',created_at:'2026-01-01T00:00:00Z',expires_at_unix:now-3600,revoked:false},
    {id:'revoked',operator_id:'member',created_at:'2026-01-01T00:00:00Z',expires_at_unix:now+3600,revoked:true},
    {id:'active',operator_id:'member',created_at:'2026-01-01T00:00:00Z',expires_at_unix:now+7200,revoked:false},
  ];
  render(<OperatorDetails operator={{id:'member',name:'Example',role:'admin',organization_id:'org',project_id:null,revoked:false}} organizations={[]} projects={[]} sessions={sessions} sessionsLoading={false} events={[]} eventsLoading={false} hasMoreEvents={false} busy={false} credential={null} confirmTarget={null} canChangeRole={false} roleRefreshError="" onSaveRole={vi.fn()} onReloadRole={vi.fn()} onDismissCredential={vi.fn()} onIssueSession={vi.fn()} onConfirm={vi.fn()} onRevokeSession={vi.fn()} onRevokeOperator={vi.fn()} onLoadMoreEvents={vi.fn()}/>);
  const table = screen.getByRole('table');
  expect(within(table).getByRole('columnheader', {name: 'Created'})).toBeTruthy();
  expect(within(table).queryByText('Access session')).toBeNull();
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  expect(within(table).getAllByText('Active')).toBeTruthy();
  expect(within(table).getByRole('button', {name:'Revoke'})).toBeTruthy();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', {name:'Show past sessions (2)'}));
  expect(within(table).getAllByRole('row')).toHaveLength(4);
  expect(within(table).getAllByText('Expired')).toBeTruthy();
  expect(within(table).getAllByText('Revoked')).toBeTruthy();
  await user.click(screen.getByRole('button', {name:'Hide past sessions (2)'}));
  expect(within(table).getAllByRole('row')).toHaveLength(2);
});
