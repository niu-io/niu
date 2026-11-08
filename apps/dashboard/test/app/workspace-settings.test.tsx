import { useEffect, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider, type ActionFunctionArgs } from 'react-router';
import type { DashboardContext } from '../../app/shell/dashboard-context';
import { setActiveSessionSnapshot } from '../../app/shell/router-context';
import { bindLazy } from '../../app/routes';
import WorkspaceSettings, { clientAction } from '../../app/features/workspace/settings-page';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

const workspace = {
  id: 'workspace-fixture',
  name: 'Example workspace',
  organization_id: 'organization-fixture',
  organization_name: 'Company',
};
const secondWorkspace = {
  ...workspace,
  id: 'remaining',
  name: 'Remaining workspace',
};

let context: DashboardContext;
let applyWorkspaceRename: ReturnType<typeof vi.fn>;
let deleteWorkspace: ReturnType<typeof vi.fn>;
let pushContext: ((next: DashboardContext) => void) | null;
let fetchMock: FetchMock;

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function isRenameRequest(input: RequestInfo | URL, init?: RequestInit) {
  return String(input).includes('/api/v1/organizations/') && init?.method === 'PATCH';
}

function renameRequests() {
  return fetchMock.mock.calls.filter(([input, init]) => isRenameRequest(input, init));
}

function snapshot(next: DashboardContext) {
  setActiveSessionSnapshot({
    token: 'fixture',
    principalKey: 'principal',
    authorityKey: 'authority',
    session: next.session,
    organizations: [],
    workspaces: next.workspaces,
    activeWorkspace: next.workspace,
  });
}

function SettingsHarness() {
  const [current, setCurrent] = useState(context);
  useEffect(() => {
    pushContext = setCurrent;
    return () => {
      pushContext = null;
    };
  }, []);
  return <Outlet context={current} />;
}

