import ProviderMark from './ProviderMark';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useLocale } from '@/shell/ui-locale';
import { useDashboardContext } from '@/shell/dashboard-context';
import { workspaceModelsHref } from '@/shell/workspace-route';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { IconChevronDown as ChevronDown } from '@tabler/icons-react';
import { request, writeMayHaveCommitted, type ProviderConnection, type ProviderIntegration } from '../api';
import type { ProviderPreset } from '../provider-presets';

/** Administrator-managed internal-use setup, with saved-key recovery independent of catalog availability. */
export default function ProviderConnectDialog({ preset, onClose, onSaved }: { preset: ProviderPreset; onClose: () => void; onSaved: () => void }) {
  const { t, format } = useLocale();
  const { token, session, organization, workspace, workspaces, refreshWorkspace } = useDashboardContext();
  const resale = session?.operating_mode === 'resale';
  const [name, setName] = useState(preset.name);
  const [base, setBase] = useState(preset.apiBase);
  const [key, setKey] = useState('');
  const [accessScope, setAccessScope] = useState<'internal' | 'personal'>('internal');
  const [connection, setConnection] = useState<ProviderConnection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [imported, setImported] = useState<number | null>(null);
  async function connect(event: FormEvent) {
    event.preventDefault();
    if (busy || !organization || uncertain) return;
    setBusy(true); setError('');
    let saved = connection;
    try {
      if (!saved) {
        try {
          const result = await request<{ data: ProviderConnection }>(token, '/api/v1/vendors', 'POST', {
            name: name.trim(), adapter: preset.adapter, api_base: base.trim(), api_key: key,
            enabled: true, create_supplier: true,
            ...(!resale && { access_scope: accessScope, personal_organization_id: organization.id }),
          });
          saved = result.data;
          if (!saved?.id) throw new Error('Invalid creation response.');
          setConnection(saved); setKey(''); onSaved();
        } catch (reason) {
          if (writeMayHaveCommitted(reason)) { setUncertain(true); setKey(''); throw new Error(t('Connection creation could not be confirmed. Close this dialog and refresh Providers before trying again.')); }
          throw reason;
        }
      }
      // Save service identity at Provider scope; credentials inherit it.
      const owner = await request<{data:{id:string}}>(token, `/api/v1/vendors/${encodeURIComponent(saved.id)}/supplier`);
      const path = `/api/v1/providers/${encodeURIComponent(owner.data.id)}/integration`;
      const current = await request<{ data: ProviderIntegration }>(token, path);
      if (current.data.effective_type !== preset.integration) {
        await request(token, path, 'PUT', { integration_type: preset.integration, expected_revision: current.data.revision });
      }
      const result = await request<{ data: { imported: number; discovered: number } }>(token, `/api/v1/vendors/${encodeURIComponent(saved.id)}/import`, 'POST', {});
      setImported(result.data.discovered); onSaved();
      await refreshWorkspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Could not connect Provider.'));
    } finally { setBusy(false); }
  }
  const shared = !resale && accessScope === 'internal';
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent onInteractOutside={event => { if (busy) event.preventDefault(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
    <DialogHeader><DialogTitle className="flex items-center gap-3"><ProviderMark preset={preset} />{format('Connect {0}', [preset.name])}</DialogTitle><DialogDescription>{resale ? t('Connect this Provider and discover its models. Commercial models need offers and customer pricing before selling.') : shared ? t('The account funds this Provider directly. Every internal workspace can use the imported models without customer pricing or payment collection.') : t('The account funds this Provider directly. Only this account can use the imported models.')}</DialogDescription></DialogHeader>
    <form onSubmit={event => void connect(event)} className="space-y-4">
      <p className="text-sm font-medium">{resale ? t('Resale') : t('Internal use')}</p>
      {resale ? <p className="text-sm text-muted-foreground">{t('Account')}: {organization?.name ?? t('Select an account first.')}</p> : <div className="space-y-2">
        <Label>{t('Who can use this connection?')}</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-between font-normal" disabled={busy || imported !== null}>
              <span>{shared ? t('All internal workspaces') : format('Only {0}', [organization?.name ?? t('this account')])}</span><ChevronDown size={16} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
            <DropdownMenuRadioGroup value={accessScope} onValueChange={value => setAccessScope(value === 'personal' ? 'personal' : 'internal')}>
              <DropdownMenuRadioItem value="internal">{t('All internal workspaces')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="personal">{format('Only {0}', [organization?.name ?? t('this account')])}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="text-sm text-muted-foreground">{shared ? format('Funded by {0}. Models are visible to every authorized organization on this installation.', [organization?.name ?? t('this account')]) : format('Funded by {0}. Models are visible only to this account.', [organization?.name ?? t('this account')])}</p>
      </div>}
      {imported === null ? <>
        {!connection && !uncertain && <>
          <div className="space-y-2"><Label htmlFor="preset-key">{t('Provider API key')}</Label><Input id="preset-key" type="password" autoComplete="new-password" required value={key} maxLength={8192} onChange={event => setKey(event.target.value)} disabled={busy}/></div>
          <a href={preset.website} target="_blank" rel="noreferrer" className="text-sm underline">{t('Provider website')}</a>
          <details><summary className="cursor-pointer text-sm">{t('Connection settings')}</summary><div className="mt-3 space-y-3">
            <div className="space-y-2"><Label htmlFor="preset-name">{t('Connection name')}</Label><Input id="preset-name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={busy}/></div>
            <div className="space-y-2"><Label htmlFor="preset-base">{t('API base URL')}</Label><Input id="preset-base" type="url" required maxLength={2048} value={base} onChange={event => setBase(event.target.value)} disabled={busy}/></div>
          </div></details>
        </>}
        {connection && <p role="status" className="text-sm">{t('API key saved. Retry model import without entering or saving the key again.')}</p>}
        <p className="text-sm text-muted-foreground">{t('Importing the catalog does not make an inference request or verify model access. Upstream balance and permissions still apply.')}</p>
      </> : <p role="status">{resale ? format('{0} models discovered. New commercial models are disabled until configured for selling. Existing settings are preserved.', [imported]) : format('{0} models discovered. Existing model settings are preserved.', [imported])}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{imported === null ? t('Cancel') : t('Done')}</Button>
        {imported === null ? <Button type="submit" disabled={busy || uncertain || !organization || (!connection && (!key.trim() || !name.trim() || !base.trim()))}>{busy ? t('Connecting…') : connection ? t('Retry model import') : t('Connect and import models')}</Button> : <Button asChild><Link to={resale ? '/admin/providers' : workspaceModelsHref(workspace, workspaces)} onClick={onClose}>{resale ? t('Configured Providers') : t('View models')}</Link></Button>}
      </DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
