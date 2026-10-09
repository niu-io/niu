import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import WorkspaceRecovery from '../../src/app/WorkspaceRecovery';

describe('workspace recovery copy', () => {
  it('never displays an internal workspace identifier from a missing link', () => {
    const internal = '11111111-1111-4111-8111-111111111111';
    const {container}=render(<MemoryRouter><WorkspaceRecovery problem={{kind:'missing',workspace:internal}} onRetry={vi.fn()}/></MemoryRouter>);
    expect(screen.getByRole('heading',{name:'This workspace link can’t be opened'})).toBeTruthy();
    expect(container.textContent).not.toContain(internal);
    expect(screen.getByRole('link',{name:'Open an available workspace'})).toBeTruthy();
  });
  it.each([401,403])('does not suggest installation-wide access to recover an account error (%s)', status => {
    const {container}=render(<MemoryRouter><WorkspaceRecovery problem={{kind:'api',status,endpoint:'/admin/v1/workspaces'}} onRetry={vi.fn()}/></MemoryRouter>);
    expect(container.textContent).not.toContain('installation administrator');
    expect(container.textContent).not.toContain('administrator credential');
  });
});
