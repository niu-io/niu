import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { request, type ProviderConnection } from '@/features/providers/api';

export default function ProviderPropertiesFields({ providerId, supplierId, providerName, supplierName, token }: {
  providerId?: string;
  supplierId?: string;
  providerName?: string;
  supplierName?: string;
  token: string;
}) {
  const activeProviderId = providerId ?? supplierId ?? '';
  const activeProviderName = providerName ?? supplierName ?? '';
  const [connection, setConnection] = useState<ProviderConnection | null>(null);
  const [endpoint, setEndpoint] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setNotice(''); setConnection(null); setKey('');
    void request<{ data: ProviderConnection[] }>(token, `/api/v1/vendors?supplier=${encodeURIComponent(activeProviderId)}`, 'GET', undefined, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        if (result.data.length !== 1) {
          setError(result.data.length ? 'This Provider has multiple API configurations. Edit them on the Providers page.' : 'No API configuration is linked to this Provider.');
          return;
        }
        setConnection(result.data[0]); setEndpoint(result.data[0].api_base);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load Provider settings.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activeProviderId, token, reload]);

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
    <Label htmlFor="supplier-property-name">Provider name<Input id="supplier-property-name" value={activeProviderName} readOnly /></Label>
    {loading ? <p role="status">Loading Provider settings…</p> : connection && <>
      <Label htmlFor="supplier-endpoint">API endpoint<Input id="supplier-endpoint" type="url" required value={endpoint} disabled={busy} onChange={event => setEndpoint(event.target.value)} /></Label>
      <Label htmlFor="supplier-credential">Replace API key (optional)<Input id="supplier-credential" type="password" autoComplete="new-password" placeholder="Leave blank to keep the stored credential" value={key} disabled={busy} onChange={event => setKey(event.target.value)} /></Label>
    </>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="workspace-create-actions">
      {error && <Button type="button" variant="outline" disabled={busy} onClick={() => setReload(value => value + 1)}>Reload settings</Button>}
      {!loading && !connection && <Button asChild variant="outline"><Link to="/admin/providers">Manage Provider APIs</Link></Button>}
      {connection && <Button disabled={busy || loading || !endpoint.trim()}>{busy ? 'Saving…' : 'Save changes'}</Button>}
    </div>
  </form>;
}
