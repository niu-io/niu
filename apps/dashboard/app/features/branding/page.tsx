import { translateUI } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { IconChevronDown, IconPalette } from '@tabler/icons-react';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import { fetchQuery, invalidateQueries, peekQuery } from '@/lib/query-cache';
import { useDashboardContext } from '@/shell/dashboard-context';
import { brandingTokens, defaultBranding, parseBranding, previewPalette, useBranding, type BrandingConfiguration, type BrandingSettings, type BrandingToken } from '@/shell/branding';
import { useLocale } from '@/shell/ui-locale';
import { request, VendorRequestError } from '@/features/providers/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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
const defaultTokenHex: Record<'light' | 'dark', Record<BrandingToken, string>> = {
  light: {
    background: '#EEEDEA',
    foreground: '#45352F',
    primary: '#B3471A',
    'primary-foreground': '#FFFBF7',
    sidebar: '#FAF9F7',
    'sidebar-foreground': '#45352F',
    accent: '#E5E0D9',
    'accent-foreground': '#45352F',
  },
  dark: {
    background: '#141312',
    foreground: '#F2E7E0',
    primary: '#B84B1C',
    'primary-foreground': '#FFFBF7',
    sidebar: '#191716',
    'sidebar-foreground': '#EFE2DA',
    accent: '#322D29',
    'accent-foreground': '#F2E7E0',
  },
};
const copy = (value: BrandingSettings): BrandingSettings => ({ ...value, light: { ...value.light }, dark: { ...value.dark } });

