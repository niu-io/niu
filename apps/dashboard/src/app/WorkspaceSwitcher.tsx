import { Link } from 'react-router';
import { IconList } from '@tabler/icons-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconSelector as ChevronsUpDown } from "@tabler/icons-react";
import { IconPlus as Plus } from "@tabler/icons-react";
import { IconX as X } from "@tabler/icons-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSidebar } from '@/components/ui/sidebar';
import type { DashboardContext } from './dashboard-context';
import { workspaceDisplayName } from './workspace-route';

export default function WorkspaceSwitcher({ context, onCreateWorkspace }: {
  context: DashboardContext;
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

  const triggerTitle = workspace ? workspaceDisplayName(workspace.name) : workspaceLoading ? 'Loading workspaces…' : 'Choose a workspace';
  return <div className="workspace-switcher">
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild><Button variant="ghost" className="workspace-switcher-trigger" disabled={!token} aria-label="Switch workspace" title="Switch workspace">
        <span className="workspace-switcher-copy"><strong>{triggerTitle}</strong></span>
        <ChevronsUpDown size={16} aria-hidden="true" />
      </Button></DropdownMenuTrigger>
      <DropdownMenuContent className="workspace-switcher-menu" side="bottom" align="start" sideOffset={8} collisionPadding={12}>
        <DropdownMenuLabel className="workspace-switcher-menu-title">Workspaces</DropdownMenuLabel>
        {workspaceLoading && <div className="workspace-switcher-empty">Loading workspaces…</div>}
        {!workspaceLoading && entries.length === 0 && <div className="workspace-switcher-empty">No workspaces yet.</div>}
        {!workspaceLoading && <DropdownMenuRadioGroup value={workspace?.id ?? ''} onValueChange={id => {
          const next = entries.find(item => item.id === id);
          if (next) selectWorkspace(next);
        }}>
          {entries.map(item => <DropdownMenuRadioItem className="workspace-switcher-item" key={item.id} value={item.id}>
            <span>{workspaceDisplayName(item.name)}</span>
          </DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>}
        {workspaceError && <div className="workspace-switcher-error" role="alert">Workspace access is unavailable. Close this menu and retry.</div>}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild onSelect={() => { if (isMobile) setOpenMobile(false); }}>
          <Link to="/workspaces"><IconList size={16} aria-hidden="true" />All workspaces</Link>
        </DropdownMenuItem>
        {canCreate && !workspaceLoading && !workspaceError && <>
          <DropdownMenuItem className="workspace-switcher-create" onSelect={openCreate}>
            <Plus size={16} aria-hidden="true" />Create workspace
          </DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}

export function WorkspaceCreateDialog({ context, open, onOpenChange }: {
  context: DashboardContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { organization, createWorkspace } = context;
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const openerRef = useRef<HTMLElement | null>(null);

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
    <DialogContent onOpenAutoFocus={() => { openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onCloseAutoFocus={event => {
      const opener = openerRef.current;
      const target = opener?.isConnected && opener.getClientRects().length && !opener.closest('[role="dialog"]') ? opener : ['[aria-label="Create workspace"]', '.sidebar-toggle'].flatMap(selector => Array.from(document.querySelectorAll<HTMLElement>(selector))).find(element => element.isConnected && element.getClientRects().length && !element.closest('[role="dialog"]'));
      if (target) { event.preventDefault(); target.focus(); }
    }} className="niu-modal workspace-create-dialog" overlayClassName="workspace-create-overlay" showCloseButton={false}>
      <DialogHeader className="niu-modal-heading flex-row text-left">
        <div><DialogTitle>Create a workspace</DialogTitle><DialogDescription>{organization ? `In ${organization.name}` : 'A personal organization will be created for this workspace.'}</DialogDescription></div>
        <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
      </DialogHeader>
      <form onSubmit={submitCreate} className="niu-modal-form">
        <div className="grid gap-2"><Label htmlFor="workspace-name">Workspace name</Label><Input id="workspace-name" required maxLength={200} autoFocus disabled={saving} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Product experiments" /></div>
        {createError && <p className="error-text" role="alert">{createError}</p>}
        <div className="workspace-create-actions"><Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create workspace'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
