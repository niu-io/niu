import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Plus, Router, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { defaultApiBase, type Vendor, type VendorAdapter, type VendorWrite } from '../api';

export type VendorCreate = { name: string; adapter: VendorAdapter; api_base: string; api_key: string; enabled: true };

export default function VendorEditor({ vendor, disabled, onCreate, onSave }: {
  vendor: Vendor | null;
  disabled: boolean;
  onCreate: (input: VendorCreate) => Promise<void>;
  onSave: (input: VendorWrite) => Promise<void>;
}) {
  const [name, setName] = useState(vendor?.name ?? '');
  const [adapter, setAdapter] = useState<VendorAdapter>(vendor?.adapter ?? 'openrouter');
  const [apiBase, setApiBase] = useState(vendor?.api_base ?? defaultApiBase('openrouter'));
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(vendor?.enabled ?? true);
  const [confirmDisable, setConfirmDisable] = useState(false);

  useEffect(() => {
    setName(vendor?.name ?? '');
    setAdapter(vendor?.adapter ?? 'openrouter');
    setApiBase(vendor?.api_base ?? defaultApiBase('openrouter'));
    setApiKey('');
    setEnabled(vendor?.enabled ?? true);
    setConfirmDisable(false);
  }, [vendor?.id, vendor?.revision]);

  function changeAdapter(next: VendorAdapter) {
    setApiBase(current => current === defaultApiBase(adapter) ? defaultApiBase(next) : current);
    setAdapter(next);
  }

  async function save(nextEnabled = enabled) {
    if (disabled || !name.trim() || !apiBase.trim()) return;
    if (!vendor) {
      if (!apiKey) return;
      await onCreate({ name: name.trim(), adapter, api_base: apiBase.trim(), api_key: apiKey, enabled: true });
      setName('');
      setApiKey('');
      return;
    }
    await onSave({
      name: name.trim(),
      api_base: apiBase.trim(),
      enabled: nextEnabled,
      ...(apiKey ? { api_key: apiKey } : {}),
      expected_revision: vendor.revision,
    });
    setApiKey('');
    setConfirmDisable(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (vendor?.enabled && !enabled) {
      setConfirmDisable(true);
      return;
    }
    void save().catch(() => {});
  }

  const title = vendor ? vendor.name : 'Connect a provider';
  return <section className={'panel vendor-editor' + (vendor && vendor.enabled ? ' is-enabled' : '')} aria-labelledby="vendor-editor-title">
    <div className="vendor-editor-heading">
      <span className="vendor-editor-mark"><Router size={18} /></span>
      <div className="vendor-editor-title-copy">
        <p className="eyebrow">{vendor ? 'PROVIDER CONNECTION' : 'NEW CONNECTION'}</p>
        <h2 id="vendor-editor-title">{title}</h2>
        <p>{vendor ? `Revision ${vendor.revision} · ${vendor.has_credential ? 'Credential stored' : 'No credential stored'}` : 'Provider identity stays visible; the stored credential is never shown again.'}</p>
      </div>
      {vendor && <span className={'vendor-status-badge' + (vendor.enabled ? ' is-enabled' : '')}>{vendor.enabled ? 'Enabled' : 'Disabled'}</span>}
    </div>

    <form className="vendor-editor-form" onSubmit={submit}>
      <div className="vendor-editor-fields">
        <Label htmlFor="vendor-name">Vendor name
          <Input id="vendor-name" value={name} onChange={event => setName(event.target.value)} maxLength={100} autoComplete="off" placeholder="e.g. Primary inference" required disabled={disabled} />
        </Label>
        <Label htmlFor="vendor-adapter">Provider
          <NativeSelect id="vendor-adapter" value={adapter} disabled={disabled || Boolean(vendor)} onChange={event => changeAdapter(event.target.value as VendorAdapter)}>
            <NativeSelectOption value="openrouter">OpenRouter</NativeSelectOption>
            <NativeSelectOption value="openai">OpenAI</NativeSelectOption>
          </NativeSelect>
        </Label>
        <Label htmlFor="vendor-api-base">API base URL
          <Input id="vendor-api-base" type="url" inputMode="url" value={apiBase} onChange={event => setApiBase(event.target.value)} maxLength={2048} autoComplete="url" placeholder="https://openrouter.ai/api/v1" required disabled={disabled} />
        </Label>
        <Label htmlFor="vendor-api-key">{vendor ? 'Replace provider API key (optional)' : 'Provider API key'}
          <Input id="vendor-api-key" type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="new-password" spellCheck={false} placeholder={vendor ? 'Leave blank to keep the current credential' : 'Paste a provider key'} required={!vendor} disabled={disabled} />
        </Label>
      </div>

      <div className="vendor-editor-notes">
        <span><ShieldCheck size={15} />HTTPS is accepted; HTTP is limited to localhost or loopback.</span>
        <span><KeyRound size={15} />Credentials are stored encrypted and never shown again.</span>
      </div>

      {vendor && <label className="vendor-enabled-toggle">
        <input type="checkbox" checked={enabled} disabled={disabled} onChange={event => { setEnabled(event.target.checked); setConfirmDisable(false); }} />
        <span><strong>Enabled for inference</strong><small>Disabled connections stay available for audit and can be enabled again.</small></span>
      </label>}

      {confirmDisable && <div className="vendor-confirm-disable" role="alertdialog" aria-labelledby="vendor-disable-title">
        <div><strong id="vendor-disable-title">Disable this vendor?</strong><p>Its model routes will stop receiving new requests.</p></div>
        <div className="vendor-confirm-actions">
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setConfirmDisable(false)}>Keep enabled</Button>
          <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={() => void save(false).catch(() => {})}>{disabled ? 'Saving…' : 'Confirm disable'}</Button>
        </div>
      </div>}

      <div className="vendor-editor-footer">
        <p>{vendor ? 'Provider type cannot be changed after creation.' : 'Use an HTTPS provider URL. A loopback HTTP URL is accepted for local gateways.'}</p>
        <Button type="submit" disabled={disabled || !name.trim() || !apiBase.trim() || (!vendor && !apiKey)}>
          {!vendor ? <Plus /> : null}{disabled ? 'Saving…' : !vendor ? 'Create vendor' : !vendor.enabled && enabled ? 'Enable vendor' : vendor.enabled && !enabled ? 'Review disable' : 'Save changes'}
        </Button>
      </div>
    </form>
  </section>;
}
