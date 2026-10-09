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
import { request, defaultApiBase, type Vendor, type VendorAdapter, type VendorWrite } from '../api';

export type VendorCreate = { name: string; adapter: VendorAdapter; api_base: string; api_key: string; enabled: true; create_supplier?: true; supplier_id?: string };

export default function SupplierEditor({ token, initialSupplierId, vendor, disabled, onCreate, onSave }: {
  token: string;
  initialSupplierId?: string | null;
  vendor: Vendor | null;
  disabled: boolean;
  onCreate: (input: VendorCreate) => Promise<void>;
  onSave: (input: VendorWrite) => Promise<void>;
}) {
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? '');
  const [supplierError, setSupplierError] = useState('');
  const [supplierLoading, setSupplierLoading] = useState(!vendor);
  const [supplierRetry, setSupplierRetry] = useState(0);
  useEffect(() => {
    if (vendor) return;
    const controller = new AbortController();
    setSupplierLoading(true);
    setSupplierError('');
    void request<{ data: Array<{ id: string; name: string }> }>(token, '/admin/v1/providers', 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setSuppliers(result.data); })
      .catch(() => { if (!controller.signal.aborted) setSupplierError('Supplier list could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setSupplierLoading(false); });
    return () => controller.abort();
  }, [token, vendor?.id, supplierRetry]);
  const selectedSupplier = suppliers.find(supplier => supplier.id === supplierId);
  const ownershipUnavailable = !vendor && Boolean(supplierId) && (supplierLoading || Boolean(supplierError) || !selectedSupplier);
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
    if (disabled || ownershipUnavailable || !name.trim() || !apiBase.trim()) return;
    if (!vendor) {
      if (!apiKey) return;
      await onCreate({ name: name.trim(), adapter, api_base: apiBase.trim(), api_key: apiKey, enabled: true, ...(supplierId ? { supplier_id: supplierId } : { create_supplier: true }) });
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

  const title = vendor ? vendor.name : 'Configure API access';
  return <section className={'panel vendor-editor' + (vendor && vendor.enabled ? ' is-enabled' : '')} aria-labelledby="vendor-editor-title">
    <div className="vendor-editor-heading">
      <span className="vendor-editor-mark"><Router size={18} /></span>
      <div className="vendor-editor-title-copy">
        <p className="eyebrow">{vendor ? 'API KEY' : 'NEW API KEY'}</p>
        <h2 id="vendor-editor-title">{title}</h2>
        <p>{vendor ? `Revision ${vendor.revision} · ${vendor.has_credential ? 'Credential stored' : 'No credential stored'}` : 'Supplier identity stays visible; the stored credential is never shown again.'}</p>
      </div>
      {vendor && <span className={'vendor-status-badge' + (vendor.enabled ? ' is-enabled' : '')}>{vendor.enabled ? 'Enabled' : 'Disabled'}</span>}
    </div>

    <form className="vendor-editor-form" onSubmit={submit}>
      <div className="vendor-editor-fields">
        {!vendor && <div className="space-y-2">
          <Label htmlFor="vendor-supplier">Supplier</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button id="vendor-supplier" type="button" variant="outline" className="w-full justify-between font-normal" disabled={disabled || Boolean(initialSupplierId) || supplierLoading || Boolean(supplierError)}>{supplierLoading ? 'Loading suppliers…' : supplierId ? selectedSupplier?.name ?? 'Supplier unavailable' : 'New supplier'}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={supplierId} onValueChange={setSupplierId}>
              <DropdownMenuRadioItem value="">New supplier</DropdownMenuRadioItem>
              {suppliers.map(supplier => <DropdownMenuRadioItem key={supplier.id} value={supplier.id}>{supplier.name}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup></DropdownMenuContent>
          </DropdownMenu>
          {supplierError && <div role="alert">{supplierError}<Button type="button" variant="ghost" size="sm" onClick={() => setSupplierRetry(value => value + 1)}>Retry</Button></div>}
        </div>}
        <Label htmlFor="vendor-name">{supplierId || vendor ? 'API key name' : 'Supplier name'}
          <Input id="vendor-name" value={name} onChange={event => setName(event.target.value)} maxLength={100} autoComplete="off" placeholder="e.g. Primary inference" required disabled={disabled} />
        </Label>
        <Label htmlFor="vendor-adapter">Upstream API service
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button id="vendor-adapter" type="button" variant="outline" className="w-full justify-between font-normal" disabled={disabled || Boolean(vendor)}>{adapter === 'openrouter' ? 'OpenRouter' : 'OpenAI'}<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={adapter} onValueChange={value => changeAdapter(value as VendorAdapter)}>
              <DropdownMenuRadioItem value="openrouter">OpenRouter</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="openai">OpenAI</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup></DropdownMenuContent>
          </DropdownMenu>
        </Label>
        <Label htmlFor="vendor-api-base">API base URL
          <Input id="vendor-api-base" type="url" inputMode="url" value={apiBase} onChange={event => setApiBase(event.target.value)} maxLength={2048} autoComplete="url" placeholder="https://openrouter.ai/api/v1" required disabled={disabled} />
        </Label>
        <Label htmlFor="vendor-api-key">{vendor ? 'Replace supplier API key (optional)' : 'Supplier API key'}
          <Input id="vendor-api-key" type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="new-password" spellCheck={false} placeholder={vendor ? 'Leave blank to keep the current credential' : 'Paste a supplier key'} required={!vendor} disabled={disabled} />
        </Label>
      </div>

      <div className="vendor-editor-notes">
        <span><ShieldCheck size={15} />Public HTTPS or localhost HTTP only.</span>
        <span><KeyRound size={15} />Credentials are stored encrypted and never shown again.</span>
      </div>

      {vendor && <label className="vendor-enabled-toggle">
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
        <p>{vendor ? 'Upstream API service cannot be changed after creation.' : 'Use a public HTTPS URL. Loopback HTTP works for local development.'}</p>
        <Button type="submit" disabled={disabled || ownershipUnavailable || !name.trim() || !apiBase.trim() || (!vendor && !apiKey)}>
          {!vendor ? <Plus /> : null}{disabled ? 'Saving…' : !vendor ? supplierId ? 'Add API key' : 'Create supplier' : !vendor.enabled && enabled ? 'Enable supplier' : vendor.enabled && !enabled ? 'Review disable' : 'Save changes'}
        </Button>
      </div>
    </form>
  </section>;
}