export default function BrandingPage() {
  const { t: uiT } = useUILocale();
  const { isZh, t } = useLocale();
  const { token } = useDashboardContext();
  const scope = token || 'public';
  const branding = useBranding();
  const location = useLocation();
  const [search, setSearch] = useSearchParams();
  const embeddedInSettings = location.pathname.startsWith('/admin/settings');
  const tabParam = embeddedInSettings ? 'section' : 'tab';
  const tab = search.get(tabParam) === 'theme' ? 'theme' : 'branding';
  const initialBranding = (() => {
    const raw = peekQuery<unknown>(scope, '/api/v1/admin/branding');
    if (raw === undefined) return null;
    try { return parseBranding(raw); } catch { return null; } // Cached branding is optional; the network read below reports failures.
  })();
  const [saved, setSaved] = useState<BrandingConfiguration | null>(() => initialBranding);
  const [draft, setDraft] = useState<BrandingSettings>(() => initialBranding ? copy(initialBranding.settings) : copy(defaultBranding));
  const [palette, setPalette] = useState<'light' | 'dark'>('light');
  const [editorSection, setEditorSection] = useState<'branding' | 'theme' | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reloadNeeded, setReloadNeeded] = useState(false);
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const editBrandingBtnRef = useRef<HTMLButtonElement>(null);
  const editThemeBtnRef = useRef<HTMLButtonElement>(null);
  const resetBtnRef = useRef<HTMLButtonElement>(null);
  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved.settings);

  useEffect(() => {
    const controller = new AbortController(); setError('');
    const cachedRaw = peekQuery<unknown>(scope, '/api/v1/admin/branding');
    if (cachedRaw !== undefined && attempt === 0) {
      try {
        const current = parseBranding(cachedRaw);
        setSaved(current);
        setDraft(copy(current.settings));
        setReloadNeeded(false);
      } catch {
        setSaved(null);
      }
    } else if (attempt === 0) {
      setSaved(null);
    }
    void fetchQuery(
      scope,
      '/api/v1/admin/branding',
      signal => request<unknown>(token, '/api/v1/admin/branding', 'GET', undefined, signal),
      { signal: controller.signal, force: attempt > 0, awaitRevalidate: true },
    )
      .then(value => { if (!controller.signal.aborted) { const current = parseBranding(value); setSaved(current); setDraft(copy(current.settings)); setReloadNeeded(false); } })
      .catch(() => { if (!controller.signal.aborted) setError(t('Could not load branding settings.', '无法加载品牌与主题设置。')); });
    return () => controller.abort();
  }, [scope, token, attempt]);

  function openEditor(section: 'branding' | 'theme') {
    if (!saved) return;
    setDraft(copy(saved.settings));
    setError('');
    setNotice('');
    setReloadNeeded(false);
    setEditorSection(section);
  }

  function closeEditor() {
    if (busy) return;
    if (saved) setDraft(copy(saved.settings));
    setError('');
    setReloadNeeded(false);
    setEditorSection(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault(); if (!saved || busy || !dirty || reloadNeeded) return;
    if (!draft.display_name.trim() || draft.display_name !== draft.display_name.trim()) { setError(t('Enter a display name without leading or trailing spaces.', '请输入首尾不含空格的显示名称。')); setReloadNeeded(false); return; }
    setBusy(true); setError(''); setNotice(''); setReloadNeeded(false);
    try {
      const current = parseBranding(await request(token, '/api/v1/admin/branding', 'PUT', { expected_revision: saved.revision, settings: draft }));
      invalidateQueries('/api/v1/admin/branding');
      setSaved(current); setDraft(copy(current.settings)); branding.update(current); setEditorSection(null); setNotice(t('Changes saved.', '更改已保存。'));
    } catch (reason) {
      const status = reason instanceof VendorRequestError ? reason.status : 0;
      setReloadNeeded(status === 409);
      setError(status === 409 ? t('These settings changed. Reload before saving.', '这些设置已在其他位置发生变更，请重新加载后再保存。') : status === 400 ? t('Check the image limits and text contrast before saving.', '保存前请检查图片尺寸限制与文本对比度。') : status === 403 ? t('Administrator access is required.', '需要管理员访问权限。') : t('Could not save changes. Try again.', '无法保存更改，请重试。'));
    }
    finally { setBusy(false); }
  }

  async function confirmResetDefaults() {
    if (!saved || busy) return;
    const defaults = copy(defaultBranding);
    setBusy(true); setError(''); setNotice(''); setReloadNeeded(false);
    try {
      const current = parseBranding(await request(token, '/api/v1/admin/branding', 'PUT', { expected_revision: saved.revision, settings: defaults }));
      invalidateQueries('/api/v1/admin/branding');
      setSaved(current); setDraft(copy(current.settings)); branding.update(current); setResetOpen(false); setNotice(t('Reset to Niu defaults.', '已恢复 Niu 默认设置。'));
    } catch (reason) {
      const status = reason instanceof VendorRequestError ? reason.status : 0;
      setReloadNeeded(status === 409);
      setError(status === 409 ? t('These settings changed. Reload before saving.', '这些设置已在其他位置发生变更，请重新加载后再保存。') : status === 403 ? t('Administrator access is required.', '需要管理员访问权限。') : t('Could not save changes. Try again.', '无法保存更改，请重试。'));
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

  const previewSource = saved?.settings ?? defaultBranding;
  const previewColors = previewPalette(previewSource, palette) as CSSProperties;
  const savedAppearance = (saved?.settings ?? defaultBranding).default_appearance;
  const savedAppearanceLabel =
    savedAppearance === 'light'
      ? t('Light', '浅色')
      : savedAppearance === 'dark'
        ? t('Dark', '深色')
        : t('System', '跟随系统');
  const draftAppearanceLabel =
    draft.default_appearance === 'light'
      ? t('Light', '浅色')
      : draft.default_appearance === 'dark'
        ? t('Dark', '深色')
        : t('System', '跟随系统');
  const defaultMatches = saved !== null && JSON.stringify(saved.settings) === JSON.stringify(defaultBranding);

  return (
    <section className="w-full min-w-0 space-y-5">
      {!saved ? (
        error ? (
          <div role="alert">
            <p>{error}</p>
            <Button className="mt-3" variant="outline" onClick={() => setAttempt(value => value + 1)}>{t('Retry', '重试')}</Button>
          </div>
        ) : (
          <FormSectionSkeleton fields={3} label={t('Loading branding settings…', '正在加载品牌与主题设置…')} />
        )
      ) : (
        <>
          <Tabs value={tab} onValueChange={value => { const next = new URLSearchParams(search); value === 'theme' ? next.set(tabParam, 'theme') : next.delete(tabParam); setSearch(next, { replace: true }); }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList variant="line">
                <TabsTrigger value="branding">{t('Branding', '品牌标识')}</TabsTrigger>
                <TabsTrigger value="theme">{t('Theme', '主题外观')}</TabsTrigger>
              </TabsList>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setPreview(true)}>
                  <IconPalette />{t('Preview', '预览')}
                </Button>
                <Button
                  ref={resetBtnRef}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || defaultMatches}
                  onClick={() => { setError(''); setReloadNeeded(false); setResetOpen(true); }}
                >
                  {t('Reset to Niu defaults', '恢复 Niu 默认设置')}
                </Button>
                {tab === 'branding' ? (
                  <Button ref={editBrandingBtnRef} type="button" size="sm" onClick={() => openEditor('branding')}>
                    {t('Edit branding', '编辑品牌标识')}
                  </Button>
                ) : (
                  <Button ref={editThemeBtnRef} type="button" size="sm" onClick={() => openEditor('theme')}>
                    {t('Edit theme', '编辑主题外观')}
                  </Button>
                )}
              </div>
            </div>

            <TabsContent value="branding" className="pt-5">
              <div className="rounded-[var(--radius-panel)] bg-card p-5">
                <dl className="grid gap-6 sm:grid-cols-3">
                  <div className="min-w-0 space-y-1">
                    <dt className="text-xs text-muted-foreground">{t('Display name', '显示名称')}</dt>
                    <dd className="text-sm font-medium break-words">{saved.settings.display_name}</dd>
                    <p className="text-xs text-muted-foreground">{t('Shown on sign-in screens and browser tabs.', '显示在登录界面与浏览器标签页中。')}</p>
                  </div>
                  {(['logo_data_url', 'favicon_data_url'] as const).map(field => (
                    <div key={field} className="min-w-0 space-y-2">
                      <dt className="text-xs text-muted-foreground">
                        {field === 'logo_data_url' ? t('Logo', '品牌标志 (Logo)') : t('Favicon', '网站图标 (Favicon)')}
                      </dt>
                      <dd className="flex items-center gap-3">
                        <img
                          className={field === 'logo_data_url' ? 'h-12 w-24 object-contain' : 'h-8 w-8 object-contain'}
                          src={saved.settings[field] ?? (field === 'favicon_data_url' ? `${import.meta.env.BASE_URL}assets/favicon-32.png` : defaultLogo)}
                          alt={field === 'logo_data_url' ? t('Current logo', '当前标志') : t('Current favicon', '当前图标')}
                        />
                        <span className="text-xs text-muted-foreground">
                          {saved.settings[field] ? t('Custom image selected', '已选择自定义图片') : t('Using default image', '当前使用默认图片')}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </TabsContent>

            <TabsContent value="theme" className="pt-5">
              <div className="space-y-6 rounded-[var(--radius-panel)] bg-card p-5">
                <div>
                  <div className="text-xs text-muted-foreground">{t('Default appearance', '默认外观模式')}</div>
                  <div className="mt-1 text-sm font-medium">{savedAppearanceLabel}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('Applies before sign-in and to members without a saved preference.', '适用于未登录界面以及尚未保存个人外观偏好的成员。')}
                  </p>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  {(['light', 'dark'] as const).map(mode => (
                    <div key={mode} className="space-y-3">
                      <h2 className="text-sm font-semibold">
                        {mode === 'light' ? t('Light palette', '浅色配色') : t('Dark palette', '深色配色')}
                      </h2>
                      <dl className="grid gap-2.5 sm:grid-cols-2">
                        {brandingTokens.map(key => {
                          const override = saved.settings[mode][key];
                          const displayHex = override ?? defaultTokenHex[mode][key];
                          return (
                            <div key={key} className="flex items-center gap-2.5 rounded-md bg-muted/40 px-3 py-2">
                              <span
                                aria-hidden="true"
                                className="size-4 shrink-0 rounded border border-border/60"
                                style={{ backgroundColor: displayHex }}
                              />
                              <div className="min-w-0">
                                <dt className="truncate text-xs text-muted-foreground">
                                  {isZh ? labelsZh[key] : translateUI(labelsEn[key])}
                                </dt>
                                <dd className="font-mono text-xs text-foreground">
                                  {override ?? `${defaultTokenHex[mode][key]} (${t('Default', '默认')})`}
                                </dd>
                              </div>
                            </div>
                          );
                        })}
                      </dl>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        </>
      )}

      <Dialog
        open={editorSection === 'branding' && Boolean(saved)}
        onOpenChange={open => { if (!open) closeEditor(); }}
      >
        <DialogContent
          className="sm:max-w-xl"
          onCloseAutoFocus={event => {
            if (editBrandingBtnRef.current?.isConnected) {
              event.preventDefault();
              editBrandingBtnRef.current.focus();
            }
          }}
        >
          {saved && (
            <>
              <DialogHeader>
                <DialogTitle>{t('Edit branding', '编辑品牌标识')}</DialogTitle>
                <DialogDescription>
                  {t('Customize the display name, logo, and favicon shown across the dashboard.', '自定义控制台中显示的品牌名称、标志图片与网站图标。')}
                </DialogDescription>
              </DialogHeader>
              <form className="grid gap-5" noValidate onSubmit={event => void save(event)}>
                <div className="space-y-2">
                  <Label htmlFor="deployment-name">{t('Display name', '显示名称')}</Label>
                  <Input
                    id="deployment-name"
                    autoFocus
                    value={draft.display_name}
                    maxLength={80}
                    required
                    disabled={busy}
                    onChange={event => { setDraft({ ...draft, display_name: event.target.value }); setNotice(''); }}
                  />
                  <p className="text-xs text-muted-foreground">{t('Shown on sign-in screens and browser tabs.', '显示在登录界面与浏览器标签页中。')}</p>
                </div>
                {(['logo_data_url', 'favicon_data_url'] as const).map(field => (
                  <div key={field} className="space-y-2.5">
                    <div>
                      <Label htmlFor={field}>{field === 'logo_data_url' ? t('Logo', '品牌标志 (Logo)') : t('Favicon', '网站图标 (Favicon)')}</Label>
                      <p id={field + '-help'} className="mt-1 text-xs text-muted-foreground">
                        {field === 'logo_data_url'
                          ? t('PNG · up to 1024 × 512 pixels and 256 KB.', 'PNG 格式 · 最大 1024 × 512 像素且不超过 256 KB。')
                          : t('Square PNG · up to 256 × 256 pixels and 32 KB.', '正方形 PNG 格式 · 最大 256 × 256 像素且不超过 32 KB。')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <img
                        className={field === 'logo_data_url' ? 'h-12 w-24 object-contain' : 'h-8 w-8 object-contain'}
                        src={draft[field] ?? (field === 'favicon_data_url' ? `${import.meta.env.BASE_URL}assets/favicon-32.png` : defaultLogo)}
                        alt={field === 'logo_data_url' ? t('Current logo', '当前标志') : t('Current favicon', '当前图标')}
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <Input
                          id={field}
                          type="file"
                          accept="image/png"
                          className="sr-only"
                          aria-describedby={field + '-help'}
                          disabled={busy}
                          onChange={event => { void image(field, event.target.files?.[0]); event.target.value = ''; }}
                        />
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => document.getElementById(field)?.click()}>
                          {t('Choose PNG…', '选择 PNG 图片…')}
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {draft[field] ? t('Custom image selected', '已选择自定义图片') : t('Using default image', '当前使用默认图片')}
                        </span>
                      </div>
                      {draft[field] && (
                        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setDraft({ ...draft, [field]: null }); setNotice(''); }}>
                          {t('Use default', '恢复默认')}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {(error || reloadNeeded) && (
                  <div role="alert" className="space-y-2">
                    <p className="text-sm text-destructive">{error || t('These settings changed. Reload before saving.', '这些设置已在其他位置发生变更，请重新加载后再保存。')}</p>
                    {reloadNeeded && (
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setError(''); setNotice(''); setAttempt(value => value + 1); }}>
                        {t('Reload saved settings', '重新加载已保存设置')}
                      </Button>
                    )}
                  </div>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" disabled={busy} onClick={closeEditor}>
                    {t('Cancel', '取消')}
                  </Button>
                  <Button type="submit" disabled={busy || !dirty || reloadNeeded}>
                    {busy ? t('Saving…', '保存中…') : t('Save changes', '保存更改')}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editorSection === 'theme' && Boolean(saved)}
        onOpenChange={open => { if (!open) closeEditor(); }}
      >
        <DialogContent
          className="sm:max-w-2xl"
          onCloseAutoFocus={event => {
            if (editThemeBtnRef.current?.isConnected) {
              event.preventDefault();
              editThemeBtnRef.current.focus();
            }
          }}
        >
          {saved && (
            <>
              <DialogHeader>
                <DialogTitle>{t('Edit theme', '编辑主题外观')}</DialogTitle>
                <DialogDescription>
                  {t('Configure default appearance and override color tokens for light and dark themes.', '配置默认外观模式以及浅色/深色主题的色彩令牌覆盖。')}
                </DialogDescription>
              </DialogHeader>
              <form className="grid gap-5" noValidate onSubmit={event => void save(event)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Label>{t('Default appearance', '默认外观模式')}</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('Applies before sign-in and to members without a saved preference.', '适用于未登录界面以及尚未保存个人外观偏好的成员。')}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" disabled={busy} aria-label={uiT('Default appearance')}>
                        {draftAppearanceLabel}
                        <IconChevronDown />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuRadioGroup value={draft.default_appearance} onValueChange={value => setDraft({ ...draft, default_appearance: value as BrandingSettings['default_appearance'] })}>
                        {(['system', 'light', 'dark'] as const).map(value => (
                          <DropdownMenuRadioItem key={value} value={value}>
                            {value === 'light' ? t('Light', '浅色') : value === 'dark' ? t('Dark', '深色') : t('System', '跟随系统')}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-medium">{t('Colors', '配色方案')}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('Leave blank to inherit Niu. Text pairs need at least 4.5:1 contrast.', '留空则继承 Niu 默认配色。文本与背景需满足至少 4.5:1 的对比度。')}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" aria-label={uiT('Edit color palette')}>
                          {palette === 'light' ? t('Light', '浅色') : t('Dark', '深色')}
                          <IconChevronDown />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuRadioGroup value={palette} onValueChange={value => setPalette(value as 'light' | 'dark')}>
                          <DropdownMenuRadioItem value="light">{t('Light', '浅色')}</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="dark">{t('Dark', '深色')}</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    {brandingTokens.map(key => (
                      <div className="space-y-2" key={key}>
                        <Label htmlFor={'color-' + key}>{isZh ? labelsZh[key] : translateUI(labelsEn[key])}</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            aria-label={isZh ? labelsZh[key] : translateUI(labelsEn[key])}
                            className="h-9 w-11 shrink-0 cursor-pointer overflow-hidden rounded-md p-0.5 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[4px] [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-[4px] [&::-moz-color-swatch]:border-0"
                            disabled={busy}
                            value={draft[palette][key] ?? defaultTokenHex[palette][key]}
                            onChange={event => { const colors = { ...draft[palette] }; colors[key] = event.target.value; setDraft({ ...draft, [palette]: colors }); setNotice(''); }}
                          />
                          <Input
                            id={'color-' + key}
                            placeholder={defaultTokenHex[palette][key]}
                            maxLength={7}
                            pattern="#[0-9a-fA-F]{6}"
                            disabled={busy}
                            value={draft[palette][key] ?? ''}
                            onChange={event => { const colors = { ...draft[palette] }; if (event.target.value) colors[key] = event.target.value; else delete colors[key]; setDraft({ ...draft, [palette]: colors }); setNotice(''); }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {(error || reloadNeeded) && (
                  <div role="alert" className="space-y-2">
                    <p className="text-sm text-destructive">{error || t('These settings changed. Reload before saving.', '这些设置已在其他位置发生变更，请重新加载后再保存。')}</p>
                    {reloadNeeded && (
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setError(''); setNotice(''); setAttempt(value => value + 1); }}>
                        {t('Reload saved settings', '重新加载已保存设置')}
                      </Button>
                    )}
                  </div>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" disabled={busy} onClick={closeEditor}>
                    {t('Cancel', '取消')}
                  </Button>
                  <Button type="submit" disabled={busy || !dirty || reloadNeeded}>
                    {busy ? t('Saving…', '保存中…') : t('Save changes', '保存更改')}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={resetOpen && Boolean(saved)}
        onOpenChange={open => { if (!busy) { setResetOpen(open); if (!open) { setError(''); setReloadNeeded(false); } } }}
      >
        <DialogContent
          onCloseAutoFocus={event => {
            if (resetBtnRef.current?.isConnected && !defaultMatches) {
              event.preventDefault();
              resetBtnRef.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('Reset to Niu defaults?', '确定恢复 Niu 默认设置？')}</DialogTitle>
            <DialogDescription>
              {t('Replace custom branding assets and color overrides with Niu defaults across the dashboard.', '将品牌显示名称、标志图标和配色覆盖恢复为 Niu 默认配置。')}
            </DialogDescription>
          </DialogHeader>
          {(error || reloadNeeded) && (
            <div role="alert" className="space-y-2">
              <p className="text-sm text-destructive">{error || t('These settings changed. Reload before saving.', '这些设置已在其他位置发生变更，请重新加载后再保存。')}</p>
              {reloadNeeded && (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setError(''); setNotice(''); setAttempt(value => value + 1); }}>
                  {t('Reload saved settings', '重新加载已保存设置')}
                </Button>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => { setResetOpen(false); setError(''); setReloadNeeded(false); }}>
              {t('Cancel', '取消')}
            </Button>
            <Button type="button" variant="destructive" disabled={busy || reloadNeeded} onClick={() => void confirmResetDefaults()}>
              {busy ? t('Saving…', '保存中…') : t('Reset defaults', '确认恢复默认')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="niu-modal">
          <DialogHeader>
            <DialogTitle>{t('Appearance preview', '外观预览')}</DialogTitle>
            <DialogDescription>
              {t('Preview the saved branding in light and dark appearance.', '预览浅色与深色模式下已保存的品牌外观。')}
            </DialogDescription>
          </DialogHeader>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" aria-label={uiT('Preview appearance')}>
                {palette === 'light' ? t('Light', '浅色') : t('Dark', '深色')}
                <IconChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup value={palette} onValueChange={value => setPalette(value as 'light' | 'dark')}>
                <DropdownMenuRadioItem value="light">{t('Light', '浅色')}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">{t('Dark', '深色')}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className={palette === 'dark' ? 'dark' : 'light'}>
            <section style={previewColors} className="rounded-[var(--radius-panel)] bg-background p-6 text-foreground">
              <div className="flex items-center gap-3">
                <img src={previewSource.logo_data_url ?? defaultLogo} alt="" className="h-10 w-14 shrink-0 object-contain" />
                <strong className="min-w-0 break-words">{previewSource.display_name}</strong>
              </div>
              <p className="my-5">{t('Sign in to your dashboard.', '登录您的控制台。')}</p>
              <Button type="button" className="pointer-events-none" tabIndex={-1}>{t('Sign in', '登录')}</Button>
              <div className="mt-5 rounded-[var(--radius-control)] bg-accent p-3 text-accent-foreground">{t('Selected item', '选中项')}</div>
              <div className="mt-3 rounded-[var(--radius-control)] bg-sidebar p-3 text-sidebar-foreground">{t('Navigation', '导航栏')}</div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
