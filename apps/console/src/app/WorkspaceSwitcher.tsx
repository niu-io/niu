import { useState, type FormEvent } from 'react';
import { ChevronsUpDown, Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import ModalFrame from '@/components/ModalFrame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ConsoleContext } from './console-context';

export default function WorkspaceSwitcher({ context }: { context: ConsoleContext }) {
  const {
    token, session, organization, workspaces, workspace, workspaceLoading,
    workspaceError, selectWorkspace, createWorkspace,
  } = context;
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const canCreate = Boolean(session?.permissions.write && (
    session.kind === 'installation' || session.operator?.project_id === null
  ));
  const entries = workspaces.filter(item => item.organization_id === organization?.id);

  function openCreate() {
    setName('');
    setCreateError('');
    setOrganizationId(organization?.id ?? '');
    setCreateOpen(true);
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    setCreateError('');
    try {
      await createWorkspace(name.trim(), organizationId || undefined);
      setCreateOpen(false);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'Could not create workspace.');
    } finally {
      setSaving(false);
    }
  }

  const triggerTitle = workspace ? workspace.name : workspaceLoading ? 'Loading workspaces…' : 'Choose a workspace';
  return <div className="workspace-switcher">
    <DropdownMenu>
      <DropdownMenuTrigger className="workspace-switcher-trigger" disabled={!token} aria-label="Switch workspace" title="Switch workspace">
        <span className="workspace-switcher-copy"><strong>{triggerTitle}</strong></span>
        <ChevronsUpDown size={16} aria-hidden="true" />
      </DropdownMenuTrigger>
        <DropdownMenuContent className="workspace-switcher-menu" side="bottom" align="start" sideOffset={8} collisionPadding={12}>
          <DropdownMenuLabel className="workspace-switcher-menu-title">Workspaces</DropdownMenuLabel>
          {workspaceLoading && <div className="workspace-switcher-empty">Loading workspaces…</div>}
          {!workspaceLoading && entries.length === 0 && <div className="workspace-switcher-empty">No workspaces yet.</div>}
          {!workspaceLoading && <DropdownMenuRadioGroup value={workspace?.id ?? ''} onValueChange={id => {
            const next = entries.find(item => item.id === id);
            if (next) selectWorkspace(next);
          }}>
            {entries.map(item => <DropdownMenuRadioItem className="workspace-switcher-item" key={item.id} value={item.id}>
              <span>{item.name}</span>
            </DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>}
          {workspaceError && <div className="workspace-switcher-error" role="alert">Workspace access is unavailable. Close this menu and retry.</div>}
          {canCreate && !workspaceLoading && !workspaceError && <>
            <DropdownMenuSeparator className="workspace-switcher-separator" />
            <DropdownMenuItem className="workspace-switcher-create" onSelect={openCreate}>
              <Plus size={16} aria-hidden="true" />Create workspace
            </DropdownMenuItem>
          </>}
        </DropdownMenuContent>
    </DropdownMenu>

    <ModalFrame open={createOpen} onOpenChange={open => { if (!saving) setCreateOpen(open); }} title="Create a workspace" description="Keep API keys, requests, and costs together." className="workspace-create-dialog">
          <form onSubmit={submitCreate} className="niu-modal-form">
            <Label htmlFor="workspace-name">Workspace name<Input id="workspace-name" required maxLength={200} autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Product experiments" /></Label>
            {organization && <p className="workspace-create-parent">In {organization.name}</p>}
            {!organization && session?.kind === 'installation' && <p className="workspace-create-parent">Niu will create a personal organization for this workspace.</p>}
            {createError && <p className="error-text" role="alert">{createError}</p>}
            <div className="workspace-create-actions"><Button type="button" variant="outline" disabled={saving} onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create workspace'}</Button></div>
          </form>
    </ModalFrame>
  </div>;
}
