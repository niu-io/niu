import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { IconLogout as LogOut } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconSun as Sun } from "@tabler/icons-react";
import { IconMoon as Moon } from "@tabler/icons-react";
import { IconDeviceDesktop as Monitor } from "@tabler/icons-react";
import { IconBuildings as Building2 } from "@tabler/icons-react";
import { FolderKey } from "lucide-react";
import { IconSparkles } from "@tabler/icons-react";
import { IconCpu as Boxes } from "@tabler/icons-react";
import { IconPlugConnected as SupplierConnection } from "@tabler/icons-react";
import { IconBook as CircleHelp } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { settingsHref } from '@/features/account/settings-page';
import { IconChartLine, IconSettings, IconShieldLock } from '@tabler/icons-react';
import { useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { applyTheme, readTheme, saveTheme, subscribeTheme, type Theme } from './theme';
import type { DashboardContext } from './dashboard-context';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';

export default function AccountMenu({ context, workspacePath, supplierArea = false, mobile = false }: { context: DashboardContext; workspacePath: string; supplierArea?: boolean; mobile?: boolean }) {
  const {isMobile: compactNavigation, setOpenMobile} = useSidebar();
  const location = useLocation();
  const appearance = context.appearance ?? {ready:true,saving:false,error:'',reload:()=>{}};
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => subscribeTheme(() => setTheme(readTheme())), []);
  const profile = context.session?.profile ?? null;
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(theme);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);
  const { session, token, signOut, organizations, organization, selectOrganization, workspaceLoading, workspaceError } = context;
  const installation = session?.kind === 'installation';
  const platformAdmin = installation || Boolean(session?.permissions.platform_admin);
  const supplierOnly = supplierArea && !installation && !session?.operator;
  const label = profile?.name || (installation ? 'Administrator access' : 'Account');
  return <>
    <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
      {mobile ? <DropdownMenuTrigger asChild><Button variant="ghost" aria-label="Open navigation menu">Navigation<ChevronDown size={16} /></Button></DropdownMenuTrigger> : <DropdownMenuTrigger className="rail-avatar account-trigger" aria-label="Account menu" title="Account">
        {profile ? <Avatar className="size-full"><AvatarImage src={profile.avatar_data_url ?? undefined} alt=""/><AvatarFallback>{label[0]}</AvatarFallback></Avatar> : session ? label[0] : 'N'}
      </DropdownMenuTrigger>}
        <DropdownMenuContent onEscapeKeyDown={event => event.stopPropagation()} className="account-menu" side={mobile ? "bottom" : "right"} align="end" sideOffset={12} collisionPadding={12}>
          {mobile && <>
            {!supplierOnly && <>
              <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to={workspacePath}><FolderKey />Workspace</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to="/generations"><IconSparkles />Generations</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to="/activity"><IconChartLine />Activity</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to={`/models?workspace=${encodeURIComponent(workspacePath.split('/').pop() ?? 'default')}`}><Boxes />Models</Link></DropdownMenuItem>
            </>}
            {((platformAdmin && session?.permissions.manage_operators) || Boolean(session?.provider_memberships?.length)) && <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to={platformAdmin ? '/admin/suppliers' : session?.provider_memberships?.length ? `/suppliers/${session.provider_memberships[0].id}` : '/suppliers'}>{platformAdmin ? <IconShieldLock size={16} /> : <SupplierConnection size={16} />}{platformAdmin ? "Admin" : "Suppliers"}</Link></DropdownMenuItem>}
            <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to="/help/"><CircleHelp />Documentation</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
          </>}
          <DropdownMenuLabel className="account-identity">
            <Avatar className="size-9 shrink-0" aria-hidden="true"><AvatarImage src={profile?.avatar_data_url ?? undefined} alt=""/><AvatarFallback>{label[0].toUpperCase()}</AvatarFallback></Avatar>
            <div className="account-identity-details"><strong>{label}</strong>
            <span>{profile?.email || (installation ? 'Administrator token session' : token ? 'Account settings' : 'Sign in')}</span></div>
          </DropdownMenuLabel>
          {!supplierOnly && token && organizations.length > 0 && <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Organizations</DropdownMenuLabel>
            <DropdownMenuRadioGroup className="account-organizations" aria-label="Organization" value={organization?.id ?? ''} onValueChange={id => {
              const next = organizations.find(item => item.id === id);
              if (next) selectOrganization(next);
            }}>
              {organizations.map(item => <DropdownMenuRadioItem key={item.id} value={item.id} disabled={workspaceLoading || Boolean(workspaceError && workspaceError.kind !== 'missing')}>
                <span>{item.name}</span>
              </DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </>}
          {!supplierOnly && organization && <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to={`${workspacePath}/organization`}><Building2 size={18}/>Organization settings</Link></DropdownMenuItem>}
          {token && <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} state={{settingsReturnTo: location.pathname + location.search + location.hash}} to={settingsHref(location.pathname, location.search, location.hash, installation ? "appearance" : "account")}><IconSettings size={18}/>Settings</Link></DropdownMenuItem>}
          {!token && <><DropdownMenuSeparator /><DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to="/login" state={{ from: `${location.pathname}${location.search}${location.hash}` }}><KeyRound size={18}/>Sign in</Link></DropdownMenuItem></>}
          <DropdownMenuSeparator />
          {compactNavigation ? <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} state={{settingsReturnTo: location.pathname + location.search + location.hash}} to={settingsHref(location.pathname, location.search, location.hash, "appearance")}><Monitor/><span className="flex-1">Appearance</span><span className="text-muted-foreground">{theme[0].toUpperCase()+theme.slice(1)}</span></Link></DropdownMenuItem> : <DropdownMenuSub>
            <DropdownMenuSubTrigger aria-label={`Theme: ${theme[0].toUpperCase()+theme.slice(1)}`}><Monitor/><span className="flex-1">Theme</span><span className="text-muted-foreground">{theme[0].toUpperCase()+theme.slice(1)}</span></DropdownMenuSubTrigger>
            <DropdownMenuSubContent collisionPadding={12}>
              <DropdownMenuRadioGroup aria-label="Appearance" value={theme} onValueChange={value => { const next = value as Theme; setTheme(next); saveTheme(next); setAccountMenuOpen(false); }}>
                {([{value: 'system', label: 'System', icon: Monitor}, {value: 'light', label: 'Light', icon: Sun}, {value: 'dark', label: 'Dark', icon: Moon}] as const).map(option => <DropdownMenuRadioItem key={option.value} value={option.value} disabled={!appearance.ready} onSelect={() => setAccountMenuOpen(false)}><option.icon/><span>{option.label}</span></DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>}
          {appearance.error && <><DropdownMenuLabel className="text-destructive">{appearance.error}</DropdownMenuLabel><DropdownMenuItem onSelect={appearance.reload}>Reload color mode</DropdownMenuItem></>}
          {token && <><DropdownMenuSeparator/><DropdownMenuItem onSelect={signOut}><LogOut/>Sign out</DropdownMenuItem></>}
        </DropdownMenuContent>
    </DropdownMenu>

  </>;
}
