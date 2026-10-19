import { useEffect, useState, type FormEvent } from 'react';
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconPlus as Plus } from "@tabler/icons-react";
import { IconPlugConnected as Router } from "@tabler/icons-react";
import { IconShieldCheck as ShieldCheck } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { request, defaultApiBase, providerAdapterApiLabels, type ProviderConnection, type ProviderAdapter, type ProviderConnectionWrite } from '../api';

export type ProviderConnectionCreate = { name: string; adapter: ProviderAdapter; api_base: string; api_key: string; enabled: true; create_supplier?: true; supplier_id?: string };
export type VendorCreate = ProviderConnectionCreate;

export default function ProviderEditor({ token, initialProviderId, initialSupplierId, connection, vendor, disabled, onCreate, onSave }: {
  token: string;
  initialProviderId?: string | null;
  initialSupplierId?: string | null;
  connection?: ProviderConnection | null;
  vendor?: ProviderConnection | null;
  disabled: boolean;
  onCreate: (input: ProviderConnectionCreate) => Promise<void>;
  onSave: (input: ProviderConnectionWrite) => Promise<void>;
}) {
  const activeConnection = connection ?? vendor ?? null;
  const defaultProviderId = initialProviderId ?? initialSupplierId ?? '';
  const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([]);
  const [providerId, setProviderId] = useState(defaultProviderId);
  const [providerError, setProviderError] = useState('');
  const [providerLoading, setProviderLoading] = useState(!activeConnection);
  const [providerRetry, setProviderRetry] = useState(0);
  useEffect(() => {
    if (activeConnection) return;
    const controller = new AbortController();
    setProviderLoading(true);
    setProviderError('');
    void request<{ data: Array<{ id: string; name: string }> }>(token, '/api/v1/providers', 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setProviders(result.data); })
      .catch(() => { if (!controller.signal.aborted) setProviderError('Provider list could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setProviderLoading(false); });
    return () => controller.abort();
  }, [token, activeConnection?.id, providerRetry]);
  const selectedProvider = providers.find(provider => provider.id === providerId);
  const ownershipUnavailable = !activeConnection && Boolean(providerId) && (providerLoading || Boolean(providerError) || !selectedProvider);
  const [name, setName] = useState(activeConnection?.name ?? '');
  const [adapter, setAdapter] = useState<ProviderAdapter>(activeConnection?.adapter ?? 'openrouter');
  const [apiBase, setApiBase] = useState(activeConnection?.api_base ?? defaultApiBase('openrouter'));
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(activeConnection?.enabled ?? true);
  const [confirmDisable, setConfirmDisable] = useState(false);

  useEffect(() => {
    setName(activeConnection?.name ?? '');
    setAdapter(activeConnection?.adapter ?? 'openrouter');
    setApiBase(activeConnection?.api_base ?? defaultApiBase('openrouter'));
    setApiKey('');
    setEnabled(activeConnection?.enabled ?? true);
    setConfirmDisable(false);
  }, [activeConnection?.id, activeConnection?.revision]);

  function changeAdapter(next: ProviderAdapter) {
    setApiBase(current => current === defaultApiBase(adapter) ? defaultApiBase(next) : current);
    setAdapter(next);
  }

  async function save(nextEnabled = enabled) {
    if (disabled || ownershipUnavailable || !name.trim() || !apiBase.trim()) return;
    if (!activeConnection) {
      if (!apiKey) return;
      await onCreate({ name: name.trim(), adapter, api_base: apiBase.trim(), api_key: apiKey, enabled: true, ...(providerId ? { supplier_id: providerId } : { create_supplier: true }) });
      setName('');
      setApiKey('');
      return;
    }
    await onSave({
      name: name.trim(),
      api_base: apiBase.trim(),
      enabled: nextEnabled,
      ...(apiKey ? { api_key: apiKey } : {}),
      expected_revision: activeConnection.revision,
    });
    setApiKey('');
    setConfirmDisable(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeConnection?.enabled && !enabled) {
      setConfirmDisable(true);
      return;
    }
    void save().catch(() => {});
  }

  const title = activeConnection ? activeConnection.name : 'Configure API access';
  return <section className={'panel vendor-editor' + (activeConnection && activeConnection.enabled ? ' is-enabled' : '')} aria-labelledby="vendor-editor-title">
    <div className="vendor-editor-heading">
      <span className="vendor-editor-mark"><Router size={18} /></span>
      <div className="vendor-editor-title-copy">
        <p className="eyebrow">{activeConnection ? 'API KEY' : 'NEW API KEY'}</p>
        <h2 id="vendor-editor-title">{title}</h2>
        <p>{activeConnection ? `Revision ${activeConnection.revision} · ${activeConnection.has_credential ? 'Credential stored' : 'No credential stored'}` : 'Save the upstream key, then choose the models it supplies.'}</p>
      </div>
      {activeConnection && <span className={'vendor-status-badge' + (activeConnection.enabled ? ' is-enabled' : '')}>{activeConnection.enabled ? 'Enabled' : 'Disabled'}</span>}
    </div>

    <form className="vendor-editor-form" onSubmit={submit}>
      <div className="vendor-editor-fields">
        {!activeConnection && <div className="space-y-2">
          <Label htmlFor="vendor-provider">Provider</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button id="vendor-provider" type="button" variant="outline" className="w-full justify-between font-normal" disabled={disabled || Boolean(defaultProviderId) || providerLoading || Boolean(providerError)}>{providerLoading ? 'Loading providers…' : providerId ? selectedProvider?.name ?? 'Provider unavailable' : 'New provider'}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={providerId} onValueChange={setProviderId}>
              <DropdownMenuRadioItem value="">New provider</DropdownMenuRadioItem>
              {providers.map(provider => <DropdownMenuRadioItem key={provider.id} value={provider.id}>{provider.name}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup></DropdownMenuContent>
          </DropdownMenu>
          {providerError && <div role="alert">{providerError}<Button type="button" variant="ghost" size="sm" onClick={() => setProviderRetry(value => value + 1)}>Retry</Button></div>}
        </div>}
        <Label htmlFor="vendor-name">{providerId || activeConnection ? 'API key name' : 'Provider name'}
          <Input id="vendor-name" value={name} onChange={event => setName(event.target.value)} maxLength={100} autoComplete="off" placeholder="e.g. Primary inference" required disabled={disabled} />
        </Label>
        <Label htmlFor="vendor-adapter">API format
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button id="vendor-adapter" type="button" variant="outline" className="w-full justify-between font-normal" disabled={disabled || Boolean(activeConnection)}>{providerAdapterApiLabels[adapter]}<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={adapter} onValueChange={value => changeAdapter(value as ProviderAdapter)}>
              <DropdownMenuRadioItem value="openrouter">OpenRouter API</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="openai">OpenAI-compatible API</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="anthropic">Anthropic Messages API</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="gemini">Google Gemini API</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="ark">Ark-compatible API</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup></DropdownMenuContent>
          </DropdownMenu>
        </Label>
        <Label htmlFor="vendor-api-base">API base URL
          <Input id="vendor-api-base" type="url" inputMode="url" value={apiBase} onChange={event => setApiBase(event.target.value)} maxLength={2048} autoComplete="url" placeholder={adapter === 'ark' ? 'https://fastrouter.wecitytech.com/doubao/api/v3' : defaultApiBase(adapter)} required disabled={disabled} />
        </Label>
        <Label htmlFor="vendor-api-key">{activeConnection ? 'Replace provider API key (optional)' : 'Provider API key'}
          <Input id="vendor-api-key" type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="new-password" spellCheck={false} placeholder={activeConnection ? 'Leave blank to keep the current credential' : 'Paste a provider key'} required={!activeConnection} disabled={disabled} />
        </Label>
      </div>

      <div className="vendor-editor-notes">
        <span><ShieldCheck size={15} />Public HTTPS or localhost HTTP only.</span>
        <span><KeyRound size={15} />Credentials are stored encrypted and never shown again.</span>
      </div>

      {activeConnection && <label className="vendor-enabled-toggle">
        <Checkbox checked={enabled} disabled={disabled} onCheckedChange={value => { setEnabled(value === true); setConfirmDisable(false); }} />
        <span><strong>Enabled for inference</strong><small>Disabled keys stay available for audit and can be enabled again.</small></span>
      </label>}

      {confirmDisable && <div className="vendor-confirm-disable" role="alertdialog" aria-labelledby="vendor-disable-title">
        <div><strong id="vendor-disable-title">Disable this API key?</strong><p>Models mapped to this key will stop receiving new requests.</p></div>
        <div className="vendor-confirm-actions">
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setConfirmDisable(false)}>Keep enabled</Button>
          <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={() => void save(false).catch(() => {})}>{disabled ? 'Saving…' : 'Confirm disable'}</Button>
        </div>
      </div>}

      <div className="vendor-editor-footer">
        <p>{activeConnection ? 'API format cannot be changed after creation.' : 'Use a public HTTPS URL. Loopback HTTP works for local development.'}</p>
        <Button type="submit" disabled={disabled || ownershipUnavailable || !name.trim() || !apiBase.trim() || (!activeConnection && !apiKey)}>
          {!activeConnection ? <Plus /> : null}{disabled ? 'Saving…' : !activeConnection ? providerId ? 'Add API key' : 'Create provider' : !activeConnection.enabled && enabled ? 'Enable API key' : activeConnection.enabled && !enabled ? 'Review disable' : 'Save changes'}
        </Button>
      </div>
    </form>
  </section>;
}
