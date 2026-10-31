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
import { useLocale } from './locale';
import type { DashboardContext } from './dashboard-context';
import { workspaceDisplayName, workspaceSlugFromName } from './workspace-route';

export default function WorkspaceSwitcher({ context, onCreateWorkspace, creationAvailable = true }: {
  context: DashboardContext;
  onCreateWorkspace: () => void;
  creationAvailable?: boolean;
}) {
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
  return <div className="workspace-switcher">
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild><Button variant="ghost" className="workspace-switcher-trigger" disabled={!token} aria-label="Switch workspace" title={t('Switch workspace', '切换工作空间')}>
        <span className="workspace-switcher-copy"><strong>{triggerTitle}</strong></span>
        <ChevronsUpDown size={16} aria-hidden="true" />
      </Button></DropdownMenuTrigger>
      <DropdownMenuContent className="workspace-switcher-menu" side="bottom" align="start" sideOffset={8} collisionPadding={12}>
        <DropdownMenuLabel className="workspace-switcher-menu-title">{t('Workspaces', '工作空间')}</DropdownMenuLabel>
        {workspaceLoading && <div className="workspace-switcher-empty">{t('Loading workspaces…', '正在加载工作空间…')}</div>}
        {!workspaceLoading && entries.length === 0 && <div className="workspace-switcher-empty">{t('No workspaces yet.', '暂无工作空间。')}</div>}
        {!workspaceLoading && <DropdownMenuRadioGroup value={workspace?.id ?? ''} onValueChange={id => {
          const next = entries.find(item => item.id === id);
          if (next) selectWorkspace(next);
        }}>
          {entries.map(item => <DropdownMenuRadioItem className="workspace-switcher-item" key={item.id} value={item.id}>
            <span>{workspaceDisplayName(item.name)}</span>
          </DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>}
        {workspaceError && <div className="workspace-switcher-error" role="alert">{t('Workspace access is unavailable. Close this menu and retry.', '工作空间访问暂不可用，请关闭菜单后重试。')}</div>}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild onSelect={() => { if (isMobile) setOpenMobile(false); }}>
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

export function WorkspaceCreateDialog({ context, open, onOpenChange }: {
  context: DashboardContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isZh, t } = useLocale();
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
      setCreateError(cause instanceof Error ? cause.message : t('Could not create workspace.', '无法创建工作空间。'));
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
        <div><DialogTitle>{t('Create workspace', '创建工作空间')}</DialogTitle><DialogDescription>{t('Organize API keys, usage, and spending limits.', '统一管理 API 密钥、用量与消费限额。')}{organization ? (isZh ? ` 归属组织：${organization.name}。` : ` In ${organization.name}.`) : t(' A personal organization will be created.', ' 将自动创建个人组织。')}</DialogDescription></div>
        <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
      </DialogHeader>
      <form onSubmit={submitCreate} className="niu-modal-form">
        <div className="grid gap-2"><Label htmlFor="workspace-name">{t('Workspace name', '工作空间名称')}</Label><Input id="workspace-name" required maxLength={200} autoFocus disabled={saving} value={name} onChange={event => { setName(event.target.value); if (!slugEdited) setSlug(workspaceSlugFromName(event.target.value)); }} placeholder={t('e.g. Product experiments', '例如：产品研发实验')} /></div>
        <div className="grid gap-2"><Label htmlFor="workspace-slug">{t('Slug', '路径标识 (Slug)')}</Label><Input id="workspace-slug" required maxLength={48} pattern="[a-z0-9]+(-[a-z0-9]+)*" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={saving} value={slug} onChange={event => {setSlugEdited(true);setSlug(event.target.value);}} placeholder="product-experiments" aria-describedby="workspace-slug-help"/><p id="workspace-slug-help" className="break-words text-sm text-muted-foreground">{t(`Used in /workspaces/${slug || '<slug>'}. Lowercase letters, numbers, and hyphens. Chinese names use pinyin.`, `用于 /workspaces/${slug || '<slug>'}。仅限小写字母、数字和连字符，中文名称自动转为拼音。`)}</p></div>
        {slug === 'default' && <p className="error-text" role="alert">{t('The slug “default” is reserved. Choose a different slug.', '“default” 为系统保留标识，请使用其他名称。')}</p>}
        {canSetLimit && <section className="grid gap-3" aria-labelledby="workspace-budget-title">
          <div><h3 id="workspace-budget-title" className="text-sm font-medium">{t('Budget', '预算')} <span className="font-normal text-muted-foreground">{t('(optional)', '（可选）')}</span></h3><p id="workspace-budget-help" className="mt-2 text-sm text-muted-foreground">{t('Cap customer spending across this workspace. Leave blank for no limit.', '限制此工作空间的客户总消费额度，留空则不设上限。')}</p></div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="grid gap-2"><Label htmlFor="workspace-limit">{t('Spending limit', '消费限额')}{currency ? ` (${currencySymbol(currency)})` : ''}</Label><Input id="workspace-limit" inputMode="decimal" placeholder="0.00" disabled={saving || !currency || Boolean(currencyError)} value={amount} onChange={event => setAmount(event.target.value)} aria-describedby="workspace-budget-help" /></div>
            <div className="grid gap-2"><Label htmlFor="workspace-reset">{t('Reset', '重置周期')}</Label><Input id="workspace-reset" value={t('Never (lifetime)', '从不（终身有效）')} readOnly /></div>
          </div>
          {currencyError && <p className="text-sm text-muted-foreground">{currencyError}</p>}
          {!currency && !currencyError && <p className="text-sm text-muted-foreground" role="status">{t('Loading platform currency…', '正在加载平台币种…')}</p>}
        </section>}
        {createError && <p className="error-text" role="alert">{createError}</p>}
        <div className="workspace-create-actions"><Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>{t('Cancel', '取消')}</Button><Button type="submit" disabled={saving || !name.trim() || !slug || slug === 'default'}>{saving ? t('Creating…', '创建中…') : t('Create workspace', '创建工作空间')}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
