import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OperatorDirectory from '../../../../src/features/operators/components/OperatorDirectory';

describe('OperatorDirectory search', () => {
  it('finds names and combined role/status terms, and recovers from no results without offering creation', async () => {
    const user = userEvent.setup();
    render(<OperatorDirectory operators={[
      { id: 'one', name: 'Demo', role: 'owner', organization_id: 'org', project_id: null, revoked: false },
      { id: 'two', name: 'Former user', role: 'viewer', organization_id: 'org', project_id: null, revoked: true },
    ]} organizations={[{ id: 'org', name: 'Personal workspace' }]} projects={[]} selectedId="" loading={false} disabled={false} projectScope={false} onSelect={vi.fn()} onAdd={vi.fn()} />);
    await user.click(screen.getByRole('button', {name:'Search users'}));
    const search = screen.getByRole('searchbox', { name: 'Search users' });
    await user.type(search, 'OWNER active');
    expect(screen.getByRole('button', { name: 'Demo', exact: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Former user', exact: true })).toBeNull();
    await user.clear(search);
    await user.type(search, 'missing');
    expect(screen.getByText('No matching users')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add first/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Search users' }));
    expect(screen.getByRole('button', { name: 'Former user', exact: true })).toBeTruthy();
  });
});