function renderSettings(initialPath = '/workspaces/example/settings') {
  const router = createMemoryRouter(
    [
      {
        id: 'root',
        path: '/',
        element: <SettingsHarness />,
        hydrateFallbackElement: <p>Loading workspace settings</p>,
        children: [
          {
            path: 'workspaces/:workspace/settings',
            lazy: bindLazy(async () => ({ default: WorkspaceSettings, clientAction })),
          },
          { path: 'workspaces/:workspace/billing', element: <p>Workspace billing</p> },
          { path: 'workspaces/:workspace', element: <p>Workspace overview</p> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
  return { router, ...render(<RouterProvider router={router} />) };
}

function switchWorkspace(next = secondWorkspace) {
  act(() => {
    pushContext?.({ ...context, workspace: next });
  });
}

beforeEach(() => {
  applyWorkspaceRename = vi.fn();
  deleteWorkspace = vi.fn();
  context = {
    token: 'fixture',
    workspace,
    workspaces: [workspace, secondWorkspace],
    session: {
      kind: 'operator',
      operator: { project_id: null },
      permissions: { write: true, manage_operators: true },
    },
    applyWorkspaceRename,
    deleteWorkspace,
    refreshWorkspace: vi.fn().mockRejectedValue(new Error('List reload unavailable')),
  } as unknown as DashboardContext;
  pushContext = null;
  snapshot(context);
  fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ data: [] }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('workspace settings', () => {
  it('renders a single general section and links to the canonical workspace billing route', async () => {
    renderSettings();
    await screen.findByLabelText('Workspace name');
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('link', { name: 'Spending & statements' }).getAttribute('href')).toBe(
      '/workspaces/example/billing',
    );
  });

  it('redirects the legacy spending and billing tab to workspace billing with its scope', async () => {
    const { router } = renderSettings(
      '/workspaces/example/settings?section=billing&tab=statements#limits',
    );
    expect(await screen.findByText('Workspace billing')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/workspaces/example/billing');
    expect(router.state.location.search).toBe('?tab=statements');
    expect(router.state.location.hash).toBe('#limits');
  });

  it('discards deletion confirmation when its workspace changes', async () => {
    renderSettings();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete workspace', exact: true }));
    await user.type(screen.getByLabelText('Type the workspace name to confirm'), 'Example workspace');
    switchWorkspace();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deleteWorkspace).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete workspace', exact: true }));
    expect((screen.getByLabelText('Type the workspace name to confirm') as HTMLInputElement).value).toBe('');
    expect(
      within(screen.getByRole('dialog'))
        .getByRole('button', { name: 'Delete workspace', exact: true })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('ignores an earlier workspace save failure after switching workspaces', async () => {
    let rejectSave!: (error: unknown) => void;
    fetchMock.mockImplementation((input, init) => {
      if (isRenameRequest(input, init)) {
        return new Promise<Response>((_resolve, reject) => {
          rejectSave = reject;
        });
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    renderSettings();
    const user = userEvent.setup();
    const input = (await screen.findByLabelText('Workspace name')) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'Changed name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy());
    switchWorkspace();
    await waitFor(() => expect(input.value).toBe('Remaining workspace'));
    expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull();
    await act(async () => {
      rejectSave(new TypeError('Failed to fetch'));
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Workspace renamed.')).toBeNull();
    expect(applyWorkspaceRename).not.toHaveBeenCalled();
  });

  it('applies a rename that finishes after switching workspaces without showing the old success state', async () => {
    let resolveSave!: (response: Response) => void;
    fetchMock.mockImplementation((input, init) => {
      if (isRenameRequest(input, init)) {
        return new Promise<Response>(resolve => {
          resolveSave = resolve;
        });
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    renderSettings();
    const user = userEvent.setup();
    const input = (await screen.findByLabelText('Workspace name')) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'Customer support');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy());
    switchWorkspace();
    await waitFor(() => expect(input.value).toBe('Remaining workspace'));
    await act(async () => {
      resolveSave(jsonResponse({ id: workspace.id, name: 'Customer support' }));
    });
    expect(applyWorkspaceRename).toHaveBeenCalledWith(workspace.id, 'Customer support');
    expect(screen.queryByText('Workspace renamed.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows pending state while renaming and applies the confirmed name', async () => {
    let resolveSave!: (response: Response) => void;
    fetchMock.mockImplementation((input, init) => {
      if (isRenameRequest(input, init)) {
        return new Promise<Response>(resolve => {
          resolveSave = resolve;
        });
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    renderSettings();
    const user = userEvent.setup();
    const input = (await screen.findByLabelText('Workspace name')) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'Renamed workspace');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true);
    expect(input.disabled).toBe(true);
    expect(input.closest('form')?.getAttribute('aria-busy')).toBe('true');
    expect(renameRequests()).toHaveLength(1);

    await act(async () => {
      resolveSave(jsonResponse({ id: workspace.id, name: 'Renamed workspace' }));
    });

    expect(await screen.findByText('Workspace renamed.')).toBeTruthy();
    expect(applyWorkspaceRename).toHaveBeenCalledWith(workspace.id, 'Renamed workspace');
    expect(input.value).toBe('Renamed workspace');
    expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull();
  });

  it('validates the UTF-8 name limit before dispatching the mutation', async () => {
    renderSettings();
    const user = userEvent.setup();
    const input = (await screen.findByLabelText('Workspace name')) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '名'.repeat(100));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('1–200 bytes');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('workspace-name-error');
    expect(renameRequests()).toHaveLength(0);
    expect(applyWorkspaceRename).not.toHaveBeenCalled();
  });

  it('shows the server validation error and keeps the typed name for a retry', async () => {
    fetchMock.mockImplementation((input, init) => {
      if (isRenameRequest(input, init)) {
        return Promise.resolve(
          jsonResponse({ error: { message: 'Name must contain 1 to 200 bytes' } }, 422),
        );
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    renderSettings();
    const user = userEvent.setup();
    const input = (await screen.findByLabelText('Workspace name')) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'A rejected name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Name must contain 1 to 200 bytes');
    expect(input.value).toBe('A rejected name');
    expect(input.disabled).toBe(false);
    expect(screen.queryByText('Workspace renamed.')).toBeNull();
    expect(applyWorkspaceRename).not.toHaveBeenCalled();
  });

  it('offers a safe retry after an uncertain network outcome', async () => {
    fetchMock
      .mockImplementationOnce((input, init) => {
        if (isRenameRequest(input, init)) return Promise.reject(new TypeError('Failed to fetch'));
        return Promise.resolve(jsonResponse({ data: [] }));
      })
      .mockImplementationOnce((input, init) => {
        if (isRenameRequest(input, init)) {
          return Promise.resolve(jsonResponse({ id: workspace.id, name: 'Retried workspace' }));
        }
        return Promise.resolve(jsonResponse({ data: [] }));
      });
    renderSettings();
    const user = userEvent.setup();
    const input = (await screen.findByLabelText('Workspace name')) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'Retried workspace');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('may or may not have been saved');
    expect(alert.textContent).toContain('repeating a rename is safe');
    expect(input.value).toBe('Retried workspace');
    expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Workspace renamed.')).toBeTruthy();
    expect(renameRequests()).toHaveLength(2);
    expect(applyWorkspaceRename).toHaveBeenCalledWith(workspace.id, 'Retried workspace');
  });

  it('prevents deletion of the persisted default regardless of its display name', async () => {
    context = { ...context, workspace: { ...workspace, name: 'Renamed default', is_default: true } };
    snapshot(context);
    renderSettings();
    expect(await screen.findByLabelText('Workspace name')).toBeTruthy();
    expect(screen.queryByText('The default workspace cannot be deleted.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete workspace' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deleteWorkspace).not.toHaveBeenCalled();
  });

  it('requires confirmation, preserves backend errors, and closes after confirmed deletion', async () => {
    deleteWorkspace
      .mockRejectedValueOnce(new Error('Workspace has saved records'))
      .mockResolvedValueOnce(undefined);
    renderSettings();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete workspace' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('button[data-slot="button"][disabled]')).toBeTruthy();
    await user.type(screen.getByLabelText('Type the workspace name to confirm'), 'Example workspace');
    await user.click(screen.getAllByRole('button', { name: 'Delete workspace' }).at(-1)!);
    expect((await screen.findByRole('alert')).textContent).toContain('Workspace has saved records');
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Delete workspace' }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deleteWorkspace).toHaveBeenCalledWith(workspace);
    expect(context.refreshWorkspace).not.toHaveBeenCalled();
  });

  it('does not expose deletion to workspace-scoped administrators', async () => {
    const operator = context.session?.operator;
    if (!operator) throw new Error('Fixture session is missing its operator.');
    operator.project_id = workspace.id;
    snapshot(context);
    renderSettings();
    await screen.findByLabelText('Workspace name');
    expect(screen.queryByRole('button', { name: 'Delete workspace' })).toBeNull();
  });

  it('clears a failed deletion when canceled and returns focus to its trigger', async () => {
    deleteWorkspace.mockRejectedValue(new Error('Workspace has saved records'));
    renderSettings();
    const user = userEvent.setup();
    const trigger = await screen.findByRole('button', { name: 'Delete workspace', exact: true });
    await user.click(trigger);
    await user.type(screen.getByLabelText('Type the workspace name to confirm'), 'Example workspace');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete workspace', exact: true }));
    expect((await screen.findByRole('alert')).textContent).toContain('Workspace has saved records');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel', exact: true }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deleteWorkspace).toHaveBeenCalledTimes(1);
    await user.click(trigger);
    expect((screen.getByLabelText('Type the workspace name to confirm') as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('disables the rename form without write permission', async () => {
    const session = context.session;
    if (!session) throw new Error('Fixture session is missing.');
    context = {
      ...context,
      session: {
        ...session,
        permissions: { ...session.permissions, write: false },
      },
    };
    snapshot(context);
    renderSettings();
    expect(((await screen.findByLabelText('Workspace name')) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('workspace rename action', () => {
  function runAction(name: string, workspaceId = workspace.id) {
    return clientAction({
      request: new Request('http://localhost/workspaces/example/settings', {
        method: 'POST',
        body: new URLSearchParams({ intent: 'rename-workspace', workspaceId, name }),
      }),
      params: { workspace: 'example' },
      context: undefined,
    } as unknown as ActionFunctionArgs);
  }

  it('rejects a rename when the current session lacks write permission', async () => {
    const session = context.session;
    if (!session) throw new Error('Fixture session is missing.');
    snapshot({
      ...context,
      session: {
        ...session,
        permissions: { ...session.permissions, write: false },
      },
    });
    const result = await runAction('Renamed workspace');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('forbidden');
    expect(renameRequests()).toHaveLength(0);
  });

  it('rejects a workspace that is not in the verified snapshot', async () => {
    const result = await runAction('Renamed workspace', 'unknown-workspace');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('workspace-missing');
    expect(renameRequests()).toHaveLength(0);
  });

  it('validates the submitted name before making a request', async () => {
    const result = await runAction('   ');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalid-name');
    expect(renameRequests()).toHaveLength(0);
  });
});
