import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import OverviewRoute from '../../../src/features/overview/page';
import ModelsRoute from '../../../src/features/models/page';
import type { ConsoleContext } from '../../../src/app/console-context';

const fixture = vi.hoisted(() => ({ context: {} as ConsoleContext }));
vi.mock('../../../src/app/console-context', () => ({ useConsoleContext: () => fixture.context }));
vi.mock('../../../src/features/executions/components/GatewayActivity', () => ({ default: () => <div>Customer activity</div> }));

describe('customer model workflow', () => {
  it.each(['installation', 'operator'] as const)('does not send a %s session to provider setup', kind => {
    fixture.context = {
      token: 'test-session', models: [], workspace: null,
      session: { kind, operator: null, permissions: { read: true, write: true, manage_operators: true } },
    } as unknown as ConsoleContext;
    const { container } = render(<MemoryRouter><OverviewRoute /></MemoryRouter>);
    expect(screen.getAllByRole('link', { name: /Explore models/ }).length).toBe(2);
    expect(container.querySelector('a[href$="vendors"]')).toBeNull();
  });
  it('keeps the empty model catalog customer-facing', () => {
    fixture.context = { token: 'test-session', models: [], workspace: null, session: null } as unknown as ConsoleContext;
    const { container } = render(<MemoryRouter><ModelsRoute /></MemoryRouter>);
    expect(screen.getByText('Your administrator can enable model access for this workspace.')).toBeTruthy();
    expect(container.querySelector('a[href$="vendors"]')).toBeNull();
  });
});
