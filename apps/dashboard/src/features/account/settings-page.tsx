import { useIsMobile } from '@/hooks/use-mobile';
import { useLayoutEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Link, useLocation, useNavigate, useParams } from 'react-router';
import { useDashboardContext } from '@/app/dashboard-context';
import AccountProfile from './AccountProfile';
import PasswordSettings from './PasswordSettings';
import AccountBilling from '@/features/billing/AccountBilling';
import { Sidebar, SidebarProvider, SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import type { DashboardContext } from '@/app/dashboard-context';
import { readTheme, saveTheme, subscribeTheme, type Theme } from '@/app/theme';
import { useEffect } from 'react';
import { IconChevronDown, IconSun, IconMoon, IconDeviceDesktop, IconUserCircle, IconPalette, IconCreditCard, IconWallet, IconInfoCircle } from '@tabler/icons-react';
import { IconArrowUpRight, IconBook, IconVersions, IconBrandGithub, IconBug, IconLicense, IconCopyright, IconChevronRight } from '@tabler/icons-react';
import logo from '../../../../../branding/assets/niu-mark.png';

function SettingsContent({context, section}: {context: DashboardContext; section: string | undefined}) {
  const navigate = useNavigate();
  const location = useLocation();
  const identity = JSON.stringify([context.token, context.session?.operator?.id]);
  const [profileState, setProfileState] = useState({identity, value:context.session?.profile ?? null});
  const profile = profileState.identity === identity ? profileState.value : context.session?.profile ?? null;
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => subscribeTheme(() => setTheme(readTheme())), []);
  useEffect(() => setProfileState({identity,value:context.session?.profile ?? null}), [identity,context.session?.profile]);
  if (!section || !['account', 'appearance', 'billing', 'payments', 'about'].includes(section)) return <Navigate state={location.state} to={context.session?.kind === 'operator' ? '/settings/account' : '/settings/appearance'} replace />;
  if (section === 'account' && context.session?.kind !== 'operator') return <Navigate state={location.state} to="/settings/appearance" replace />;
  const personal = context.session?.kind === 'operator';
  const canViewBilling = context.session?.kind === 'installation' || (context.session?.operator?.project_id === null && ['owner', 'admin'].includes(context.session.operator.role));
  return <div className={`settings-page w-full min-w-0 space-y-8${section === 'payments' ? ' settings-payments-page' : ''}`}>
    {personal ? <div hidden={section !== 'account'}>
      <AccountProfile key={'profile-' + identity} token={context.token} initialProfile={profile} onSaved={value => setProfileState({identity,value})}/>
      <PasswordSettings key={'password-' + identity} token={context.token} onChanged={async () => { await context.signOut(); navigate('/login', {replace:true,state:{passwordChanged:true}}); }}/>
    </div> : null}
    {section === 'about' && <section aria-label="About Niu" className="space-y-8">
      <header className="flex items-center gap-4">
        <img src={logo} alt="" className="size-16 shrink-0"/>
        <div className="min-w-0"><h2 className="text-xl font-semibold">NIU.IO</h2><p className="mt-1 text-sm text-muted-foreground">{import.meta.env.VITE_NIU_VERSION ? `Version ${import.meta.env.VITE_NIU_VERSION}` : 'Development build'}</p></div>
      </header>
      <dl className="space-y-3 text-sm">
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-muted-foreground">Release date</dt><dd>{import.meta.env.VITE_NIU_RELEASE_DATE || 'Not released'}</dd></div>
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-muted-foreground">License</dt><dd>MIT</dd></div>
      </dl>
      <nav aria-label="Product resources" className="grid gap-1 sm:grid-cols-2">
        <Button asChild variant="ghost" className="justify-start"><NavLink to="/help/"><IconBook aria-hidden="true"/>Documentation<IconChevronRight className="ml-auto text-muted-foreground" aria-hidden="true"/></NavLink></Button>
        <Button asChild variant="ghost" className="justify-start"><a href="https://github.com/niu-io/niu/releases" target="_blank" rel="noopener noreferrer"><IconVersions aria-hidden="true"/>Release notes<IconArrowUpRight className="ml-auto text-muted-foreground" aria-hidden="true"/></a></Button>
        <Button asChild variant="ghost" className="justify-start"><a href="https://github.com/niu-io/niu" target="_blank" rel="noopener noreferrer"><IconBrandGithub aria-hidden="true"/>GitHub<IconArrowUpRight className="ml-auto text-muted-foreground" aria-hidden="true"/></a></Button>
        <Button asChild variant="ghost" className="justify-start"><a href="https://github.com/niu-io/niu/issues" target="_blank" rel="noopener noreferrer"><IconBug aria-hidden="true"/>Report an issue<IconArrowUpRight className="ml-auto text-muted-foreground" aria-hidden="true"/></a></Button>
      </nav>
      <nav aria-label="Legal resources" className="flex flex-wrap gap-x-5 gap-y-3 text-xs text-muted-foreground">
        <a href="https://github.com/niu-io/niu/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4"><IconLicense size={14} aria-hidden="true"/>License</a>
        <a href="https://github.com/niu-io/niu/blob/main/THIRD-PARTY-NOTICES.md" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4"><IconCopyright size={14} aria-hidden="true"/>Third-party notices</a>
      </nav>
    </section>}
    {section === 'appearance' && <section aria-label="Appearance preferences" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div><h2 className="text-sm font-medium">Color mode</h2><p className="text-sm text-muted-foreground">System follows your device’s appearance.</p></div>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary" aria-label="Color mode" disabled={context.appearance?.ready === false}>{theme === 'light' ? <IconSun/> : theme === 'dark' ? <IconMoon/> : <IconDeviceDesktop/>}{theme[0].toUpperCase()+theme.slice(1)}<IconChevronDown/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuRadioGroup value={theme} onValueChange={value => saveTheme(value as Theme)}>
            <DropdownMenuRadioItem value="system"><IconDeviceDesktop/>System</DropdownMenuRadioItem><DropdownMenuRadioItem value="light"><IconSun/>Light</DropdownMenuRadioItem><DropdownMenuRadioItem value="dark"><IconMoon/>Dark</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu>
      </div>
      {context.appearance?.saving && <p role="status">Saving color mode…</p>}
      {context.appearance?.error && <div role="alert"><p>{context.appearance.error}</p><Button variant="secondary" onClick={context.appearance.reload}>Reload color mode</Button></div>}
    </section>}
    {section === 'payments' && <h2 className="text-sm font-semibold">Payments</h2>}
    {['billing', 'payments'].includes(section) && context.organization && <p className="text-muted-foreground">{context.organization.name} · Shared across workspaces</p>}
    {['billing', 'payments'].includes(section) && (canViewBilling
      ? context.organization
        ? <AccountBilling section={section as 'billing' | 'payments'} key={context.token + context.organization.id} token={context.token} organization={context.organization.id} canConfigure={Boolean(context.session?.permissions?.write)}/>
        : context.workspaceLoading
          ? <p role="status" className="text-muted-foreground">Loading billing account…</p>
          : <div role="alert" className="space-y-3"><p>Could not load your billing account.</p><Button variant="secondary" onClick={context.reloadWorkspaces}>Retry</Button></div>
      : <p className="text-muted-foreground">Account billing is available to organization owners and administrators.</p>)}
  </div>;
}


