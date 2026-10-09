import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { request, type Vendor } from '@/features/vendors/api';

export default function SupplierPropertiesFields({ supplierId, supplierName, token }: {
  supplierId: string; supplierName: string; token: string;
}) {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [endpoint, setEndpoint] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setNotice(''); setVendor(null); setKey('');
    void request<{ data: Vendor[] }>(token, `/admin/v1/vendors?supplier=${encodeURIComponent(supplierId)}`, 'GET', undefined, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        if (result.data.length !== 1) {
          setError(result.data.length ? 'This Supplier has multiple API configurations. Edit them on the Suppliers page.' : 'No API configuration is linked to this Supplier.');
          return;
        }
        setVendor(result.data[0]); setEndpoint(result.data[0].api_base);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load Supplier settings.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [supplierId, token, reload]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!vendor || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request<{ data: Vendor }>(token, `/admin/v1/vendors/${vendor.id}`, 'PUT', {
        name: vendor.name, enabled: vendor.enabled, api_base: endpoint.trim(),
        expected_revision: vendor.revision, ...(key ? { api_key: key } : {}),
      });
      setVendor(result.data); setEndpoint(result.data.api_base); setKey('');
      setNotice('Supplier API settings saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save Supplier settings.');
    } finally { setBusy(false); }
  }
  return <form className="niu-modal-form" onSubmit={event => void save(event)}>
    <Label htmlFor="supplier-property-name">Supplier name<Input id="supplier-property-name" value={supplierName} readOnly /></Label>
    {loading ? <p role="status">Loading Supplier settings…</p> : vendor && <>
      <Label htmlFor="supplier-endpoint">API endpoint<Input id="supplier-endpoint" type="url" required value={endpoint} disabled={busy} onChange={event => setEndpoint(event.target.value)} /></Label>
      <Label htmlFor="supplier-credential">Replace API key (optional)<Input id="supplier-credential" type="password" autoComplete="new-password" placeholder="Leave blank to keep the stored credential" value={key} disabled={busy} onChange={event => setKey(event.target.value)} /></Label>
    </>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="workspace-create-actions">
      {error && <Button type="button" variant="outline" disabled={busy} onClick={() => setReload(value => value + 1)}>Reload settings</Button>}
      {!loading && !vendor && <Button asChild variant="outline"><Link to="/admin/suppliers">Manage Supplier APIs</Link></Button>}
      {vendor && <Button disabled={busy || loading || !endpoint.trim()}>{busy ? 'Saving…' : 'Save changes'}</Button>}
    </div>
  </form>;
}
