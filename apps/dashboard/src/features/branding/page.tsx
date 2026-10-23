import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { IconChevronDown, IconLanguage, IconPalette } from '@tabler/icons-react';
import { useDashboardContext } from '@/app/dashboard-context';
import { brandingTokens, defaultBranding, parseBranding, previewPalette, useBranding, type BrandingConfiguration, type BrandingSettings, type BrandingToken } from '@/app/branding';
import { useLocale, type Locale } from '@/app/locale';
import { request, VendorRequestError } from '@/features/providers/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import defaultLogo from '../../../../../branding/assets/niu-mark.png';

const labelsEn: Record<BrandingToken, string> = {
  background: 'Page background',
  foreground: 'Page text',
  primary: 'Primary',
  'primary-foreground': 'Primary text',
  sidebar: 'Sidebar background',
  'sidebar-foreground': 'Sidebar text',
  accent: 'Accent background',
  'accent-foreground': 'Accent text',
};
const labelsZh: Record<BrandingToken, string> = {
  background: '页面背景色',
  foreground: '页面文本色',
  primary: '主色调',
  'primary-foreground': '主色调文本色',
  sidebar: '侧边栏背景色',
  'sidebar-foreground': '侧边栏文本色',
  accent: '强调背景色',
  'accent-foreground': '强调文本色',
};
const copy = (value: BrandingSettings): BrandingSettings => ({ ...value, light: { ...value.light }, dark: { ...value.dark } });

