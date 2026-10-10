import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { IconChevronDown, IconPalette } from '@tabler/icons-react';
import { useDashboardContext } from '@/app/dashboard-context';
import { brandingTokens, defaultBranding, parseBranding, previewPalette, useBranding, type BrandingConfiguration, type BrandingSettings, type BrandingToken } from '@/app/branding';
import { request, VendorRequestError } from '@/features/vendors/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import defaultLogo from '../../../../../branding/assets/niu-mark.png';

const labels:Record<BrandingToken,string> = {background:'Page background',foreground:'Page text',primary:'Primary', 'primary-foreground':'Primary text',sidebar:'Sidebar background','sidebar-foreground':'Sidebar text',accent:'Accent background','accent-foreground':'Accent text'};
const copy = (value:BrandingSettings):BrandingSettings => ({...value,light:{...value.light},dark:{...value.dark}});
export default function BrandingPage() {
  const {token} = useDashboardContext();
  const branding = useBranding();
  const [search,setSearch] = useSearchParams();
  const tab = search.get('tab') === 'theme' ? 'theme':'branding';
  const [saved,setSaved] = useState<BrandingConfiguration | null>(null);
  const [draft,setDraft] = useState<BrandingSettings>(copy(defaultBranding));
  const [palette,setPalette] = useState<'light'|'dark'>('light');
  const [preview,setPreview] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [reloadNeeded,setReloadNeeded] = useState(false);
  const [notice,setNotice] = useState('');
  const [attempt,setAttempt] = useState(0);
  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved.settings);
  useEffect(()=>{
    const controller = new AbortController(); setError(''); setSaved(null);
    void request<unknown>(token,'/admin/v1/platform/branding','GET',undefined,controller.signal)
      .then(value=>{if (!controller.signal.aborted) {const current=parseBranding(value);setSaved(current);setDraft(copy(current.settings));}})
      .catch(()=>{if (!controller.signal.aborted) setError('Could not load branding settings.');});
    return ()=>controller.abort();
  },[token,attempt]);
  async function save(event:FormEvent) {
    event.preventDefault(); if (!saved || busy || !dirty) return;
    if (!draft.display_name.trim() || draft.display_name !== draft.display_name.trim()) {setError('Enter a display name without leading or trailing spaces.');setReloadNeeded(false);return;}
    setBusy(true);setError('');setNotice('');setReloadNeeded(false);
    try {
      const current = parseBranding(await request(token,'/admin/v1/platform/branding','PUT',{expected_revision:saved.revision,settings:draft}));
      setSaved(current);setDraft(copy(current.settings));branding.update(current);setNotice('Changes saved.');
    } catch (reason) {
      const status = reason instanceof VendorRequestError ? reason.status:0;
      setReloadNeeded(status === 409);
      setError(status === 409 ? 'These settings changed. Reload before saving.' : status === 400 ? 'Check the image limits and text contrast before saving.' : status === 403 ? 'Administrator access is required.' : 'Could not save changes. Try again.');
    }
    finally {setBusy(false);}
  }
  async function image(field:'logo_data_url'|'favicon_data_url',file:File | undefined) {
    if (!file) return;
    const maximum = field === 'logo_data_url' ? 262144:32768;
    if (file.type !== 'image/png' || file.size > maximum) {setError(field === 'logo_data_url' ? 'Choose a PNG logo no larger than 256 KB.':'Choose a square PNG favicon no larger than 32 KB.');return;}
    setError(''); setBusy(true);
    try {
      const value = await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result === 'string' ? resolve(reader.result):reject();reader.onerror=reject;reader.readAsDataURL(file);});
      setDraft(current=>({...current,[field]:value}));setNotice('');
    } catch {setError('Could not read this image. Choose it again.');}
    finally {setBusy(false);}
  }
  const previewColors = previewPalette(draft,palette) as CSSProperties;
  return <section className="max-w-4xl py-5">
    {!saved ? <>{error ? <div role="alert"><p>{error}</p><Button className="mt-3" variant="outline" onClick={()=>setAttempt(value=>value+1)}>Retry</Button></div>:<p role="status">Loading branding settings…</p>}</> : <form onSubmit={event=>void save(event)}>
      <Tabs value={tab} onValueChange={value=>{const next=new URLSearchParams(search);value === 'theme' ? next.set('tab','theme'):next.delete('tab');setSearch(next,{replace:true});}}>
        <div className="flex flex-wrap items-center justify-between gap-3"><TabsList><TabsTrigger value="branding">Branding</TabsTrigger><TabsTrigger value="theme">Theme</TabsTrigger></TabsList><Button type="button" variant="outline" onClick={()=>setPreview(true)}><IconPalette/>Preview</Button></div>
        <TabsContent value="branding" className="space-y-7 pt-6">
          <div className="max-w-lg space-y-2"><Label htmlFor="deployment-name">Display name</Label><Input id="deployment-name" value={draft.display_name} maxLength={80} required disabled={busy} onChange={event=>{setDraft({...draft,display_name:event.target.value});setNotice('');}}/><p className="text-sm text-muted-foreground">Shown on sign-in screens and browser tabs.</p></div>
          {(['logo_data_url','favicon_data_url'] as const).map(field=><div key={field} className="space-y-3"><div><Label htmlFor={field}>{field === 'logo_data_url' ? 'Logo':'Favicon'}</Label><p id={field+'-help'} className="mt-1 text-sm text-muted-foreground">{field === 'logo_data_url' ? 'PNG · up to 1024 × 512 pixels and 256 KB.':'Square PNG · up to 256 × 256 pixels and 32 KB.'}</p></div><div className="flex flex-wrap items-center gap-4"><img className={field === 'logo_data_url' ? 'h-14 w-28 object-contain':'h-10 w-10 object-contain'} src={draft[field] ?? (field === 'favicon_data_url' ? `${import.meta.env.BASE_URL}assets/favicon.ico`:defaultLogo)} alt={field === 'logo_data_url' ? 'Current logo':'Current favicon'}/><div className="min-w-0 max-w-sm flex-1"><Input id={field} type="file" accept="image/png" aria-describedby={field+'-help'} disabled={busy} onChange={event=>{void image(field,event.target.files?.[0]);event.target.value='';}}/></div>{draft[field] && <Button type="button" variant="ghost" disabled={busy} onClick={()=>{setDraft({...draft,[field]:null});setNotice('');}}>Use default</Button>}</div></div>)}
        </TabsContent>
        <TabsContent value="theme" className="space-y-7 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><Label>Default appearance</Label><p className="mt-1 text-sm text-muted-foreground">Applies before sign-in and to members without a saved preference.</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={busy} aria-label="Default appearance">{draft.default_appearance[0].toUpperCase()+draft.default_appearance.slice(1)}<IconChevronDown/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={draft.default_appearance} onValueChange={value=>setDraft({...draft,default_appearance:value as BrandingSettings['default_appearance']})}>{(['system','light','dark'] as const).map(value=><DropdownMenuRadioItem key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
          <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-medium">Colors</h2><p className="mt-1 text-sm text-muted-foreground">Leave blank to inherit NIU.IO. Text pairs need at least 4.5:1 contrast.</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label="Edit color palette">{palette === 'light' ? 'Light':'Dark'}<IconChevronDown/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={palette} onValueChange={value=>setPalette(value as 'light'|'dark')}><DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem><DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div><div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">{brandingTokens.map(key=><div className="space-y-2" key={key}><Label htmlFor={'color-'+key}>{labels[key]}</Label><Input id={'color-'+key} placeholder="Default" maxLength={7} pattern="#[0-9a-fA-F]{6}" disabled={busy} value={draft[palette][key] ?? ''} onChange={event=>{const colors={...draft[palette]};if(event.target.value) colors[key]=event.target.value;else delete colors[key];setDraft({...draft,[palette]:colors});setNotice('');}}/></div>)}</div></div>
        </TabsContent>
      </Tabs>
      {error && <div role="alert" className="mt-5 space-y-2"><p className="text-destructive">{error}</p>{reloadNeeded && <Button type="button" variant="outline" disabled={busy} onClick={()=>{setError('');setNotice('');setAttempt(value=>value+1);}}>Reload saved settings</Button>}</div>}
      {notice && <p role="status" className="mt-5 text-sm">{notice}</p>}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3"><Button type="button" variant="ghost" disabled={busy} onClick={()=>{setDraft(copy(defaultBranding));setNotice('Defaults restored in this draft. Save to apply.');setError('');}}>Reset to NIU.IO defaults</Button><div className="flex gap-2"><Button type="button" variant="outline" disabled={busy || !dirty} onClick={()=>{setDraft(copy(saved.settings));setError('');setNotice('');}}>Discard changes</Button><Button disabled={busy || !dirty}>{busy ? 'Saving…':'Save changes'}</Button></div></div>
    </form>}
    <Dialog open={preview} onOpenChange={setPreview}><DialogContent className="niu-modal max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Appearance preview</DialogTitle><DialogDescription>{dirty ? 'Preview unsaved changes in light and dark appearance before saving.' : 'Preview the saved branding in light and dark appearance.'}</DialogDescription></DialogHeader><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label="Preview appearance">{palette === 'light' ? 'Light':'Dark'}<IconChevronDown/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={palette} onValueChange={value=>setPalette(value as 'light'|'dark')}><DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem><DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu><div className={palette === 'dark' ? 'dark':'light'}><section style={previewColors} className="rounded-[var(--radius-panel)] bg-background p-6 text-foreground"><div className="flex items-center gap-3"><img src={draft.logo_data_url ?? defaultLogo} alt="" className="h-10 w-14 shrink-0 object-contain"/><strong className="min-w-0 break-words">{draft.display_name}</strong></div><p className="my-5">Sign in to your dashboard.</p><Button type="button" className="pointer-events-none" tabIndex={-1}>Sign in</Button><div className="mt-5 rounded-[var(--radius-control)] bg-accent p-3 text-accent-foreground">Selected item</div><div className="mt-3 rounded-[var(--radius-control)] bg-sidebar p-3 text-sidebar-foreground">Navigation</div></section></div></DialogContent></Dialog>
  </section>;
}
