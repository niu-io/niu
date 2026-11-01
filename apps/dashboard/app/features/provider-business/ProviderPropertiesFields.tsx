import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cachedGet, peekCachedGet, request, type ProviderConnection } from '@/features/providers/api';

export default function ProviderPropertiesFields({ providerId, supplierId, providerName, supplierName, token }: {
  providerId?: string;
  supplierId?: string;
  providerName?: string;
  supplierName?: string;
  token: string;
}) {
  const { t: uiT } = useUILocale();
  const activeProviderId = providerId ?? supplierId ?? '';
  const activeProviderName = providerName ?? supplierName ?? '';
  const vendorsPath = `/api/v1/vendors?supplier=${encodeURIComponent(activeProviderId)}`;
  const initialVendors = token && activeProviderId ? peekCachedGet<{ data: ProviderConnection[] }>(token, vendorsPath)?.data ?? null : null;
  const initialConnection = initialVendors?.length === 1 ? initialVendors[0] : null;
  const [connection, setConnection] = useState<ProviderConnection | null>(initialConnection);
  const [endpoint, setEndpoint] = useState(initialConnection?.api_base ?? '');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(() => Boolean(token && !initialVendors));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const lastReload = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const force = lastReload.current !== reload;
    lastReload.current = reload;
    const cached = token ? peekCachedGet<{ data: ProviderConnection[] }>(token, vendorsPath)?.data ?? null : null;
    if (cached && !force) {
      setLoading(false);
      if (cached.length === 1) {
        setConnection(cached[0]); setEndpoint(cached[0].api_base);
      } else {
        setConnection(null);
      }
    } else {
      setLoading(true); setConnection(null);
    }
    setError(''); setNotice(''); setKey('');
    void cachedGet<{ data: ProviderConnection[] }>(token, vendorsPath, { signal: controller.signal, force })
      .then(result => {
        if (controller.signal.aborted) return;
        if (result.data.length !== 1) {
          setConnection(null);
          setError(result.data.length ? 'This Provider has multiple API configurations. Edit them on the Providers page.' : 'No API configuration is linked to this Provider.');
          return;
        }
        setConnection(result.data[0]); setEndpoint(result.data[0].api_base);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load Provider settings.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [vendorsPath, token, reload]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!connection || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request<{ data: ProviderConnection }>(token, `/api/v1/vendors/${connection.id}`, 'PUT', {
        name: connection.name, enabled: connection.enabled, api_base: endpoint.trim(),
        expected_revision: connection.revision, ...(key ? { api_key: key } : {}),
      });
      setConnection(result.data); setEndpoint(result.data.api_base); setKey('');
      setNotice('Provider API settings saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save Provider settings.');
    } finally { setBusy(false); }
  }
  return <form className="niu-modal-form" onSubmit={event => void save(event)}>
    <Label htmlFor="supplier-property-name">{uiT("Provider name")}<Input id="supplier-property-name" value={activeProviderName} readOnly /></Label>
    {loading ? <FormSectionSkeleton fields={2} label={uiT("Loading Provider settings…")} /> : connection && <>
      <Label htmlFor="supplier-endpoint">{uiT("API endpoint")}<Input id="supplier-endpoint" type="url" required value={endpoint} disabled={busy} onChange={event => setEndpoint(event.target.value)} /></Label>
      <Label htmlFor="supplier-credential">{uiT("Replace API key (optional)")}<Input id="supplier-credential" type="password" autoComplete="new-password" placeholder={uiT("Leave blank to keep the stored credential")} value={key} disabled={busy} onChange={event => setKey(event.target.value)} /></Label>
    </>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="workspace-create-actions">
      {error && <Button type="button" variant="outline" disabled={busy} onClick={() => setReload(value => value + 1)}>{uiT("Reload settings")}</Button>}
      {!loading && !connection && <Button asChild variant="outline"><Link to="/admin/providers">{uiT("Manage Provider APIs")}</Link></Button>}
      {connection && <Button disabled={busy || loading || !endpoint.trim()}>{busy ? uiT("Saving…") : uiT("Save changes")}</Button>}
    </div>
  </form>;
}