export default function BrandingPage() {
  const { locale, setLocale, isZh, t } = useLocale();
  const { token } = useDashboardContext();
  const branding = useBranding();
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') === 'theme' ? 'theme' : 'branding';
  const [saved, setSaved] = useState<BrandingConfiguration | null>(null);
  const [draft, setDraft] = useState<BrandingSettings>(copy(defaultBranding));
  const [palette, setPalette] = useState<'light' | 'dark'>('light');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reloadNeeded, setReloadNeeded] = useState(false);
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved.settings);
  useEffect(() => {
    const controller = new AbortController(); setError(''); setSaved(null);
    void request<unknown>(token, '/api/v1/platform/branding', 'GET', undefined, controller.signal)
      .then(value => { if (!controller.signal.aborted) { const current = parseBranding(value); setSaved(current); setDraft(copy(current.settings)); setReloadNeeded(false); } })
      .catch(() => { if (!controller.signal.aborted) setError(t('Could not load branding settings.', '无法加载品牌与主题设置。')); });
    return () => controller.abort();
  }, [token, attempt]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!saved || busy || !dirty || reloadNeeded) return;
    if (!draft.display_name.trim() || draft.display_name !== draft.display_name.trim()) { setError(t('Enter a display name without leading or trailing spaces.', '请输入首尾不含空格的显示名称。')); setReloadNeeded(false); return; }
    setBusy(true); setError(''); setNotice(''); setReloadNeeded(false);
    try {
      const current = parseBranding(await request(token, '/api/v1/platform/branding', 'PUT', { expected_revision: saved.revision, settings: draft }));
      setSaved(current); setDraft(copy(current.settings)); branding.update(current); setNotice(t('Changes saved.', '更改已保存。'));
    } catch (reason) {
      const status = reason instanceof VendorRequestError ? reason.status : 0;
      setReloadNeeded(status === 409);
      setError(status === 409 ? t('These settings changed. Reload before saving.', '这些设置已在其他位置发生变更，请重新加载后再保存。') : status === 400 ? t('Check the image limits and text contrast before saving.', '保存前请检查图片尺寸限制与文本对比度。') : status === 403 ? t('Administrator access is required.', '需要管理员访问权限。') : t('Could not save changes. Try again.', '无法保存更改，请重试。'));
    }
    finally { setBusy(false); }
  }
  async function image(field: 'logo_data_url' | 'favicon_data_url', file: File | undefined) {
    if (!file) return;
    const maximum = field === 'logo_data_url' ? 262144 : 32768;
    if (file.type !== 'image/png' || file.size > maximum) { setError(field === 'logo_data_url' ? t('Choose a PNG logo no larger than 256 KB.', '请选择不超过 256 KB 的 PNG 标志图片。') : t('Choose a square PNG favicon no larger than 32 KB.', '请选择不超过 32 KB 的正方形 PNG 网站图标。')); return; }
    setError(''); setBusy(true);
    try {
      const value = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(); reader.onerror = reject; reader.readAsDataURL(file); });
      setDraft(current => ({ ...current, [field]: value })); setNotice('');
    } catch { setError(t('Could not read this image. Choose it again.', '无法读取该图片，请重新选择。')); }
    finally { setBusy(false); }
  }
  const previewColors = previewPalette(draft, palette) as CSSProperties;
  const defaultAppearanceLabel = draft.default_appearance === 'light' ? t('Light', '浅色') : draft.default_appearance === 'dark' ? t('Dark', '深色') : t('System', '跟随系统');
  return <section className="w-full min-w-0">
    {!saved ? <>{error ? <div role="alert"><p>{error}</p><Button className="mt-3" variant="outline" onClick={() => setAttempt(value => value + 1)}>{t('Retry', '重试')}</Button></div> : <p role="status">{t('Loading branding settings…', '正在加载品牌与主题设置…')}</p>}</> : <form onSubmit={event => void save(event)}>
      <Tabs value={tab} onValueChange={value => { const next = new URLSearchParams(search); value === 'theme' ? next.set('tab', 'theme') : next.delete('tab'); setSearch(next, { replace: true }); }}>
        <div className="flex flex-wrap items-center justify-between gap-3"><TabsList variant="line"><TabsTrigger value="branding">{t('Branding', '品牌标识')}</TabsTrigger><TabsTrigger value="theme">{t('Theme', '主题外观')}</TabsTrigger></TabsList><Button type="button" variant="outline" onClick={() => setPreview(true)}><IconPalette />{t('Preview', '预览')}</Button></div>
        <TabsContent value="branding" className="space-y-7 pt-6">
          <div className="max-w-lg space-y-2"><Label htmlFor="deployment-name">{t('Display name', '显示名称')}</Label><Input id="deployment-name" value={draft.display_name} maxLength={80} required disabled={busy} onChange={event => { setDraft({ ...draft, display_name: event.target.value }); setNotice(''); }} /><p className="text-sm text-muted-foreground">{t('Shown on sign-in screens and browser tabs.', '显示在登录界面与浏览器标签页中。')}</p></div>
          {(['logo_data_url', 'favicon_data_url'] as const).map(field => <div key={field} className="space-y-3"><div><Label htmlFor={field}>{field === 'logo_data_url' ? t('Logo', '品牌标志 (Logo)') : t('Favicon', '网站图标 (Favicon)')}</Label><p id={field + '-help'} className="mt-1 text-sm text-muted-foreground">{field === 'logo_data_url' ? t('PNG · up to 1024 × 512 pixels and 256 KB.', 'PNG 格式 · 最大 1024 × 512 像素且不超过 256 KB。') : t('Square PNG · up to 256 × 256 pixels and 32 KB.', '正方形 PNG 格式 · 最大 256 × 256 像素且不超过 32 KB。')}</p></div><div className="flex flex-wrap items-center gap-4"><img className={field === 'logo_data_url' ? 'h-14 w-28 object-contain' : 'h-10 w-10 object-contain'} src={draft[field] ?? (field === 'favicon_data_url' ? `${import.meta.env.BASE_URL}assets/favicon.ico` : defaultLogo)} alt={field === 'logo_data_url' ? t('Current logo', '当前标志') : t('Current favicon', '当前图标')} /><div className="min-w-0 max-w-sm flex-1"><Input id={field} type="file" accept="image/png" aria-describedby={field + '-help'} disabled={busy} onChange={event => { void image(field, event.target.files?.[0]); event.target.value = ''; }} /></div>{draft[field] && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft({ ...draft, [field]: null }); setNotice(''); }}>{t('Use default', '恢复默认')}</Button>}</div></div>)}
        </TabsContent>
        <TabsContent value="theme" className="space-y-7 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><Label>{t('Default appearance', '默认外观模式')}</Label><p className="mt-1 text-sm text-muted-foreground">{t('Applies before sign-in and to members without a saved preference.', '适用于未登录界面以及尚未保存个人外观偏好的成员。')}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={busy} aria-label="Default appearance">{defaultAppearanceLabel}<IconChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={draft.default_appearance} onValueChange={value => setDraft({ ...draft, default_appearance: value as BrandingSettings['default_appearance'] })}>{(['system', 'light', 'dark'] as const).map(value => <DropdownMenuRadioItem key={value} value={value}>{value === 'light' ? t('Light', '浅色') : value === 'dark' ? t('Dark', '深色') : t('System', '跟随系统')}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><Label>{t('Interface language', '界面语言')}</Label><p className="mt-1 text-sm text-muted-foreground">{t('Choose the display language for this browser across dashboard, catalog, and documentation.', '选择当前浏览器在控制台、模型目录与文档中的显示语言。')}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label="Interface language"><IconLanguage />{locale === 'zh-CN' ? '简体中文' : 'English'}<IconChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={locale} onValueChange={value => setLocale(value as Locale)}><DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem><DropdownMenuRadioItem value="zh-CN">简体中文</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
          <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-medium">{t('Colors', '配色方案')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('Leave blank to inherit Niu. Text pairs need at least 4.5:1 contrast.', '留空则继承 Niu 牛元默认配色。文本与背景需满足至少 4.5:1 的对比度。')}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label="Edit color palette">{palette === 'light' ? t('Light', '浅色') : t('Dark', '深色')}<IconChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={palette} onValueChange={value => setPalette(value as 'light' | 'dark')}><DropdownMenuRadioItem value="light">{t('Light', '浅色')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="dark">{t('Dark', '深色')}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div><div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">{brandingTokens.map(key => <div className="space-y-2" key={key}><Label htmlFor={'color-' + key}>{isZh ? labelsZh[key] : labelsEn[key]}</Label><Input id={'color-' + key} placeholder={t('Default', '默认')} maxLength={7} pattern="#[0-9a-fA-F]{6}" disabled={busy} value={draft[palette][key] ?? ''} onChange={event => { const colors = { ...draft[palette] }; if (event.target.value) colors[key] = event.target.value; else delete colors[key]; setDraft({ ...draft, [palette]: colors }); setNotice(''); }} /></div>)}</div></div>
        </TabsContent>
      </Tabs>
      {(error || reloadNeeded) && <div role="alert" className="mt-5 space-y-2"><p className="text-destructive">{error || t('These settings changed. Reload before saving.', '这些设置已在其他位置发生变更，请重新加载后再保存。')}</p>{reloadNeeded && <Button type="button" variant="outline" disabled={busy} onClick={() => { setError(''); setNotice(''); setAttempt(value => value + 1); }}>{t('Reload saved settings', '重新加载已保存设置')}</Button>}</div>}
      {notice && <p role="status" className="mt-5 text-sm">{notice}</p>}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-6"><Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft(copy(defaultBranding)); setNotice(t('Defaults restored in this draft. Save to apply.', '已在草稿中恢复默认值，点击保存以生效。')); setError(''); }}>{t('Reset to Niu defaults', '恢复 Niu 牛元默认设置')}</Button><div className="flex gap-2"><Button type="button" variant="outline" disabled={busy || !dirty} onClick={() => { setDraft(copy(saved.settings)); setError(''); setNotice(''); }}>{t('Discard changes', '放弃更改')}</Button><Button disabled={busy || !dirty || reloadNeeded}>{busy ? t('Saving…', '保存中…') : t('Save changes', '保存更改')}</Button></div></div>
    </form>}
    <Dialog open={preview} onOpenChange={setPreview}><DialogContent className="niu-modal max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{t('Appearance preview', '外观预览')}</DialogTitle><DialogDescription>{dirty ? t('Preview unsaved changes in light and dark appearance before saving.', '在保存前预览浅色与深色模式下的未保存更改。') : t('Preview the saved branding in light and dark appearance.', '预览浅色与深色模式下已保存的品牌外观。')}</DialogDescription></DialogHeader><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label="Preview appearance">{palette === 'light' ? t('Light', '浅色') : t('Dark', '深色')}<IconChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={palette} onValueChange={value => setPalette(value as 'light' | 'dark')}><DropdownMenuRadioItem value="light">{t('Light', '浅色')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="dark">{t('Dark', '深色')}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu><div className={palette === 'dark' ? 'dark' : 'light'}><section style={previewColors} className="rounded-[var(--radius-panel)] bg-background p-6 text-foreground"><div className="flex items-center gap-3"><img src={draft.logo_data_url ?? defaultLogo} alt="" className="h-10 w-14 shrink-0 object-contain" /><strong className="min-w-0 break-words">{draft.display_name}</strong></div><p className="my-5">{t('Sign in to your dashboard.', '登录您的控制台。')}</p><Button type="button" className="pointer-events-none" tabIndex={-1}>{t('Sign in', '登录')}</Button><div className="mt-5 rounded-[var(--radius-control)] bg-accent p-3 text-accent-foreground">{t('Selected item', '选中项')}</div><div className="mt-3 rounded-[var(--radius-control)] bg-sidebar p-3 text-sidebar-foreground">{t('Navigation', '导航栏')}</div></section></div></DialogContent></Dialog>
  </section>;
}
