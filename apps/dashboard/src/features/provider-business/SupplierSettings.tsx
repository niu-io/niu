import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { IconPlugConnected } from '@tabler/icons-react';
import { useDashboardContext } from '@/app/dashboard-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { VendorRequestError, request } from '@/features/vendors/api';

type Profile = { name: string; description: string; website_url: string; logo_url: string; revision: number };
const empty = { name: '', description: '', website_url: '', logo_url: '' };
export default function SupplierSettings() {
  const { supplierId } = useParams();
  const { token } = useDashboardContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState(empty);
  const nameInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);
  const [brokenLogo, setBrokenLogo] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const path = `/admin/v1/providers/${encodeURIComponent(supplierId ?? '')}`;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setBusy(false); setProfile(null); setError(''); setSaved(false);
    void request<{ data: Profile }>(token, path, 'GET', undefined, controller.signal).then(({ data }) => {
      if (!controller.signal.aborted) { setProfile(data); setDraft({ name: data.name, description: data.description, website_url: data.website_url, logo_url: data.logo_url }); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); pending.current?.abort(); };
  }, [token, path, reload]);
  useEffect(() => setBrokenLogo(false), [draft.logo_url]);
  const dirty = profile && Object.keys(empty).some(key => draft[key as keyof typeof empty].trim() !== profile[key as keyof typeof empty]);
  function change(key: keyof typeof empty, value: string) { setDraft(current => ({ ...current, [key]: value })); setSaved(false); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!profile || busy || !dirty) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError(''); setSaved(false);
    try {
      const { data } = await request<{ data: Profile }>(token, path, 'PATCH', { ...draft, expected_revision: profile.revision }, controller.signal);
      if (!controller.signal.aborted) {
        setProfile(data); setDraft({ name: data.name, description: data.description, website_url: data.website_url, logo_url: data.logo_url }); setSaved(true);
        window.dispatchEvent(new Event('niu:supplier-profile-updated'));
      }
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof VendorRequestError && reason.status === 409 ? 'These details changed since you opened this page. Reload the saved details before saving again.' : reason instanceof Error ? reason.message : 'Could not save supplier details.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className="supplier-settings space-y-8 py-6">
    <div className="supplier-section-heading"><h2>Settings</h2><p>Manage this supplier’s identity and business information.</p></div>
    {loading ? <p role="status">Loading supplier details…</p> : !profile ? <div><p role="alert">{error}</p><Button variant="outline" onClick={() => setReload(value => value + 1)}>Retry</Button></div> :
      <form onSubmit={event => void save(event)} className="max-w-2xl space-y-7">
        <div className="space-y-2"><h3 className="font-medium">Business profile</h3><p className="text-sm text-muted-foreground">These details identify the supplier. API endpoints and credentials are managed in API keys &amp; routes.</p></div>
        <fieldset disabled={busy} className="space-y-6">
          <div className="flex items-start gap-4"><div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted overflow-hidden" aria-label="Supplier logo preview">{draft.logo_url && /^https?:\/\//i.test(draft.logo_url) && !brokenLogo ? <img src={draft.logo_url} alt="Supplier logo" className="size-full object-contain" referrerPolicy="no-referrer" onError={() => setBrokenLogo(true)} /> : <IconPlugConnected className="size-7 text-muted-foreground" aria-hidden="true" />}</div><div className="min-w-0 flex-1 space-y-2"><Label htmlFor="supplier-logo">Logo URL</Label><Input id="supplier-logo" type="url" maxLength={2048} value={draft.logo_url} onChange={event => change('logo_url', event.target.value)} placeholder="https://example.com/logo.png" aria-describedby="supplier-logo-help" /><p id="supplier-logo-help" className="text-sm text-muted-foreground">Use a publicly accessible image URL.{brokenLogo ? ' The image could not be loaded.' : ''}</p></div></div>
          <div className="space-y-2"><Label htmlFor="supplier-profile-name">Name</Label><Input ref={nameInput} id="supplier-profile-name" required maxLength={100} value={draft.name} onChange={event => change('name', event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="supplier-description">Description</Label><Textarea id="supplier-description" rows={4} maxLength={2000} value={draft.description} onChange={event => change('description', event.target.value)} placeholder="A short description of the supplier and its services." /></div>
          <div className="space-y-2"><Label htmlFor="supplier-website">Website URL</Label><Input id="supplier-website" type="url" maxLength={2048} value={draft.website_url} onChange={event => change('website_url', event.target.value)} placeholder="https://example.com" /></div>
        </fieldset>
        {error && <div className="space-y-2"><p role="alert" className="text-destructive">{error}</p><Button type="button" variant="outline" onClick={() => setReload(value => value + 1)}>Reload saved details</Button><p className="text-sm text-muted-foreground">Reloading replaces your unsaved changes.</p></div>}
        <div className="flex flex-wrap items-center gap-4">{dirty && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft({ name: profile.name, description: profile.description, website_url: profile.website_url, logo_url: profile.logo_url }); setError(''); setSaved(false); nameInput.current?.focus(); }}>Cancel</Button>}<Button disabled={busy || !dirty || !draft.name.trim()}>{busy ? 'Saving…' : 'Save changes'}</Button>{saved && <p role="status" className="text-sm text-muted-foreground">Supplier details saved.</p>}</div>
      </form>}
  </section>;
}
