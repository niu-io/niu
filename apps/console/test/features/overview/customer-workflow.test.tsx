import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import OverviewRoute from '../../../src/features/overview/page';
import ModelsRoute from '../../../src/features/models/page';
import { SidebarProvider } from '../../../src/components/ui/sidebar';
import type { ConsoleContext } from '../../../src/app/console-context';

const fixture = vi.hoisted(() => ({ context: {} as ConsoleContext }));
vi.mock('../../../src/app/console-context', () => ({ useConsoleContext: () => fixture.context }));
vi.mock('../../../src/features/executions/components/GatewayActivity', () => ({ default: () => <div>Customer activity</div> }));

describe('customer model workflow', () => {
  it.each(['installation', 'operator'] as const)('shows the current gateway setup flow for a %s session', kind => {
    fixture.context = {
      token: 'test-session', models: [], workspace: null,
      session: { kind, operator: null, permissions: { read: true, write: true, manage_operators: true } },
    } as unknown as ConsoleContext;
    const { container } = render(<MemoryRouter><OverviewRoute /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Create a workspace API key/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Compare model routes/ })).toBeTruthy();
    expect(container.querySelector('a[href$="keys/new"]')).toBeTruthy();
  });
  it('keeps the empty model catalog customer-facing', () => {
    fixture.context = { token: 'test-session', models: [], workspace: null, session: null } as unknown as ConsoleContext;
    const { container } = render(<MemoryRouter><SidebarProvider><ModelsRoute /></SidebarProvider></MemoryRouter>);
    expect(screen.getByText('Ask an installation administrator to add a model route to this workspace.')).toBeTruthy();
    expect(container.querySelector('a[href$="vendors"]')).toBeNull();
  });
});
