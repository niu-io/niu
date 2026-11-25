import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useParams, type LoaderFunctionArgs } from 'react-router';
import {
  IconChevronDown,
  IconDeviceDesktop,
  IconLanguage,
  IconMoon,
  IconSun,
} from '@tabler/icons-react';
import NiuBrand from '@/components/NiuBrand';
import { CardGridSkeleton } from '@/components/PageSkeletons';
import RouterPending from '@/shell/RouterPending';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBranding } from '@/shell/branding';
import { useDashboardContext, type Model } from '@/shell/dashboard-context';
import { resolveModelsRedirectTarget } from '@/shell/legacy-redirect-route';
import { legacyModelsRedirectLoader } from '@/shell/legacy-redirects';
import type { RouteHandle } from '@/shell/router-context';
import { readTheme, saveTheme, subscribeTheme, type Theme } from '@/shell/theme';
import { useLocale, useLocale as useUILocale, type Locale } from '@/shell/ui-locale';
import { workspacePathSegment } from '@/shell/workspace-route';
import ModelTable from './components/ModelTable';
import { loadPublicCatalogModels } from './public-catalog';

export const handle: RouteHandle = {
  destination: 'Global',
  title: { en: 'Models', zh: '模型' },
};

export function clientLoader(args: LoaderFunctionArgs) {
  return legacyModelsRedirectLoader(args);
}

/** Public model catalog shown before sign-in once at least one shared/commercial model exists. */
export default function PublicModelsRoute() {
  const { t: uiT, format: uiF } = useUILocale();
  const { locale, setLocale, t } = useLocale();
  const { settings: branding, logo } = useBranding();
  const { token, sessionChecked, workspaceLoading, workspaces } = useDashboardContext();
  const params = useParams();
  const location = useLocation();
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [models, setModels] = useState<Model[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => subscribeTheme(() => setTheme(readTheme())), []);

  useEffect(() => {
    const syncScroll = () => setScrolled(window.scrollY > 8);
    syncScroll();
    window.addEventListener('scroll', syncScroll, { passive: true });
    return () => window.removeEventListener('scroll', syncScroll);
  }, []);

  const explicitWorkspace = useMemo(
    () => new URLSearchParams(location.search).get('workspace')?.trim() ?? '',
    [location.search],
  );

  const redirectTarget = useMemo(() => {
    if (explicitWorkspace) {
      return resolveModelsRedirectTarget(params['*'], location.search, location.hash);
    }
    if (token && workspaces.length > 0) {
      const slug = workspacePathSegment(workspaces[0], workspaces);
      const rest = params['*'] ? `/${params['*'].replace(/^\/+/, '')}` : '';
      const sp = new URLSearchParams(location.search);
      sp.delete('workspace');
      const qs = sp.toString();
      return `/workspaces/${encodeURIComponent(slug)}/models${rest}${qs ? `?${qs}` : ''}${location.hash}`;
    }
    if (token && !workspaceLoading) {
      return resolveModelsRedirectTarget(params['*'], location.search, location.hash);
    }
    return null;
  }, [
    explicitWorkspace,
    token,
    workspaces,
    workspaceLoading,
    params,
    location.search,
    location.hash,
  ]);

  const shouldLoadPublicCatalog = !explicitWorkspace && sessionChecked && !token;

  useEffect(() => {
    if (!shouldLoadPublicCatalog) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void loadPublicCatalogModels({
      signal: controller.signal,
      force: retryTick > 0,
    })
      .then(result => {
        if (controller.signal.aborted) return;
        setModels(result.models);
        setLoading(false);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Could not load the model catalog.',
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, [shouldLoadPublicCatalog, retryTick]);

  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const signInHref = `/login?returnTo=${encodeURIComponent(currentPath)}`;
  const emptyRedirectState = useMemo(() => ({ from: currentPath }), [currentPath]);

  if (redirectTarget) {
    return <Navigate to={redirectTarget} replace />;
  }

  if (!shouldLoadPublicCatalog || (models === null && error === null)) {
    return <RouterPending />;
  }

  if (!error && models !== null && models.length === 0) {
    return <Navigate to="/login" replace state={emptyRedirectState} />;
  }

  const errorMessage =
    error === 'Invalid model catalog response.'
      ? t('Invalid model catalog response.', '模型目录响应无效。')
      : t('Could not load the model catalog.', '无法加载模型目录。');

  const themeLabel =
    theme === 'light'
      ? t('Light', '浅色')
      : theme === 'dark'
        ? t('Dark', '深色')
        : t('System', '跟随系统');

  const brandNode =
    branding.display_name === 'Niu' && !branding.logo_data_url ? (
      <NiuBrand locale={locale} />
    ) : (
      <>
        <img src={logo} alt="" />
        <span>{branding.display_name}</span>
      </>
    );

  return (
    <div className="public-models-shell">
      <header className="public-models-topbar" data-scrolled={scrolled ? 'true' : undefined}>
        <div className="public-models-brand-group">
          <Link
            className="public-models-brand"
            to="/"
            aria-label={uiF('{0} home', [branding.display_name])}
          >
            {brandNode}
          </Link>
          <nav aria-label={t('Public resources', '公开导航')} className="public-models-nav">
            <Button asChild variant="secondary" size="sm">
              <Link to="/models" aria-current={params['*'] ? undefined : 'page'}>
                {t('Models', '模型')}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href="/docs/">{t('Docs', '文档')}</a>
            </Button>
          </nav>
        </div>
        <div className="public-models-actions">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" aria-label={uiT('Language')}>
                <IconLanguage size={16} aria-hidden="true" />
                <span className="public-models-control-label">
                  {locale === 'zh-CN' ? '简体中文' : 'English'}
                </span>
                <IconChevronDown size={14} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={locale}
                onValueChange={value => setLocale(value as Locale)}
              >
                <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="zh-CN">简体中文</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" aria-label={uiT('Color mode')}>
                {theme === 'light' ? (
                  <IconSun size={16} aria-hidden="true" />
                ) : theme === 'dark' ? (
                  <IconMoon size={16} aria-hidden="true" />
                ) : (
                  <IconDeviceDesktop size={16} aria-hidden="true" />
                )}
                <span className="public-models-control-label">{themeLabel}</span>
                <IconChevronDown size={14} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={value => saveTheme(value as Theme)}
              >
                <DropdownMenuRadioItem value="system">
                  <IconDeviceDesktop size={16} aria-hidden="true" />
                  {t('System', '跟随系统')}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="light">
                  <IconSun size={16} aria-hidden="true" />
                  {t('Light', '浅色')}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <IconMoon size={16} aria-hidden="true" />
                  {t('Dark', '深色')}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild size="sm">
            <Link to={signInHref}>{t('Sign in', '登录')}</Link>
          </Button>
        </div>
      </header>
      <main id="dashboard-content" tabIndex={-1} className="public-models-main">
        {loading ? (
          <CardGridSkeleton label={t('Loading models', '正在加载模型')} count={8} />
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{errorMessage}</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRetryTick(v => v + 1)}
                >
                  {t('Retry', '重试')}
                </Button>
                <Button asChild size="sm">
                  <Link to={signInHref}>{t('Sign in', '登录')}</Link>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <ModelTable
            models={models ?? []}
            publicMode
            header={
              <div className="public-models-heading">
                <h1>{t('Models', '模型')}</h1>
                <p>
                  {t(
                    'Published models available through the Niu API.',
                    '通过 Niu API 提供的已发布模型。',
                  )}
                </p>
              </div>
            }
          />
        )}
      </main>
    </div>
  );
}
