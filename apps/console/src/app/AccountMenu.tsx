import { useEffect, useState } from 'react';
import { Dialog, DropdownMenu } from 'radix-ui';
import { Link } from 'react-router';
import { ChartNoAxesCombined, KeyRound, PanelsTopLeft, Settings2, UsersRound, Sun, Moon, Monitor, X } from 'lucide-react';
import { applyTheme, readTheme, saveTheme, type Theme } from './theme';
import ConnectPrompt from '@/components/ConnectPrompt';
import type { ConsoleContext } from './console-context';

export default function AccountMenu({ context }: { context: ConsoleContext }) {
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
  const { session, token, draftToken, setDraftToken, error, connect } = context;
  useEffect(() => { if (token) setSignInOpen(false); }, [token]);
  const installation = session?.kind === 'installation';
  const label = installation ? 'Installation admin' : session?.operator ? `${session.operator.role[0].toUpperCase()}${session.operator.role.slice(1)}` : 'Administrator access';
  return <>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="rail-avatar account-trigger" aria-label="Account menu" title="Account">
        {session ? label[0] : 'N'}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="account-menu" side="right" align="end" sideOffset={12} collisionPadding={12}>
          <DropdownMenu.Label className="account-identity">
            <strong>{label}</strong>
            <span>{installation ? 'Access across this installation' : session?.operator ? 'Scoped workspace access' : 'Sign in to manage this installation'}</span>
            {session?.operator && <dl><dt>Organization</dt><dd>{session.operator.organization_id}</dd>{session.operator.project_id && <><dt>Project</dt><dd>{session.operator.project_id}</dd></>}</dl>}
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="account-separator"/>
          <DropdownMenu.Item asChild><Link to="."><PanelsTopLeft size={18}/>Workspace</Link></DropdownMenu.Item>
          <DropdownMenu.Item asChild><Link to="usage"><ChartNoAxesCombined size={18}/>Usage & cost</Link></DropdownMenu.Item>
          <DropdownMenu.Item asChild><Link to="keys"><KeyRound size={18}/>API keys</Link></DropdownMenu.Item>
          {session?.permissions.manage_operators && <DropdownMenu.Item asChild><Link to="operators"><UsersRound size={18}/>Access management</Link></DropdownMenu.Item>}
          {installation && <DropdownMenu.Item asChild><Link to="vendors"><Settings2 size={18}/>Administration</Link></DropdownMenu.Item>}
          <DropdownMenu.Separator className="account-separator"/>
          {!token && <DropdownMenu.Item onSelect={() => setSignInOpen(true)}><KeyRound size={18}/>Administrator sign-in</DropdownMenu.Item>}
          <DropdownMenu.Separator className="account-separator"/>
          <DropdownMenu.RadioGroup className="theme-options" aria-label="Appearance" value={theme} onValueChange={value => { const next = value as Theme; setTheme(next); saveTheme(next); }}>
            {([{value: 'light', label: 'Light', icon: Sun}, {value: 'dark', label: 'Dark', icon: Moon}, {value: 'system', label: 'System', icon: Monitor}] as const).map(option => <DropdownMenu.RadioItem key={option.value} value={option.value} onSelect={event => event.preventDefault()}><option.icon size={18}/><span>{option.label}</span></DropdownMenu.RadioItem>)}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    <Dialog.Root open={signInOpen && !token} onOpenChange={setSignInOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="account-overlay"/>
        <Dialog.Content className="account-dialog">
          <Dialog.Title>Administrator access</Dialog.Title>
          <Dialog.Description>Sign in with the bootstrap token for this self-hosted Niu installation. Applications use scoped API keys.</Dialog.Description>
          <ConnectPrompt draft={draftToken} error={error} onChange={setDraftToken} onSubmit={connect}/>
          <Dialog.Close className="account-close" aria-label="Close connection dialog"><X size={20}/></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
