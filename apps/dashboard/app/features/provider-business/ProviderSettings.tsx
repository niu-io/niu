import { useLocale as useUILocale } from '@/shell/ui-locale';
import IntegrationSettings from '@/features/providers/components/IntegrationSettings';
import { useProviderParams } from '@/shell/provider-route';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { providerLogoPresets, providerLogoSource, providerLogoIsMonochrome } from '@/features/providers/provider-logos';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { IconPlugConnected } from '@tabler/icons-react';
import { useDashboardContext } from '@/shell/dashboard-context';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cachedGet, peekCachedGet, ProviderRequestError, request } from '@/features/providers/api';

type Profile = { name: string; description: string; website_url: string; logo_url: string; revision: number };
const empty = { name: '', description: '', website_url: '', logo_url: '' };
const conflictMessage = 'These details changed since you opened this page. Reload the saved details before saving again.';
export default function ProviderSettings() {
  const { t: uiT } = useUILocale();
  const { providerId, supplierId } = useProviderParams();
  const activeProviderId = providerId ?? supplierId ?? '';
  const { token, session } = useDashboardContext();
  const canManageIntegration = Boolean(session?.permissions?.platform_admin || (session?.kind === 'installation' && session.permissions?.manage_operators !== false));
  const path = `/api/v1/admin/providers/${encodeURIComponent(activeProviderId)}`;
  const initialProfile = token && activeProviderId ? peekCachedGet<{ data: Profile }>(token, path)?.data ?? null : null;
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [draft, setDraft] = useState(() => initialProfile ? { name: initialProfile.name, description: initialProfile.description, website_url: initialProfile.website_url, logo_url: initialProfile.logo_url } : empty);
  const nameInput = useRef<HTMLInputElement>(null);
  const editBtnRef = useRef<HTMLButtonElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(token && !initialProfile));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);
  const lastReload = useRef(0);
  const [brokenLogo, setBrokenLogo] = useState(false);
  const [savedLogoBroken, setSavedLogoBroken] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const loadedContext = useRef(initialProfile ? `${token}\0${path}` : '');
  useEffect(() => {
    const controller = new AbortController();
    const force = lastReload.current !== reload;
    lastReload.current = reload;
    const context = `${token}\0${path}`;
    const cached = token ? peekCachedGet<{ data: Profile }>(token, path)?.data ?? null : null;
    if (loadedContext.current !== context) {
      loadedContext.current = context;
      if (cached && !force) {
        setProfile(cached);
        setDraft({ name: cached.name, description: cached.description, website_url: cached.website_url, logo_url: cached.logo_url });
      } else {
        setProfile(null); setDraft(empty);
      }
      setEditOpen(false);
      setConflict(false);
    }
    if (cached && !force) {
      setLoading(false);
    } else if (loadedContext.current !== context || !force) {
      setLoading(true);
    }
    setBusy(false); setError(''); setSaved(false);
    void cachedGet<{ data: Profile }>(token, path, { signal: controller.signal, force }).then(({ data }) => {
      if (!controller.signal.aborted) { setProfile(data); setDraft({ name: data.name, description: data.description, website_url: data.website_url, logo_url: data.logo_url }); setConflict(false); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); pending.current?.abort(); };
  }, [token, path, reload]);
  useEffect(() => setBrokenLogo(false), [draft.logo_url]);
  useEffect(() => setSavedLogoBroken(false), [profile?.logo_url]);
  const dirty = profile && Object.keys(empty).some(key => draft[key as keyof typeof empty].trim() !== profile[key as keyof typeof empty]);
  function change(key: keyof typeof empty, value: string) { setDraft(current => ({ ...current, [key]: value })); setSaved(false); }
  function openEditDialog() {
    if (!profile) return;
    setDraft({ name: profile.name, description: profile.description, website_url: profile.website_url, logo_url: profile.logo_url });
    if (!conflict) setError('');
    setSaved(false);
    setEditOpen(true);
  }
  function closeEditDialog() {
    if (busy || !profile) return;
    setDraft({ name: profile.name, description: profile.description, website_url: profile.website_url, logo_url: profile.logo_url });
    if (!conflict) setError('');
    setEditOpen(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!profile || loading || busy || !dirty || conflict || loadedContext.current !== `${token}\0${path}`) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError(''); setSaved(false);
    try {
      const { data } = await request<{ data: Profile }>(token, path, 'PATCH', { ...draft, expected_revision: profile.revision }, controller.signal);
      if (!controller.signal.aborted) {
        setProfile(data); setDraft({ name: data.name, description: data.description, website_url: data.website_url, logo_url: data.logo_url });
        setEditOpen(false);
        setSaved(true);
        window.dispatchEvent(new Event('niu:provider-profile-updated'));
        window.dispatchEvent(new Event('niu:supplier-profile-updated'));
      }
    } catch (reason) { if (!controller.signal.aborted) {
      const stale = reason instanceof ProviderRequestError && reason.status === 409;
      if (stale) setConflict(true);
      setError(stale ? conflictMessage : reason instanceof Error ? reason.message : 'Could not save provider details.');
    } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className="supplier-settings space-y-4" aria-label={uiT("Business profile")}>
    {loading && !profile ? <FormSectionSkeleton fields={3} label={uiT("Loading provider details…")} /> : !profile ? <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{uiT(error)}</p><Button variant="outline" size="sm" onClick={() => setReload(value => value + 1)}>{uiT("Retry")}</Button></div> :
      <div className="space-y-4 rounded-[var(--radius-panel)] bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-[15px] font-semibold">{uiT("Business profile")}</h2>
            <p className="text-sm text-muted-foreground">{uiT("Manage this provider’s identity, website, and default upstream integration.")}</p>
          </div>
          <Button ref={editBtnRef} type="button" variant="outline" size="sm" onClick={openEditDialog}>
            {uiT('Edit profile', '编辑资料')}
          </Button>
        </div>
        <div className="flex flex-wrap items-start gap-5">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted" aria-label={uiT("Provider logo preview")}>
            {profile.logo_url && /^https?:\/\//i.test(profile.logo_url) && !savedLogoBroken ? (
              <img src={providerLogoSource(profile.logo_url)} alt={uiT("Provider logo")} className={`size-full object-contain${providerLogoIsMonochrome(profile.logo_url) ? ' dark:invert' : ''}`} referrerPolicy="no-referrer" onError={() => setSavedLogoBroken(true)} />
            ) : (
              <IconPlugConnected className="size-5 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <dl className="grid min-w-0 flex-1 gap-4 text-sm sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{uiT("Name")}</dt>
              <dd className="mt-1 font-medium break-words">{profile.name}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{uiT("Website URL")}</dt>
              <dd className="mt-1 break-all text-muted-foreground">{profile.website_url || uiT('Not set', '未设置')}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{uiT("Description")}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{profile.description || uiT('No description', '暂无描述')}</dd>
            </div>
          </dl>
        </div>
        {saved && <p role="status" className="text-sm text-muted-foreground">{uiT("Provider details saved.")}</p>}
        {canManageIntegration && <IntegrationSettings compact key={`${token}:${activeProviderId}`} token={token} resource="providers" id={activeProviderId} />}
      </div>}
    <Dialog open={editOpen && Boolean(profile)} onOpenChange={open => { if (!open) closeEditDialog(); }}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={event => {
          if (editBtnRef.current?.isConnected) {
            event.preventDefault();
            editBtnRef.current.focus();
          }
        }}
      >
        {profile && (
          <>
            <DialogHeader>
              <DialogTitle>{uiT('Edit profile', '编辑资料')}</DialogTitle>
              <DialogDescription>{uiT("These details identify the provider. API endpoints and credentials are managed in API keys.")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={event => void save(event)} className="space-y-5">
              <fieldset disabled={busy} className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted overflow-hidden" aria-label={uiT("Provider logo preview")}>
                    {draft.logo_url && /^https?:\/\//i.test(draft.logo_url) && !brokenLogo ? <img src={providerLogoSource(draft.logo_url)} alt={uiT("Provider logo")} className={`size-full object-contain${providerLogoIsMonochrome(draft.logo_url) ? ' dark:invert' : ''}`} referrerPolicy="no-referrer" onError={() => setBrokenLogo(true)} /> : <IconPlugConnected className="size-7 text-muted-foreground" aria-hidden="true" />}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Label htmlFor="supplier-logo">{uiT("Logo URL")}</Label>
                    <Input id="supplier-logo" type="url" maxLength={2048} value={draft.logo_url} onChange={event => change('logo_url', event.target.value)} placeholder="https://example.com/logo.png" aria-describedby="supplier-logo-help" />
                    <p id="supplier-logo-help" className="text-xs text-muted-foreground">{uiT("Choose a preset or use a publicly accessible image URL. Leave it empty to use the default logo.")}{brokenLogo ? uiT("The image could not be loaded.") : ''}</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button type="button" variant="outline">{providerLogoPresets.find(preset => preset.url === draft.logo_url)?.name ?? (draft.logo_url ? uiT("Custom logo") : uiT("Default logo"))}<ChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuRadioGroup value={draft.logo_url} onValueChange={value => change('logo_url', value)}>
                      <DropdownMenuRadioItem value=""><IconPlugConnected aria-hidden="true" />{uiT("Default logo")}</DropdownMenuRadioItem>
                      {providerLogoPresets.map(preset => <DropdownMenuRadioItem key={preset.name} value={preset.url}><img src={preset.src} alt="" className={`size-4 object-contain${providerLogoIsMonochrome(preset.url) ? ' dark:invert' : ''}`} />{preset.name}</DropdownMenuRadioItem>)}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="space-y-2"><Label htmlFor="supplier-profile-name">{uiT("Name")}</Label><Input ref={nameInput} id="supplier-profile-name" autoFocus required maxLength={100} value={draft.name} onChange={event => change('name', event.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="supplier-description">{uiT("Description")}</Label><Textarea id="supplier-description" rows={4} maxLength={2000} value={draft.description} onChange={event => change('description', event.target.value)} placeholder={uiT("A short description of the provider and its services.")} /></div>
                <div className="space-y-2"><Label htmlFor="supplier-website">{uiT("Website URL")}</Label><Input id="supplier-website" type="url" maxLength={2048} value={draft.website_url} onChange={event => change('website_url', event.target.value)} placeholder="https://example.com" /></div>
              </fieldset>
              {(error || conflict) && (
                <div className="space-y-2">
                  <p role="alert" className="text-sm text-destructive">{uiT(conflict ? conflictMessage : error)}</p>
                  {conflict && error && error !== conflictMessage && <p role="alert" className="text-sm text-destructive">{uiT(error)}</p>}
                  <Button type="button" variant="outline" size="sm" onClick={() => setReload(value => value + 1)}>{uiT("Reload saved details")}</Button>
                  <p className="text-xs text-muted-foreground">{uiT("Reloading replaces your unsaved changes.")}</p>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={closeEditDialog}>{uiT("Cancel")}</Button>
                <Button type="submit" disabled={busy || conflict || !dirty || !draft.name.trim()}>{busy ? uiT("Saving…") : uiT("Save changes")}</Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  </section>;
}
