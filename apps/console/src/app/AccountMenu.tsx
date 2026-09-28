import { X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { LogOut, KeyRound, Sun, Moon, Monitor, Building2 } from 'lucide-react';
import { applyTheme, readTheme, saveTheme, type Theme } from './theme';
import ConnectPrompt from '@/components/ConnectPrompt';
import type { ConsoleContext } from './console-context';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function AccountMenu({ context, workspacePath, providerArea = false }: { context: ConsoleContext; workspacePath: string; providerArea?: boolean }) {
  const [themeKeyboardFocus, setThemeKeyboardFocus] = useState(false);
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
  const { session, token, draftToken, setDraftToken, error, connect, signOut, organizations, organization, selectOrganization, workspaceLoading, workspaceError } = context;
  useEffect(() => { if (token) setSignInOpen(false); }, [token]);
  const installation = session?.kind === 'installation';
  const supplierOnly = providerArea && !installation && !session?.operator;
  const label = supplierOnly ? installation ? 'Supplier management' : 'Supplier account' : installation ? 'Niu administrator' : session?.operator ? `${session.operator.role[0].toUpperCase()}${session.operator.role.slice(1)}` : 'Administrator access';
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger className="rail-avatar account-trigger" aria-label="Account menu" title="Account">
        {session ? label[0] : 'N'}
      </DropdownMenuTrigger>
        <DropdownMenuContent className="account-menu" onKeyDownCapture={() => setThemeKeyboardFocus(true)} side="right" align="end" sideOffset={12} collisionPadding={12}>
          <DropdownMenuLabel className="account-identity">
            <strong>{label}</strong>
            <span>{supplierOnly ? 'Model supply and earnings' : installation ? 'All organizations and workspaces' : session?.operator ? 'Scoped workspace access' : 'Sign in to manage this installation'}</span>
            {!supplierOnly && session?.operator && <dl><dt>Organization</dt><dd>{session.operator.organization_id}</dd>{session.operator.project_id && <><dt>Workspace</dt><dd>{session.operator.project_id}</dd></>}</dl>}
          </DropdownMenuLabel>
          {!supplierOnly && token && organizations.length > 0 && <>
            <DropdownMenuSeparator className="account-separator"/>
            <DropdownMenuLabel className="workspace-switcher-menu-title">Organizations</DropdownMenuLabel>
            <DropdownMenuRadioGroup className="account-organizations" aria-label="Organization" value={organization?.id ?? ''} onValueChange={id => {
              const next = organizations.find(item => item.id === id);
              if (next) selectOrganization(next);
            }}>
              {organizations.map(item => <DropdownMenuRadioItem key={item.id} value={item.id} disabled={workspaceLoading || Boolean(workspaceError && workspaceError.kind !== 'missing')}>
                <span>{item.name}{organizations.filter(other => other.name === item.name).length > 1 ? ` (${item.id})` : ''}</span>
              </DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </>}
          {!supplierOnly && organization && <DropdownMenuItem asChild><Link to={`${workspacePath}/organization`}><Building2 size={18}/>Organization settings</Link></DropdownMenuItem>}
          {token && <DropdownMenuItem onSelect={signOut}><LogOut size={18}/>Sign out</DropdownMenuItem>}
          {!token && <><DropdownMenuSeparator className="account-separator"/><DropdownMenuItem onSelect={() => setSignInOpen(true)}><KeyRound size={18}/>Administrator sign-in</DropdownMenuItem></>}
          <DropdownMenuSeparator className="account-separator"/>
          <DropdownMenuRadioGroup className="theme-options" data-keyboard-focus={themeKeyboardFocus} onPointerMove={() => setThemeKeyboardFocus(false)} onPointerDown={() => setThemeKeyboardFocus(false)} onKeyDown={() => setThemeKeyboardFocus(true)} aria-label="Appearance" value={theme} onValueChange={value => { const next = value as Theme; setTheme(next); saveTheme(next); }}>
            {([{value: 'light', label: 'Light', icon: Sun}, {value: 'dark', label: 'Dark', icon: Moon}, {value: 'system', label: 'System', icon: Monitor}] as const).map(option => <DropdownMenuRadioItem key={option.value} value={option.value} onSelect={event => event.preventDefault()}><option.icon size={18}/><span>{option.label}</span></DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={signInOpen && !token} onOpenChange={setSignInOpen}>
      <DialogContent className="niu-modal account-dialog" showCloseButton={false}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>Administrator access</DialogTitle><DialogDescription>Sign in with the bootstrap token for this self-hosted Niu installation. Applications use scoped API keys.</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
        </DialogHeader>
      <ConnectPrompt draft={draftToken} error={error} onChange={setDraftToken} onSubmit={connect}/>
    </DialogContent>
    </Dialog>
  </>;
}
