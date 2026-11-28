import { useLocale as useUILocale } from '@/shell/ui-locale';
import { currencySymbol } from '@/lib/money';
import { createPath, Link } from 'react-router';
import { IconArrowLeft, IconFolder, IconList } from '@tabler/icons-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconSelector as ChevronsUpDown } from "@tabler/icons-react";
import { IconPlus as Plus } from "@tabler/icons-react";
import { IconX as X } from "@tabler/icons-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePlatformCurrency } from './platform-currency';
import { amountToNanos } from '@/lib/money';
import { Label } from '@/components/ui/label';
import { useSidebar } from '@/components/ui/sidebar';
import { useLocale } from './ui-locale';
import type { DashboardContext } from './dashboard-context';
import { organizationDisplayName, workspaceDisplayName, workspaceSlugFromName } from './workspace-route';

export default function WorkspaceSwitcher({ context, onCreateWorkspace, creationAvailable = true, logo }: {
  context: DashboardContext;
  onCreateWorkspace: () => void;
  creationAvailable?: boolean;
  logo?: string;
}) {
  const { t: uiT } = useUILocale();
  const { t } = useLocale();
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

  const triggerTitle = workspace ? workspaceDisplayName(workspace.name) : workspaceLoading ? t('Loading workspaces…', '正在加载工作空间…') : t('Choose a workspace', '选择工作空间');
  const duplicateNames = new Set(
    entries
      .map(item => workspaceDisplayName(item.name))
      .filter((itemName, index, list) => list.indexOf(itemName) !== index),
  );
  return <div className="workspace-switcher">
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild><Button variant="ghost" className="workspace-switcher-trigger" disabled={!token} aria-label={uiT("Switch workspace")} title={workspace ? `${triggerTitle} (${t('Switch workspace', '切换工作空间')})` : t('Switch workspace', '切换工作空间')}>
        {logo ? <img src={logo} alt="" className="size-5 shrink-0" /> : <IconFolder size={18} aria-hidden="true" />}<span className="workspace-switcher-copy"><strong>{triggerTitle}</strong></span>
        <ChevronsUpDown size={16} aria-hidden="true" />
      </Button></DropdownMenuTrigger>
      <DropdownMenuContent className="workspace-switcher-menu" side="bottom" align="start" sideOffset={8} collisionPadding={12}>
        <DropdownMenuLabel className="workspace-switcher-menu-title">
          {organization && (context.organizations.length > 1 || (organization.account_kind !== 'personal' && organization.name.trim() !== 'Personal workspace'))
            ? `${t('Workspaces', '工作空间')} · ${organizationDisplayName(organization.name, organization.account_kind)}`
            : t('Workspaces', '工作空间')}
        </DropdownMenuLabel>
        {workspaceLoading && <div className="workspace-switcher-empty">{t('Loading workspaces…', '正在加载工作空间…')}</div>}
        {!workspaceLoading && entries.length === 0 && <div className="workspace-switcher-empty">{t('No workspaces yet.', '暂无工作空间。')}</div>}
        {!workspaceLoading && <DropdownMenuRadioGroup value={workspace?.id ?? ''} onValueChange={id => {
          const next = entries.find(item => item.id === id);
          if (next) {
            selectWorkspace(next);
            if (isMobile) window.requestAnimationFrame(() => setOpenMobile(false));
          }
        }}>
          {entries.map(item => {
            const displayName = workspaceDisplayName(item.name);
            const slugHint = duplicateNames.has(displayName) && (item.slug || item.route_slug) ? ` · ${item.slug || item.route_slug}` : '';
            return <DropdownMenuRadioItem className="workspace-switcher-item" key={item.id} value={item.id}>
              <span>{displayName}{slugHint}</span>
            </DropdownMenuRadioItem>;
          })}
        </DropdownMenuRadioGroup>}
        {workspaceError && <div className="workspace-switcher-error" role="alert">{t('Workspace access is unavailable. Close this menu and retry.', '工作空间访问暂不可用，请关闭菜单后重试。')}</div>}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild onSelect={() => { if (isMobile) window.requestAnimationFrame(() => setOpenMobile(false)); }}>
          <Link to="/workspaces"><IconList size={16} aria-hidden="true" />{t('All workspaces', '所有工作空间')}</Link>
        </DropdownMenuItem>
        {canCreate && !workspaceLoading && !workspaceError && <>
          <DropdownMenuItem className="workspace-switcher-create" onSelect={openCreate}>
            <Plus size={16} aria-hidden="true" />{t('Create workspace', '创建工作空间')}
          </DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}

export function WorkspaceCreateDialog({ context, open, onOpenChange, withinSettings = false }: {
  context: DashboardContext;
  open: boolean;
  withinSettings?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t: uiT } = useUILocale();
  const { t } = useLocale();
  const { organization, organizations, createWorkspace, session } = context;
  const canSetLimit = session?.kind === 'installation' || session?.operator?.role === 'owner';
  const [amount, setAmount] = useState('');
  const [showAmountError, setShowAmountError] = useState(false);
  const amountInput = useRef<HTMLInputElement>(null);
  let limitNanos: string | undefined;
  let amountError = '';
  if (amount.trim()) {
    try {
      limitNanos = amountToNanos(amount, true);
    } catch (cause) {
      amountError = cause instanceof Error ? uiT(cause.message) : t('Invalid amount.', '金额无效。');
    }
  }
  const {currency,error:currencyError} = usePlatformCurrency();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugOpen, setSlugOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const openerRef = useRef<HTMLElement | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!withinSettings || !open) return;
    const frame = requestAnimationFrame(() => nameInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, withinSettings]);

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setShowAmountError(false);
    setName('');
    setSlug('');
    setSlugEdited(false);
    setSlugOpen(false);
    setCreateError('');
  }, [open]);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !name.trim()) return;
    if (amountError) {
      setShowAmountError(true);
      amountInput.current?.focus();
      return;
    }
    setSaving(true);
    setCreateError('');
    try {
      if (limitNanos !== undefined) {
        if (!canSetLimit || !currency || currencyError) throw new Error('Billing currency is unavailable.');
        await createWorkspace(name.trim(), organization?.id, slug, {currency, limit_nanos: limitNanos});
      } else {
        await createWorkspace(name.trim(), organization?.id, slug);
      }
      onOpenChange(false);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : t('Could not create workspace.', '无法创建工作空间。'));
    } finally {
      setSaving(false);
    }
  }

  const owner = organization ?? organizations.find(item => item.id === session?.operator?.organization_id);
  const description = owner
    ? `${t('Organization', '组织')} · ${organizationDisplayName(owner.name)}`
    : session?.kind === 'installation'
      ? t('A personal organization will be created.', '将自动创建个人组织。')
      : t('Current organization', '当前组织');
  const form = <form onSubmit={submitCreate} className="niu-modal-form">
        <div className="grid gap-2"><Label htmlFor="workspace-name">{t('Workspace name', '工作空间名称')}</Label><Input ref={nameInput} id="workspace-name" required maxLength={200} autoFocus disabled={saving} value={name} onChange={event => { setName(event.target.value); if (!slugEdited) setSlug(workspaceSlugFromName(event.target.value)); }} placeholder={t('e.g. Product experiments', '例如：产品研发实验')} /></div>
        {slugOpen ? <div className="grid gap-2">
          <Label htmlFor="workspace-slug">{t('Address identifier', '地址标识')}</Label>
          <Input id="workspace-slug" required maxLength={48} pattern="[a-z0-9]+(-[a-z0-9]+)*" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus disabled={saving} value={slug} onChange={event => { setSlugEdited(true); setSlug(event.target.value); }} aria-describedby="workspace-slug-help" />
          <p id="workspace-slug-help" className="text-sm text-muted-foreground">{t('Use lowercase letters, numbers, and hyphens.', '使用小写字母、数字和连字符。')}</p>
        </div> : <div className="flex flex-wrap items-center gap-2">
          {slug && <span className="min-w-0 break-all text-sm text-muted-foreground">{createPath({ pathname: `/workspaces/${slug}` })}</span>}
          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setSlugOpen(true)}>{t('Edit address', '编辑地址')}</Button>
        </div>}
        {slug === 'default' && <p className="error-text" role="alert">{t('The slug “default” is reserved. Choose a different slug.', '“default” 为系统保留标识，请使用其他名称。')}</p>}
        {canSetLimit && <div className="grid gap-2">
          <Label htmlFor="workspace-limit">{t('Spending limit', '消费限额')}{currency ? ` (${currencySymbol(currency)})` : ''}</Label>
          <Input ref={amountInput} id="workspace-limit" inputMode="decimal" placeholder={t('No limit', '不限额')} disabled={saving || !currency || Boolean(currencyError)} value={amount} onChange={event => setAmount(event.target.value)} aria-invalid={showAmountError && Boolean(amountError)} aria-describedby={showAmountError && amountError ? 'workspace-limit-error' : limitNanos !== undefined ? 'workspace-budget-help' : undefined} />
          {showAmountError && amountError && <p id="workspace-limit-error" className="error-text" role="alert">{amountError}</p>}
          {limitNanos !== undefined && <p id="workspace-budget-help" className="text-sm text-muted-foreground">
            {limitNanos === '0' && t('Zero blocks paid requests. ', '零限额将阻止付费请求。')}
            {t('Setting a limit prevents workspace deletion.', '设置限额后将无法删除此工作空间。')}
          </p>}
          {currencyError && <p className="text-sm text-muted-foreground">{uiT(currencyError)}</p>}
          {!currency && !currencyError && <p className="text-sm text-muted-foreground" role="status">{t('Loading platform currency…', '正在加载平台币种…')}</p>}
        </div>}
        {createError && <p className="error-text" role="alert">{uiT(createError)}</p>}
        <DialogFooter className="workspace-create-actions"><Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>{t('Cancel', '取消')}</Button><Button type="submit" disabled={saving || !name.trim() || !slug || slug === 'default'}>{saving ? t('Creating…', '创建中…') : t('Create workspace', '创建工作空间')}</Button></DialogFooter>
      </form>;
  if (withinSettings) return open ? <section className="space-y-5" aria-labelledby="workspace-create-title">
    <Button type="button" variant="ghost" size="sm" data-settings-back disabled={saving} onClick={() => onOpenChange(false)}><IconArrowLeft size={16} />{t('Back to organization', '返回组织设置')}</Button>
    <header className="space-y-2"><h3 id="workspace-create-title" className="text-base font-semibold">{t('Create workspace', '创建工作空间')}</h3><p className="text-sm text-muted-foreground">{description}</p></header>
    {form}
  </section> : null;

  return <Dialog open={open} onOpenChange={nextOpen => { if (!saving) onOpenChange(nextOpen); }}>
    <DialogContent onOpenAutoFocus={() => { openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onCloseAutoFocus={event => {
      const opener = openerRef.current;
      const closingDialog = event.target instanceof HTMLElement ? event.target : null;
      const target = opener?.isConnected && opener.getClientRects().length && !closingDialog?.contains(opener) ? opener : ['[aria-label="Create workspace"]', '.workspace-switcher-trigger', '.sidebar-toggle'].flatMap(selector => Array.from(document.querySelectorAll<HTMLElement>(selector))).find(element => element.isConnected && element.getClientRects().length && !element.closest('[role="dialog"]'));
      if (target) { event.preventDefault(); target.focus(); }
    }} className="niu-modal workspace-create-dialog" overlayClassName="workspace-create-overlay" showCloseButton={false}>
      <DialogHeader className="niu-modal-heading flex-row text-left">
        <div><DialogTitle>{t('Create workspace', '创建工作空间')}</DialogTitle><DialogDescription>{description}</DialogDescription></div>
        <DialogClose className="niu-modal-close" aria-label={uiT("Close dialog")}><X size={18} /></DialogClose>
      </DialogHeader>
      {form}
    </DialogContent>
  </Dialog>;
}

export function OrganizationCreateDialog({ context, open, onOpenChange, withinSettings = false }: {
  context: DashboardContext;
  open: boolean;
  withinSettings?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t: uiT } = useUILocale();
  const { isZh, t } = useLocale();
  const { createOrganization } = context;
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [initialWorkspace, setInitialWorkspace] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const idempotencyKeyRef = useRef('');
  const openerRef = useRef<HTMLElement | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!withinSettings || !open) return;
    const frame = requestAnimationFrame(() => nameInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, withinSettings]);

  useEffect(() => {
    if (!open) return;
    setName('');
    setSlug('');
    setSlugEdited(false);
    setEditingAddress(false);
    setInitialWorkspace(isZh ? '默认' : 'Default');
    setCreateError('');
    idempotencyKeyRef.current = crypto.randomUUID();
  }, [open, isZh]);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !name.trim() || !createOrganization) return;
    setSaving(true);
    setCreateError('');
    try {
      if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
      await createOrganization(
        name.trim(),
        slug.trim() || undefined,
        initialWorkspace.trim() || undefined,
        idempotencyKeyRef.current,
      );
      onOpenChange(false);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : t('Could not create organization.', '无法创建组织。'));
    } finally {
      setSaving(false);
    }
  }

  const organizationAddress = createPath({ pathname: '/settings/organization', search: new URLSearchParams({ organization: slug }).toString() });
  const form = <form onSubmit={submitCreate} className="niu-modal-form">
        <div className="grid gap-2">
          <Label htmlFor="organization-name">{t('Organization name', '组织名称')}</Label>
          <Input
            ref={nameInput}
            id="organization-name"
            required
            maxLength={200}
            autoFocus
            disabled={saving}
            value={name}
            onChange={event => {
              const nextName = event.target.value;
              setName(nextName);
              idempotencyKeyRef.current = crypto.randomUUID();
              if (!slugEdited) setSlug(workspaceSlugFromName(nextName));
            }}
            placeholder={t('e.g. Acme Studio', '例如：星云工作室')}
          />
        </div>
        {editingAddress ? <div className="grid gap-2">
          <Label htmlFor="organization-slug">{t('Address identifier', '地址标识')}</Label>
          <Input id="organization-slug" required autoFocus maxLength={48} pattern="[a-z0-9]+(-[a-z0-9]+)*"
            autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={saving} value={slug}
            aria-describedby="organization-slug-help"
            onChange={event => {
              setSlugEdited(true);
              setSlug(event.target.value);
              idempotencyKeyRef.current = crypto.randomUUID();
            }}
          />
          <p id="organization-slug-help" className="text-sm text-muted-foreground">
            {slug === 'default' ? t('“default” is reserved. Choose another identifier.', '“default” 为保留标识，请更换。') : t('Use lowercase letters, numbers, and hyphens.', '使用小写字母、数字和连字符。')}
          </p>
        </div> : <div className="flex flex-wrap items-center gap-2">
          {slug && <span className="min-w-0 break-all text-sm text-muted-foreground">{organizationAddress}</span>}
          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setEditingAddress(true)}>{t('Edit address', '编辑地址')}</Button>
        </div>}
        {createError && <p className="error-text" role="alert">{uiT(createError)}</p>}
        <DialogFooter className="workspace-create-actions">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>{t('Cancel', '取消')}</Button>
          <Button type="submit" disabled={saving || !name.trim() || !slug || slug === 'default'}>{saving ? t('Creating…', '创建中…') : t('Create organization', '创建组织')}</Button>
        </DialogFooter>
      </form>;
  if (withinSettings) return open ? <section className="space-y-5" aria-labelledby="organization-create-title">
    <Button type="button" variant="ghost" size="sm" data-settings-back disabled={saving} onClick={() => onOpenChange(false)}><IconArrowLeft size={16} />{t('Back to organization', '返回组织设置')}</Button>
    <h3 id="organization-create-title" className="text-base font-semibold">{t('Create organization', '创建组织')}</h3>
    {form}
  </section> : null;

  return <Dialog open={open} onOpenChange={nextOpen => { if (!saving) onOpenChange(nextOpen); }}>
    <DialogContent onOpenAutoFocus={() => { openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onCloseAutoFocus={event => {
      const opener = openerRef.current;
      const closingDialog = event.target instanceof HTMLElement ? event.target : null;
      const target = opener?.isConnected && opener.getClientRects().length && !closingDialog?.contains(opener)
        ? opener
        : ['[aria-label="Account menu"]', '[aria-label="Open navigation menu"]', '.sidebar-toggle']
            .flatMap(selector => Array.from(document.querySelectorAll<HTMLElement>(selector)))
            .find(element => element.isConnected && element.getClientRects().length && !element.closest('[role="dialog"]'));
      if (target) { event.preventDefault(); target.focus(); }
    }} aria-describedby={undefined} className="niu-modal workspace-create-dialog" overlayClassName="workspace-create-overlay" showCloseButton={false}>
      <DialogHeader className="niu-modal-heading flex-row text-left">
        <DialogTitle>{t('Create organization', '创建组织')}</DialogTitle>
        <DialogClose className="niu-modal-close" aria-label={uiT("Close dialog")}><X size={18} /></DialogClose>
      </DialogHeader>
      {form}
    </DialogContent>
  </Dialog>;
}
