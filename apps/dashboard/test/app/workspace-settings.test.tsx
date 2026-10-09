import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { DashboardContext } from '../../src/app/dashboard-context';
import WorkspaceSettings from '../../src/features/workspace/settings-page';
let context: DashboardContext;
vi.mock('../../src/app/dashboard-context', () => ({useDashboardContext: () => context}));
const renameWorkspace = vi.fn();
const deleteWorkspace = vi.fn();
const workspace = {id:'workspace-fixture',name:'Example workspace',organization_id:'organization-fixture',organization_name:'Company'};
beforeEach(() => {
  renameWorkspace.mockReset();
  deleteWorkspace.mockReset();
  context = {token:'fixture',workspace,workspaces:[workspace,{...workspace,id:'remaining',name:'Remaining workspace'}],session:{kind:'operator',operator:{project_id:null},permissions:{write:true,manage_operators:true}},renameWorkspace,deleteWorkspace,refreshWorkspace:vi.fn().mockRejectedValue(new Error("List reload unavailable"))} as unknown as DashboardContext;
});
function view() { return <MemoryRouter initialEntries={['/workspaces/example/settings']}><Routes><Route path="/workspaces/:workspace/settings" element={<WorkspaceSettings/>}/><Route path="/workspaces/:workspace" element={<p>Workspace overview</p>}/></Routes></MemoryRouter>; }
describe('workspace settings', () => {
  it('discards deletion confirmation when its workspace changes', async () => {
    const rendered=render(view());const user=userEvent.setup();
    await user.click(screen.getByRole('button',{name:'Delete workspace',exact:true}));
    await user.type(screen.getByLabelText('Type the workspace name to confirm'),'Example workspace');
    context={...context,workspace:context.workspaces[1]};rendered.rerender(view());
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    expect(deleteWorkspace).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button',{name:'Delete workspace',exact:true}));
    expect((screen.getByLabelText('Type the workspace name to confirm') as HTMLInputElement).value).toBe('');
    expect(within(screen.getByRole('dialog')).getByRole('button',{name:'Delete workspace',exact:true}).hasAttribute('disabled')).toBe(true);
  });
  it('ignores an earlier workspace save failure after switching workspaces', async () => {
    let rejectSave!: (error:Error)=>void;
    renameWorkspace.mockImplementation(()=>new Promise((_resolve,reject)=>{rejectSave=reject;}));
    const rendered=render(view());const user=userEvent.setup();
    await user.clear(screen.getByLabelText('Workspace name'));await user.type(screen.getByLabelText('Workspace name'),'Changed name');
    await user.click(screen.getByRole('button',{name:'Save changes'}));
    context={...context,workspace:context.workspaces[1]};rendered.rerender(view());
    expect((screen.getByLabelText('Workspace name') as HTMLInputElement).value).toBe('Remaining workspace');
    await act(async()=>rejectSave(new Error('Previous workspace failed')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Saving…')).toBeNull();
    expect(screen.queryByText('Workspace renamed.')).toBeNull();
  });
  it('prevents deletion of the persisted default regardless of its display name', () => {
    context.workspace={...workspace,name:'Renamed default',is_default:true};render(view());
    expect(screen.getByText('The default workspace cannot be deleted.')).toBeTruthy();
    expect((screen.getByRole('button',{name:'Delete workspace'}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deleteWorkspace).not.toHaveBeenCalled();
  });
  it('confirms the rename without depending on another list request', async () => {
    renameWorkspace.mockResolvedValue({...workspace,name:"New name"}); render(view()); const user=userEvent.setup();
    await user.clear(screen.getByLabelText('Workspace name')); await user.type(screen.getByLabelText('Workspace name'),'New name');
    await user.click(screen.getByRole('button',{name:'Save changes'}));
    expect(await screen.findByText('Workspace renamed.')).toBeTruthy();
    expect(renameWorkspace).toHaveBeenCalledWith(workspace,'New name');
    expect(context.refreshWorkspace).not.toHaveBeenCalled();
  });
  it('requires confirmation, preserves backend errors, and closes after confirmed deletion', async () => {
    deleteWorkspace.mockRejectedValueOnce(new Error('Workspace has saved records')).mockResolvedValueOnce(undefined);
    render(view()); const user=userEvent.setup();
    await user.click(screen.getByRole('button',{name:'Delete workspace'}));
    const dialog=screen.getByRole('dialog');
    expect(dialog.querySelector('button[data-slot="button"][disabled]')).toBeTruthy();
    await user.type(screen.getByLabelText('Type the workspace name to confirm'),'Example workspace');
    await user.click(screen.getAllByRole('button',{name:'Delete workspace'}).at(-1)!);
    expect((await screen.findByRole('alert')).textContent).toContain('Workspace has saved records');
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.click(screen.getAllByRole('button',{name:'Delete workspace'}).at(-1)!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deleteWorkspace).toHaveBeenCalledWith(workspace);
    expect(context.refreshWorkspace).not.toHaveBeenCalled();
  });
  it('does not expose deletion to workspace-scoped administrators', () => {
    context.session!.operator!.project_id=workspace.id; render(view());
    expect(screen.queryByRole('button',{name:'Delete workspace'})).toBeNull();
  });
  it('clears a failed deletion when canceled and returns focus to its trigger', async () => {
    deleteWorkspace.mockRejectedValue(new Error('Workspace has saved records'));
    render(view()); const user=userEvent.setup();
    const trigger=screen.getByRole('button',{name:'Delete workspace',exact:true});
    await user.click(trigger);
    await user.type(screen.getByLabelText('Type the workspace name to confirm'),'Example workspace');
    await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Delete workspace',exact:true}));
    expect((await screen.findByRole('alert')).textContent).toContain('Workspace has saved records');
    await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Cancel',exact:true}));
    await waitFor(()=>expect(document.activeElement).toBe(trigger));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deleteWorkspace).toHaveBeenCalledTimes(1);
    await user.click(trigger);
    expect((screen.getByLabelText('Type the workspace name to confirm') as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
