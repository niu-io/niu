import { useContext, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation, useNavigate, useMatch } from 'react-router';
import { IconChevronDown } from '@tabler/icons-react';
import { SettingsOriginContext } from '@/shell/settings-background';
import type { DashboardContext } from '@/shell/dashboard-context';
import { useLocale } from '@/shell/ui-locale';
import { workspacePathSegment } from '@/shell/workspace-route';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SidebarProvider, Sidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { SettingsNavigation, settingsNavigationEntries } from './settings-navigation';
import { canonicalSettingsSection, settingsHref } from './settings-routes';

export default function SettingsDialog({context, children, pendingSection}: {context:DashboardContext;children:ReactNode;pendingSection?:string}) {
  const origin = useContext(SettingsOriginContext);
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLocale();
  const match = useMatch('/settings/:section?');
  const section = pendingSection ?? match?.params.section;
  const [open, setOpen] = useState(true);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const sectionTrigger = useRef<HTMLButtonElement>(null);
  const originalReturn = useRef(typeof location.state?.settingsReturnTo === 'string' && /^\/(?!\/|settings(?:[/?#]|$))/.test(location.state.settingsReturnTo) ? location.state.settingsReturnTo : null);
  const canonical = canonicalSettingsSection(section, context.session);
  const entries = settingsNavigationEntries(context, t);
  const selected = entries.find(item => item.path === canonical);
  const close = () => {
    setOpen(false);
    const target = originalReturn.current ?? origin?.path ?? (context.workspace ? `/workspaces/${encodeURIComponent(workspacePathSegment(context.workspace, context.workspaces))}` : '/workspaces');
    if (origin?.canGoBack() && target === origin.path) navigate(-1);
    else navigate(target, {replace: true});
  };
  return <Dialog open={open} onOpenChange={value => { if (!value) close(); }}>
    <DialogContent onKeyDownCapture={event => {if(event.key.toLowerCase() === 'b' && (event.metaKey || event.ctrlKey)){event.preventDefault();event.stopPropagation();}}} data-global-settings-dialog className="flex h-[min(760px,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl" onOpenAutoFocus={event => {
      event.preventDefault();
      const selectedLink = document.querySelector<HTMLElement>('[data-global-settings-dialog] a[aria-current="page"]');
      (selectedLink?.getClientRects().length ? selectedLink : document.querySelector<HTMLElement>('[data-global-settings-dialog] [data-settings-section-trigger]'))?.focus();
    }} onCloseAutoFocus={event => {
      event.preventDefault();
      requestAnimationFrame(() => {
        const account = document.querySelector<HTMLElement>('[data-account-menu-trigger]');
        const target = account?.getClientRects().length && !account.closest('[data-mobile="true"]') ? account : document.querySelector<HTMLElement>('button.sidebar-toggle, button[data-sidebar="trigger"]') ?? document.getElementById('dashboard-content');
        target?.focus({preventScroll:true});
      });
    }}>
      <DialogHeader className="px-5 py-4 text-left"><DialogTitle>{t('Settings', '设置')}</DialogTitle><DialogDescription className="sr-only">{t('Manage your account, preferences and organization.', '管理账户、偏好与组织设置。')}</DialogDescription></DialogHeader>
      <div className="px-4 pb-3 sm:hidden"><DropdownMenu open={navigationOpen} onOpenChange={setNavigationOpen}><DropdownMenuTrigger asChild><Button ref={sectionTrigger} variant="outline" className="w-full justify-between" data-settings-section-trigger aria-label={t('Settings section', '设置分类')}>{selected?.label}<IconChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent className="w-64" align="start" onCloseAutoFocus={event => {event.preventDefault();sectionTrigger.current?.focus();}}><DropdownMenuRadioGroup value={canonical} onValueChange={value => { setNavigationOpen(false); navigate(settingsHref(value as Parameters<typeof settingsHref>[0]), {state:location.state,replace:true}); }}>{entries.map(item => <DropdownMenuRadioItem key={item.path} value={item.path}><item.icon />{item.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
      <SidebarProvider className="min-h-0 flex-1 overflow-hidden" style={{'--sidebar-width':'12rem'} as CSSProperties}>
        <Sidebar collapsible="none" className="hidden bg-muted/40 sm:flex"><SettingsNavigation context={context} section={canonical} /></Sidebar>
        <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6"><h2 className="mb-5 text-lg font-semibold">{selected?.label}</h2>{children}</div>
      </SidebarProvider>
    </DialogContent>
  </Dialog>;
}
