import { useEffect, useState, type FormEvent } from 'react';
import { ChevronsUpDown, Plus, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSidebar } from '@/components/ui/sidebar';
import type { ConsoleContext } from './console-context';

export default function WorkspaceSwitcher({ context, onCreateWorkspace }: {
  context: ConsoleContext;
  onCreateWorkspace: () => void;
}) {
  const {
    token, session, organization, workspaces, workspace, workspaceLoading,
    workspaceError, selectWorkspace,
  } = context;
  const [menuOpen, setMenuOpen] = useState(false);
  const { isMobile, setOpenMobile } = useSidebar();
  const canCreate = Boolean(session?.permissions.write && (
    session.kind === 'installation' || session.operator?.project_id === null
  ));
  const entries = workspaces.filter(item => item.organization_id === organization?.id);

  function openCreate() {
    setMenuOpen(false);
    if (isMobile) {
      setOpenMobile(false);
      window.setTimeout(onCreateWorkspace, 320);
    } else {
      window.setTimeout(onCreateWorkspace, 160);
    }
  }

  const triggerTitle = workspace ? workspace.name : workspaceLoading ? 'Loading workspaces…' : 'Choose a workspace';
  return <div className="workspace-switcher">
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
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
  </div>;
}

export function WorkspaceCreateDialog({ context, open, onOpenChange }: {
  context: ConsoleContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { organization, createWorkspace } = context;
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setCreateError('');
  }, [open]);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    setCreateError('');
    try {
      await createWorkspace(name.trim(), organization?.id);
      onOpenChange(false);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'Could not create workspace.');
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open={open} onOpenChange={nextOpen => { if (!saving) onOpenChange(nextOpen); }}>
    <DialogContent className="niu-modal workspace-create-dialog" overlayClassName="workspace-create-overlay" showCloseButton={false}>
      <DialogHeader className="niu-modal-heading flex-row text-left">
        <div><DialogTitle>Create a workspace</DialogTitle><DialogDescription>Keep API keys, requests, and costs together.</DialogDescription></div>
        <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
      </DialogHeader>
      <form onSubmit={submitCreate} className="niu-modal-form">
        <Label htmlFor="workspace-name">Workspace name<Input id="workspace-name" required maxLength={200} autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Product experiments" /></Label>
        {organization && <p className="workspace-create-parent">In {organization.name}</p>}
        {!organization && context.session?.kind === 'installation' && <p className="workspace-create-parent">Niu will create a personal organization for this workspace.</p>}
        {createError && <p className="error-text" role="alert">{createError}</p>}
        <div className="workspace-create-actions"><Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create workspace'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
