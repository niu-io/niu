import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cachedGet, gatewayIntegrationTypes, integrationLabels, isBuiltinBrandIntegration, peekCachedGet, ProviderRequestError, request, type ProviderIntegration, type ProviderIntegrationType } from '../api';

/** Niu's revision-checked Provider default and connection inheritance workflow. */
export default function IntegrationSettings({ token, resource, id, providerSlug, compact = false, onSaved }: {
  token: string; resource: 'providers' | 'vendors'; id: string; providerSlug?: string | null; compact?: boolean; onSaved?: () => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const controlId = useId();
  const editBtnRef = useRef<HTMLButtonElement>(null);
  const connection = resource === 'vendors';
  const path = resource === 'vendors'
    ? `/api/v1/admin/providers/connections/${encodeURIComponent(id)}/integration`
    : `/api/v1/admin/providers/${encodeURIComponent(id)}/integration`;
  const initial = token ? peekCachedGet<{ data: ProviderIntegration }>(token, path)?.data ?? null : null;
  const [current, setCurrent] = useState<ProviderIntegration | null>(initial);
  const [selection, setSelection] = useState(initial?.integration_type ?? '');
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(token && !initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [reload, setReload] = useState(0);
  const lastReload = useRef(0);
  const loadedContext = useRef(initial ? `${token}\0${path}` : '');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const force = lastReload.current !== reload;
    lastReload.current = reload;
    const context = `${token}\0${path}`;
    const cached = token ? peekCachedGet<{ data: ProviderIntegration }>(token, path)?.data ?? null : null;
    if (loadedContext.current !== context) {
      loadedContext.current = context;
      setEditOpen(false);
      if (cached && !force) {
        setCurrent(cached); setSelection(cached.integration_type ?? ''); setNeedsReload(false);
      } else {
        setCurrent(null);
      }
    }
    if (cached && !force) {
      setLoading(false);
    } else if (!force || !current) {
      setLoading(true);
    }
    setError(''); setSaved(false); setBusy(false);
    void cachedGet<{ data: ProviderIntegration }>(token, path, { signal: controller.signal, force })
      .then(({ data }) => { if (!controller.signal.aborted) { setCurrent(data); setSelection(data.integration_type ?? ''); setNeedsReload(false); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load integration.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); pending.current?.abort(); pending.current = null; };
  }, [token, path, reload]);

  const normalizedSlug = providerSlug?.trim().toLowerCase() ?? '';
  const lockedBrand = !connection
    ? isBuiltinBrandIntegration(normalizedSlug)
      ? normalizedSlug
      : !normalizedSlug && current?.source === 'provider' && isBuiltinBrandIntegration(current.effective_type)
        ? current.effective_type
        : null
    : null;
  const brandMismatch = Boolean(
    lockedBrand && current && current.source === 'provider' && current.effective_type !== lockedBrand,
  );

  const dirty = current !== null && selection !== (current.integration_type ?? '');
  async function saveType(nextType: string | null) {
    if (!current || loading || pending.current || needsReload) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(''); setSaved(false);
    try {
      const { data } = await request<{ data: ProviderIntegration }>(token, path, 'PUT', {
        integration_type: nextType, expected_revision: current.revision,
      }, controller.signal);
      if (!controller.signal.aborted) {
        setCurrent(data); setSelection(data.integration_type ?? ''); setEditOpen(false); setSaved(true); onSaved?.();
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
  async function save() {
    if (!dirty) return;
    await saveType(selection || null);
  }

  const editableIntegrationChoices: ProviderIntegrationType[] = lockedBrand
    ? [lockedBrand]
    : gatewayIntegrationTypes;

  const integrationControls = current && (
    <>
      <div className="space-y-2">
        <Label htmlFor={controlId}>{uiT("Integration")}</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button id={controlId} type="button" variant="outline" className="w-full sm:w-72 justify-between font-normal" disabled={busy || needsReload}>
              {selection ? integrationLabels[selection as ProviderIntegrationType] : connection ? uiT("Use Provider default") : uiT("Choose an integration")}
              <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
            <DropdownMenuRadioGroup value={selection} onValueChange={value => { setSelection(value); setSaved(false); }}>
              {connection && <DropdownMenuRadioItem value="">{uiT("Use Provider default")}</DropdownMenuRadioItem>}
              {editableIntegrationChoices.map(value => <DropdownMenuRadioItem key={value} value={value}>{integrationLabels[value]}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );

  const guidanceText = current && (
    <p className="text-sm text-muted-foreground">
      {current.effective_type === 'openrouter'
        ? uiT("Suggested API base: https://openrouter.ai/api/v1. You can edit the endpoint in the API key configuration.")
        : current.effective_type === 'newapi' || current.effective_type === 'litellm'
          ? uiT("Use your instance’s API base URL, usually ending in /v1. Configure it in the API key settings; no public endpoint is assumed.")
          : uiT("Configure the API base URL and model mappings manually in the API key settings.")}
    </p>
  );

  // When rendered inside the API key connection modal (`resource === 'vendors'`), keep controls inline to avoid nested modals.
  if (connection) {
    return <section className="mt-6 space-y-4" aria-labelledby={`${controlId}-heading`}>
      <div className="space-y-1"><h3 id={`${controlId}-heading`} className="font-medium">{uiT("Connection integration")}</h3>
        <p className="text-sm text-muted-foreground">{uiT("Use the Provider default or choose an integration for this API key.")}{" "}{uiT("API format, endpoint and credentials are configured separately.")}</p></div>
      {loading && !current ? <FormSectionSkeleton fields={2} label={uiT("Loading integration…")} /> : current && <>
        {integrationControls}
        <p className="text-sm text-muted-foreground">{uiT("Saved integration:")}{" "}{integrationLabels[current.effective_type]} · {current.source === 'connection' ? uiT("Connection override") : current.source === 'provider' ? uiT("Inherited from Provider") : uiT("Not configured; manual setup available")}.</p>
        {guidanceText}
        <div className="flex flex-wrap items-center gap-3"><Button type="button" disabled={busy || needsReload || !dirty} onClick={() => void save()}>{busy ? uiT("Saving…") : uiT("Save integration")}</Button>
          {dirty && <Button type="button" variant="outline" disabled={busy} onClick={() => { setSelection(current.integration_type ?? ''); setSaved(false); }}>{uiT("Cancel")}</Button>}
          {saved && <p role="status" className="text-sm text-muted-foreground">{uiT("Integration saved.")}</p>}
        </div>
      </>}
      {error && <div className="space-y-2"><p role="alert" className="text-destructive">{error}</p><Button type="button" variant="outline" disabled={busy} onClick={() => setReload(value => value + 1)}>{uiT("Reload saved integration")}</Button><p className="text-sm text-muted-foreground">{uiT("Reloading replaces your unsaved integration choice.")}</p></div>}
    </section>;
  }

  const displayedIntegrationSummary = current
    ? lockedBrand && !brandMismatch
      ? `${integrationLabels[lockedBrand]} · ${uiT("Built-in preset", "内置预设")}`
      : `${integrationLabels[current.effective_type]} · ${current.source === 'provider' ? uiT("Provider default") : uiT("Not configured; manual setup available")}`
    : '';

  return <section className={compact ? 'border-t border-border/60 pt-4 space-y-3' : 'space-y-4'} aria-labelledby={`${controlId}-heading`}>
    {loading && !current ? <FormSectionSkeleton fields={2} label={uiT("Loading integration…")} /> : !current ? (
      error && <div className="space-y-2"><p role="alert" className="text-destructive">{error}</p><Button type="button" variant="outline" disabled={busy} onClick={() => setReload(value => value + 1)}>{uiT("Reload saved integration")}</Button></div>
    ) : compact ? (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span id={`${controlId}-heading`} className="text-xs text-muted-foreground">{uiT("Default integration")}</span>
            <span className="font-medium">{displayedIntegrationSummary}</span>
          </div>
          {saved && <p role="status" className="text-xs text-muted-foreground">{uiT("Integration saved.")}</p>}
          {error && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <p role="alert" className="text-xs text-destructive">{error}</p>
              {needsReload && (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setReload(value => value + 1)}>
                  {uiT("Reload saved integration")}
                </Button>
              )}
            </div>
          )}
        </div>
        {lockedBrand ? (
          brandMismatch ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || needsReload}
              onClick={() => void saveType(lockedBrand)}
            >
              {busy ? uiT("Saving…") : uiF("Restore {0} default", [integrationLabels[lockedBrand]])}
            </Button>
          ) : null
        ) : (
          <Button
            ref={editBtnRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSelection(current.integration_type ?? '');
              if (!needsReload) setError('');
              setSaved(false);
              setEditOpen(true);
            }}
          >
            {uiT('Edit integration', '编辑集成')}
          </Button>
        )}
      </div>
    ) : (
      <div className="space-y-4 rounded-[var(--radius-panel)] bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 id={`${controlId}-heading`} className="font-medium">{uiT("Default integration")}</h3>
            <p className="text-sm text-muted-foreground">{uiT("Choose the upstream service used by connections that inherit this Provider default.")}{" "}{uiT("API format, endpoint and credentials are configured separately.")}</p>
          </div>
          {lockedBrand ? (
            brandMismatch ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || needsReload}
                onClick={() => void saveType(lockedBrand)}
              >
                {busy ? uiT("Saving…") : uiF("Restore {0} default", [integrationLabels[lockedBrand]])}
              </Button>
            ) : null
          ) : (
            <Button
              ref={editBtnRef}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSelection(current.integration_type ?? '');
                if (!needsReload) setError('');
                setSaved(false);
                setEditOpen(true);
              }}
            >
              {uiT('Edit integration', '编辑集成')}
            </Button>
          )}
        </div>
        <dl className="text-sm">
          <dt className="text-xs text-muted-foreground">{uiT("Saved integration:")}</dt>
          <dd className="mt-1 font-medium">{displayedIntegrationSummary}</dd>
        </dl>
        {guidanceText}
        {saved && <p role="status" className="text-sm text-muted-foreground">{uiT("Integration saved.")}</p>}
      </div>
    )}
    <Dialog
      open={!lockedBrand && editOpen && Boolean(current)}
      onOpenChange={open => {
        if (!busy && current) {
          setEditOpen(open);
          if (!open) {
            setSelection(current.integration_type ?? '');
            if (!needsReload) setError('');
          }
        }
      }}
    >
      <DialogContent
        onCloseAutoFocus={event => {
          if (editBtnRef.current?.isConnected) {
            event.preventDefault();
            editBtnRef.current.focus();
          }
        }}
      >
        {current && (
          <>
            <DialogHeader>
              <DialogTitle>{uiT('Edit integration', '编辑默认集成')}</DialogTitle>
              <DialogDescription>{uiT("Choose the upstream service used by connections that inherit this Provider default.")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              {integrationControls}
              {guidanceText}
              {error && (
                <div className="space-y-2">
                  <p role="alert" className="text-sm text-destructive">{error}</p>
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setReload(value => value + 1)}>{uiT("Reload saved integration")}</Button>
                  <p className="text-xs text-muted-foreground">{uiT("Reloading replaces your unsaved integration choice.")}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setEditOpen(false);
                  setSelection(current.integration_type ?? '');
                  if (!needsReload) setError('');
                }}
              >
                {uiT("Cancel")}
              </Button>
              <Button type="button" disabled={busy || needsReload || !dirty || !selection} onClick={() => void save()}>
                {busy ? uiT("Saving…") : uiT("Save integration")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  </section>;
}