export function SettingsNavigation({ context, section, href }: { context: DashboardContext; section?: string; href?: (section:string)=>string }) {
  const location = useLocation();
  const personal = context.session?.kind === 'operator';
  const canViewBilling = context.session?.kind === 'installation' || (context.session?.operator?.project_id === null && ['owner', 'admin'].includes(context.session.operator.role));
  const entries = [
    ...(personal ? [{path:'account',label:'Account',icon:IconUserCircle}] : []),
    {path:'appearance',label:'Appearance',icon:IconPalette},
    ...(canViewBilling ? [{path:'billing',label:'Billing',icon:IconCreditCard}, {path:'payments',label:'Payments',icon:IconWallet}] : []),
    {path:'about',label:'About',icon:IconInfoCircle},
  ];
  return <>
    <SidebarHeader className="sidebar-heading"><h2 className="sidebar-heading-row group-data-[collapsible=icon]:sr-only">Settings</h2></SidebarHeader>
    <SidebarContent className="px-3 pb-3"><nav aria-label="Settings navigation"><SidebarMenu>
      {entries.map(item => {
        const selected = section ? section === item.path : location.pathname === '/settings/'+item.path;
        return <SidebarMenuItem key={item.path}><SidebarMenuButton asChild tooltip={item.label} isActive={selected}><Link aria-current={selected ? 'page' : undefined} state={location.state} to={href ? href(item.path) : '/settings/'+item.path}><item.icon aria-hidden="true"/><span>{item.label}</span></Link></SidebarMenuButton></SidebarMenuItem>;
      })}
    </SidebarMenu></nav></SidebarContent>
  </>;
}

