import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

export default function HelpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const path = location.pathname.replace(/^\/help(?:\/|$)/, '/docs/');
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type !== 'niu-docs-navigation' || typeof event.data.path !== 'string') return;
      const url = new URL(event.data.path, window.location.origin);
      if (url.origin === window.location.origin && url.pathname.startsWith('/docs/')) {
        navigate('/help/' + url.pathname.slice('/docs/'.length) + url.search + url.hash);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate]);
  return <iframe ref={frame} className="help-frame" title="Documentation" src={path + location.search + location.hash} />;
}
