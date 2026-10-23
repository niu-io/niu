import { lazy, Suspense, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useLocale } from '../../app/locale';

const ApiReference = lazy(() => import('./ApiReference'));

export default function HelpPage() {
  const { t } = useLocale();
  const { pathname } = useLocation();
  return /^\/help\/api(?:\/rest)?\/?$/.test(pathname)
    ? <Suspense fallback={<p role="status" className="p-6 text-muted-foreground">{t('Loading API reference…', '正在加载 API 参考…')}</p>}><ApiReference /></Suspense>
    : <DocumentationPage />;
}

function DocumentationPage() {
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
  return <iframe ref={frame} className="help-frame" title="Documentation" src={initialFramePath.current} />;
}