export function settingsReturnDestination(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  const destination = new URL(value, 'https://niu.invalid');
  if (destination.origin !== 'https://niu.invalid' || /^\/(settings|login|installation)(\/|$)/.test(destination.pathname)) return fallback;
  return destination.pathname + destination.search + destination.hash;
}

export function settingsHref(pathname: string, search: string, hash: string, section: string): string {
  const query = new URLSearchParams(search);
  query.set('settings', section);
  return pathname + '?' + query.toString() + hash;
}

export function SettingsDialog({context, section, onClose, href}: {context:DashboardContext; section:string|undefined; onClose:()=>void; href?:(section:string)=>string}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, [section]);
  const isMobile = useIsMobile();
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent onOpenAutoFocus={event => { event.preventDefault(); headingRef.current?.focus(); }} onCloseAutoFocus={event => {
      // The menu item that opened Settings unmounts. Return to its persistent
      // trigger, or the navigation toggle when the mobile rail is hidden.
      const destination = Array.from(document.querySelectorAll<HTMLElement>('[aria-label="Account menu"], [aria-label="Open navigation menu"], .sidebar-toggle'))
        .find(element => element.isConnected && element.getClientRects().length > 0 && !element.closest('[role="dialog"]'));
      if (destination) { event.preventDefault(); destination.focus(); }
    }} aria-describedby="settings-description" className="settings-dialog !max-w-5xl !w-[calc(100%-2rem)] !p-0 !gap-0 overflow-hidden h-[min(760px,85dvh)]">
      <DialogTitle ref={headingRef} tabIndex={-1} className="sr-only">Settings</DialogTitle>
      <DialogDescription id="settings-description" className="sr-only">Account preferences and company billing.</DialogDescription>
      <SidebarProvider style={{'--sidebar-width': '200px'} as React.CSSProperties} className="!min-h-0 h-full overflow-hidden">
        <Sidebar collapsible={isMobile ? "none" : "icon"} className="settings-dialog-navigation shrink-0 bg-muted/40">
          <SettingsNavigation context={context} section={section} href={href}/>
        </Sidebar>
        <div ref={contentRef} role="region" aria-label="Settings content" tabIndex={0} className="settings-dialog-content min-w-0 flex-1 overflow-y-auto p-6 pt-12 sm:p-10 sm:pt-12 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2">{!isMobile && <SidebarTrigger aria-label="Toggle Settings navigation" className="absolute top-3 left-[calc(var(--sidebar-width)+12px)] settings-navigation-trigger"/>}<SettingsContent context={context} section={section}/></div>
      </SidebarProvider>
    </DialogContent>
  </Dialog>;
}

export default function SettingsPage() {
  const context = useDashboardContext();
  const location = useLocation();
  const navigate = useNavigate();
  const fallback = '/workspaces/default';
  const returnTo = settingsReturnDestination(location.state?.settingsReturnTo, fallback);
  const {section} = useParams();
  return <SettingsDialog context={context} section={section} onClose={() => navigate(returnTo,{replace:true})}/>;
}
