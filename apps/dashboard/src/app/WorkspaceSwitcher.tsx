import { currencySymbol } from '@/lib/money';
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
import { usePlatformCurrency } from './platform-currency';
import { amountToNanos } from '@/lib/money';
import { Label } from '@/components/ui/label';
import { useSidebar } from '@/components/ui/sidebar';
import type { DashboardContext } from './dashboard-context';
import { workspaceDisplayName, workspaceSlugFromName } from './workspace-route';

export default function WorkspaceSwitcher({ context, onCreateWorkspace, creationAvailable = true }: {
  context: DashboardContext;
  onCreateWorkspace: () => void;
  creationAvailable?: boolean;
}) {
  const {
    token, session, organization, workspaces, workspace, workspaceLoading,
    workspaceError, selectWorkspace,
  } = context;
  const [menuOpen, setMenuOpen] = useState(false);
  const { isMobile, setOpenMobile } = useSidebar();
  const canCreate = creationAvailable && Boolean(session?.permissions.write && (
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
  const { organization, createWorkspace, session } = context;
  const canSetLimit = session?.kind === 'installation' || session?.operator?.role === 'owner';
  const [amount, setAmount] = useState('');
  const {currency,error:currencyError} = usePlatformCurrency();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setName('');
    setSlug('');
    setSlugEdited(false);
    setCreateError('');
  }, [open]);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    setCreateError('');
    try {
      if (amount.trim()) {
        if (!canSetLimit || !currency || currencyError) throw new Error('Billing currency is unavailable.');
        await createWorkspace(name.trim(), organization?.id, slug, {currency, limit_nanos: amountToNanos(amount, true)});
      } else {
        await createWorkspace(name.trim(), organization?.id, slug);
      }
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
        <div><DialogTitle>Create workspace</DialogTitle><DialogDescription>Organize API keys, usage, and spending limits.{organization ? ` In ${organization.name}.` : ' A personal organization will be created.'}</DialogDescription></div>
        <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
      </DialogHeader>
      <form onSubmit={submitCreate} className="niu-modal-form">
        <div className="grid gap-2"><Label htmlFor="workspace-name">Workspace name</Label><Input id="workspace-name" required maxLength={200} autoFocus disabled={saving} value={name} onChange={event => { setName(event.target.value); if (!slugEdited) setSlug(workspaceSlugFromName(event.target.value)); }} placeholder="e.g. Product experiments" /></div>
        <div className="grid gap-2"><Label htmlFor="workspace-slug">Slug</Label><Input id="workspace-slug" required maxLength={48} pattern="[a-z0-9]+(-[a-z0-9]+)*" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={saving} value={slug} onChange={event => {setSlugEdited(true);setSlug(event.target.value);}} placeholder="product-experiments" aria-describedby="workspace-slug-help"/><p id="workspace-slug-help" className="break-words text-sm text-muted-foreground">Used in /workspaces/{slug || '<slug>'}. Lowercase letters, numbers, and hyphens. Chinese names use pinyin.</p></div>
        {slug === 'default' && <p className="error-text" role="alert">The slug “default” is reserved. Choose a different slug.</p>}
        {canSetLimit && <section className="grid gap-3" aria-labelledby="workspace-budget-title">
          <div><h3 id="workspace-budget-title" className="text-sm font-medium">Budget <span className="font-normal text-muted-foreground">(optional)</span></h3><p id="workspace-budget-help" className="mt-2 text-sm text-muted-foreground">Cap customer spending across this workspace. Leave blank for no limit.</p></div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="grid gap-2"><Label htmlFor="workspace-limit">Spending limit{currency ? ` (${currencySymbol(currency)})` : ''}</Label><Input id="workspace-limit" inputMode="decimal" placeholder="0.00" disabled={saving || !currency || Boolean(currencyError)} value={amount} onChange={event => setAmount(event.target.value)} aria-describedby="workspace-budget-help" /></div>
            <div className="grid gap-2"><Label htmlFor="workspace-reset">Reset</Label><Input id="workspace-reset" value="Never (lifetime)" readOnly /></div>
          </div>
          {currencyError && <p className="text-sm text-muted-foreground">{currencyError}</p>}
          {!currency && !currencyError && <p className="text-sm text-muted-foreground" role="status">Loading platform currency…</p>}
        </section>}
        {createError && <p className="error-text" role="alert">{createError}</p>}
        <div className="workspace-create-actions"><Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving || !name.trim() || !slug || slug === 'default'}>{saving ? 'Creating…' : 'Create workspace'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
