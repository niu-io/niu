import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ChartNoAxesCombined, KeyRound, PanelsTopLeft, Settings2, UsersRound, Sun, Moon, Monitor, Building2 } from 'lucide-react';
import { applyTheme, readTheme, saveTheme, type Theme } from './theme';
import ConnectPrompt from '@/components/ConnectPrompt';
import type { ConsoleContext } from './console-context';
import ModalFrame from '@/components/ModalFrame';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function AccountMenu({ context, workspacePath, providerArea = false }: { context: ConsoleContext; workspacePath: string; providerArea?: boolean }) {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(theme);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);
  const [signInOpen, setSignInOpen] = useState(false);
  const { session, token, draftToken, setDraftToken, error, connect, organizations, organization, selectOrganization, workspaceLoading, workspaceError } = context;
  useEffect(() => { if (token) setSignInOpen(false); }, [token]);
  const installation = session?.kind === 'installation';
  const label = providerArea ? installation ? 'Provider management' : 'Provider account' : installation ? 'Niu administrator' : session?.operator ? `${session.operator.role[0].toUpperCase()}${session.operator.role.slice(1)}` : 'Administrator access';
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger className="rail-avatar account-trigger" aria-label="Account menu" title="Account">
        {session ? label[0] : 'N'}
      </DropdownMenuTrigger>
        <DropdownMenuContent className="account-menu" side="right" align="end" sideOffset={12} collisionPadding={12}>
          <DropdownMenuLabel className="account-identity">
            <strong>{label}</strong>
            <span>{providerArea ? 'Model supply and earnings' : installation ? 'All organizations and workspaces' : session?.operator ? 'Scoped workspace access' : 'Sign in to manage this installation'}</span>
            {!providerArea && session?.operator && <dl><dt>Organization</dt><dd>{session.operator.organization_id}</dd>{session.operator.project_id && <><dt>Workspace</dt><dd>{session.operator.project_id}</dd></>}</dl>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="account-separator"/>
          {!providerArea && token && organizations.length > 0 && <>
            <DropdownMenuLabel className="workspace-switcher-menu-title">Organizations</DropdownMenuLabel>
            <DropdownMenuRadioGroup className="account-organizations" aria-label="Organization" value={organization?.id ?? ''} onValueChange={id => {
              const next = organizations.find(item => item.id === id);
              if (next) selectOrganization(next);
            }}>
              {organizations.map(item => <DropdownMenuRadioItem key={item.id} value={item.id} disabled={workspaceLoading || Boolean(workspaceError && workspaceError.kind !== 'missing')}>
                <span>{item.name}{organizations.filter(other => other.name === item.name).length > 1 ? ` (${item.id})` : ''}</span>
              </DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator className="account-separator"/>
          </>}
          {!providerArea && <>{organization && <DropdownMenuItem asChild><Link to={`${workspacePath}/organization`}><Building2 size={18}/>Organization settings</Link></DropdownMenuItem>}
          <DropdownMenuItem asChild><Link to={workspacePath}><PanelsTopLeft size={18}/>Workspace</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to={`${workspacePath}/usage`}><ChartNoAxesCombined size={18}/>Usage</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to={`${workspacePath}/keys`}><KeyRound size={18}/>API keys</Link></DropdownMenuItem>
          {session?.permissions.manage_operators && <DropdownMenuItem asChild><Link to={`${workspacePath}/operators`}><UsersRound size={18}/>Access management</Link></DropdownMenuItem>}
          {installation && <DropdownMenuItem asChild><Link to="/providers/configuration"><Settings2 size={18}/>Providers</Link></DropdownMenuItem>}</>}
          <DropdownMenuSeparator className="account-separator"/>
          {!token && <DropdownMenuItem onSelect={() => setSignInOpen(true)}><KeyRound size={18}/>Administrator sign-in</DropdownMenuItem>}
          <DropdownMenuSeparator className="account-separator"/>
          <DropdownMenuRadioGroup className="theme-options" aria-label="Appearance" value={theme} onValueChange={value => { const next = value as Theme; setTheme(next); saveTheme(next); }}>
            {([{value: 'light', label: 'Light', icon: Sun}, {value: 'dark', label: 'Dark', icon: Moon}, {value: 'system', label: 'System', icon: Monitor}] as const).map(option => <DropdownMenuRadioItem key={option.value} value={option.value} onSelect={event => event.preventDefault()}><option.icon size={18}/><span>{option.label}</span></DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
    </DropdownMenu>
    <ModalFrame open={signInOpen && !token} onOpenChange={setSignInOpen} title="Administrator access" description="Sign in with the bootstrap token for this self-hosted Niu installation. Applications use scoped API keys." className="account-dialog" overlayClassName="account-overlay">
      <ConnectPrompt draft={draftToken} error={error} onChange={setDraftToken} onSubmit={connect}/>
    </ModalFrame>
  </>;
}
