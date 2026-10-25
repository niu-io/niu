import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ProviderRequestError, request, integrationLabels, type ProviderIntegration, type ProviderIntegrationType } from '../api';

/** Niu's revision-checked Provider default and connection inheritance workflow. */
export default function IntegrationSettings({ token, resource, id, onSaved }: {
  token: string; resource: 'providers' | 'vendors'; id: string; onSaved?: () => void;
}) {
  const controlId = useId();
  const connection = resource === 'vendors';
  const path = `/api/v1/${resource}/${encodeURIComponent(id)}/integration`;
  const [current, setCurrent] = useState<ProviderIntegration | null>(null);
  const [selection, setSelection] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [reload, setReload] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setCurrent(null); setError(''); setSaved(false); setBusy(false);
    void request<{ data: ProviderIntegration }>(token, path, 'GET', undefined, controller.signal)
      .then(({ data }) => { if (!controller.signal.aborted) { setCurrent(data); setSelection(data.integration_type ?? ''); setNeedsReload(false); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load integration.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); pending.current?.abort(); pending.current = null; };
  }, [token, path, reload]);
  const dirty = current !== null && selection !== (current.integration_type ?? '');
  async function save() {
    if (!current || !dirty || loading || pending.current || needsReload) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(''); setSaved(false);
    try {
      const { data } = await request<{ data: ProviderIntegration }>(token, path, 'PUT', {
        integration_type: selection || null, expected_revision: current.revision,
      }, controller.signal);
      if (!controller.signal.aborted) {
        setCurrent(data); setSelection(data.integration_type ?? ''); setSaved(true); onSaved?.();
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        setNeedsReload(true);
        setError(reason instanceof ProviderRequestError && reason.status === 409
          ? 'This integration changed elsewhere. Reload the saved integration before saving again.'
          : 'The save could not be confirmed. Reload the saved integration before retrying.');
      }
    } finally { if (!controller.signal.aborted) { pending.current = null; setBusy(false); } }
  }
  return <section className={connection ? "mt-6 space-y-4" : "space-y-4"} aria-labelledby={`${controlId}-heading`}>
    <div className="space-y-1"><h3 id={`${controlId}-heading`} className="font-medium">{connection ? 'Connection integration' : 'Default integration'}</h3>
      <p className="text-sm text-muted-foreground">{connection ? 'Use the Provider default or choose an integration for this API key.' : 'Choose the upstream service used by connections that inherit this Provider default.'} API format, endpoint and credentials are configured separately.</p></div>
    {loading ? <p role="status">Loading integration…</p> : current && <>
      <div className="space-y-2"><Label htmlFor={controlId}>Integration</Label>
        <DropdownMenu><DropdownMenuTrigger asChild><Button id={controlId} type="button" variant="outline" className="w-full sm:w-72 justify-between font-normal" disabled={busy || needsReload}>
          {selection ? integrationLabels[selection as ProviderIntegrationType] : connection ? 'Use Provider default' : 'Choose an integration'}<ChevronDown aria-hidden="true" />
        </Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
          <DropdownMenuRadioGroup value={selection} onValueChange={value => { setSelection(value); setSaved(false); }}>
            {connection && <DropdownMenuRadioItem value="">Use Provider default</DropdownMenuRadioItem>}
            {Object.entries(integrationLabels).map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent></DropdownMenu>
        <p className="text-sm text-muted-foreground">Saved integration: {integrationLabels[current.effective_type]} · {current.source === 'connection' ? 'Connection override' : current.source === 'provider' ? connection ? 'Inherited from Provider' : 'Provider default' : 'Not configured; manual setup available'}.</p>
      </div>
      <p className="text-sm text-muted-foreground">{current.effective_type === 'openrouter' ? 'Suggested API base: https://openrouter.ai/api/v1. You can edit the endpoint in the API key configuration.' : current.effective_type === 'newapi' || current.effective_type === 'litellm' ? 'Use your instance’s API base URL, usually ending in /v1. Configure it in the API key settings; no public endpoint is assumed.' : 'Configure the API base URL and model mappings manually in the API key settings.'}</p>
      <div className="flex flex-wrap items-center gap-3"><Button type="button" disabled={busy || needsReload || !dirty || (!connection && !selection)} onClick={() => void save()}>{busy ? 'Saving…' : 'Save integration'}</Button>
        {dirty && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setSelection(current.integration_type ?? ''); setSaved(false); }}>Cancel</Button>}
        {saved && <p role="status" className="text-sm text-muted-foreground">Integration saved.</p>}
      </div>
    </>}
    {error && <div className="space-y-2"><p role="alert" className="text-destructive">{error}</p><Button type="button" variant="outline" disabled={busy} onClick={() => setReload(value => value + 1)}>Reload saved integration</Button><p className="text-sm text-muted-foreground">Reloading replaces your unsaved integration choice.</p></div>}
  </section>;
}
