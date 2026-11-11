import { useLocale as useUILocale } from '@/shell/ui-locale';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { WorkspaceShellSkeleton } from '@/components/PageSkeletons';
import { Button } from '@/components/ui/button';
import { IconSearch } from '@tabler/icons-react';
import { useLocale } from '../../shell/locale';
import { readTheme } from '@/shell/theme';

const AgentDocument = lazy(() => import('./AgentDocument'));

const ApiReference = lazy(() => import('./ApiReference'));

export default function HelpPage() {
  const { t } = useLocale();
  const { pathname } = useLocation();
  if (/\.md$/.test(pathname)) return <Suspense fallback={<p role="status">{t('Loading document…', '正在加载文档…')}</p>}><AgentDocument key={pathname} path={pathname.replace(/^\/help\//, '/docs/')} /></Suspense>;
  return /^\/help\/api(?:\/rest)?\/?$/.test(pathname)
    ? <Suspense fallback={<div className="p-6"><WorkspaceShellSkeleton label={t('Loading API reference…', '正在加载 API 参考…')} /></div>}><ApiReference /></Suspense>
    : <DocumentationPage />;
}

function DocumentationPage() {
  const { t: uiT } = useUILocale();
  const { locale } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const dashboardBase = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const docsBase = `${dashboardBase}/docs/`;
  const helpPath = location.pathname.replace(/^\/help\/?/, '');
  const path = `${docsBase}${helpPath}`;
  const query = new URLSearchParams(location.search);
  query.set('embed', 'help');
  const framePath = path + '?' + query.toString() + location.hash;
  const initialFramePath = useRef(framePath);
  useEffect(() => {
    const contentWindow = frame.current?.contentWindow;
    if (!contentWindow) return;
    try {
      const currentPath = contentWindow.location.pathname + contentWindow.location.search + contentWindow.location.hash;
      if (currentPath !== framePath) contentWindow.postMessage({ type: 'niu-docs-navigate', path: framePath }, window.location.origin);
    } catch {
      // The frame can be between document loads; its next location change will sync it.
    }
  }, [framePath]);
  useEffect(() => {
    const contentWindow = frame.current?.contentWindow;
    if (!contentWindow) return;
    const post = () => {
      try { contentWindow.postMessage({ type: 'niu-docs-theme', theme: readTheme() }, window.location.origin); } catch { /* Ignore while iframe is loading. */ }
    };
    post();
    window.addEventListener('niu-theme-change', post);
    return () => window.removeEventListener('niu-theme-change', post);
  }, []);
  useEffect(() => {
    const contentWindow = frame.current?.contentWindow;
    if (!contentWindow) return;
    try {
      contentWindow.postMessage({ type: 'niu-docs-locale', locale }, window.location.origin);
    } catch {
      // Ignore while iframe is loading.
    }
  }, [locale]);
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type !== 'niu-docs-navigation' || typeof event.data.path !== 'string') return;
      const url = new URL(event.data.path, window.location.origin);
      const docsPath = url.pathname.startsWith(docsBase)
        ? url.pathname.slice(docsBase.length)
        : url.pathname.startsWith('/docs/')
          ? url.pathname.slice('/docs/'.length)
          : null;
      if (url.origin === window.location.origin && docsPath !== null) {
        url.searchParams.delete('embed');
        navigate('/help/' + docsPath + url.search + url.hash);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [dashboardBase, docsBase, navigate]);
  const openSearch = () => {
    const contentWindow = frame.current?.contentWindow;
    if (!contentWindow) return;
    try {
      const trigger = contentWindow.document.querySelector<HTMLButtonElement>('site-search button');
      if (trigger) {
        trigger.click();
        return;
      }
    } catch {
      /* Fall back to query param navigation if the iframe is still loading. */
    }
    const url = new URL(contentWindow.location.href);
    url.searchParams.set('embed', 'help');
    url.searchParams.set('search', '1');
    contentWindow.location.assign(url.toString());
  };
  return <><iframe ref={frame} className="help-frame" title={uiT("Docs")} src={initialFramePath.current} /><Button type="button" className="help-search-fab" size="icon" aria-label={uiT("Search documentation")} title={uiT("Search documentation")} onClick={openSearch}><IconSearch size={18} /></Button></>;
}
