import { useEffect, useMemo, useRef, useState } from 'react';
import WorkspaceKeyConnection, { type DocsKeySelection } from '../../../../docs/src/components/live-api/WorkspaceKeyConnection';
import { useNavigate } from 'react-router';
import { ApiReferenceReact, type AnyApiReferenceConfiguration } from '@scalar/api-reference-react';
import PublicHeader from '../../../../docs/src/components/PublicHeader';
import '../../../../../branding/public-header.css';
import '@scalar/api-reference-react/style.css';
import './api-reference.css';

/** Scalar owns documentation navigation, schema rendering and code samples. */
export default function ApiReference() {
  const navigate = useNavigate();
  const [selection, setSelection] = useState<DocsKeySelection | null>(null);
  const selectedKey = useRef(selection); selectedKey.current = selection;
  const [mode, setMode] = useState<'dark' | 'light'>(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  useEffect(() => {
    const observer = new MutationObserver(() => setMode(document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
    observer.observe(document.documentElement, {attributes:true, attributeFilter:['class']});
    return () => observer.disconnect();
  }, []);
  const configuration = useMemo<AnyApiReferenceConfiguration>(() => ({
    url: `${import.meta.env.BASE_URL}docs/openapi/public.json`,
    layout: 'modern',
    theme: 'none',
    forceDarkModeState: mode,
    hideDarkModeToggle: true,
    withDefaultFonts: false,
    showSidebar: true,
    showDeveloperTools: 'never',
    modelsSectionLabel: 'Schemas',
    defaultOpenAllTags: false,
    hideClientButton: true,
    persistAuth: false,
    // Mutate the final Request, not Scalar's pre-build copy. Never forward
    // session-backed key context through a selectable external server/proxy.
    onRequestBuilt: ({ request }: { request: Request }) => {
      const selected = selectedKey.current;
      if (!selected) return;
      const target = new URL(request.url);
      if (target.origin !== window.location.origin || !/^\/v1(?:beta)?\//.test(target.pathname)) {
        throw new Error('The selected workspace key can only test inference APIs on this Niu origin. Clear the connection to use other credentials.');
      }
      if (!['GET', 'HEAD'].includes(request.method) && !selected.canWrite) throw new Error('Your role does not permit request execution.');
      request.headers.delete('x-niu-api-key');
      request.headers.set('authorization', 'Bearer niu-browser-member-session');
      request.headers.set('x-niu-key-id', selected.keyId);
    },
    telemetry: false,
    agent: {disabled:true},
    defaultHttpClient: {targetKey:'shell', clientKey:'curl'},
  }), [mode]);
  return <div className="niu-api-documentation" onClick={event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/docs/')) return;
    // Keep documentation navigation inside the authenticated Niu shell.
    if (url.pathname.startsWith('/docs/openapi/')) return;
    event.preventDefault();
    navigate('/help/' + url.pathname.slice('/docs/'.length) + url.search + url.hash);
  }}>
    <PublicHeader path="/docs/api/rest/" brandSrc="" embedded />
    <section className="niu-api-connection-bar" aria-label="Connect API reference">
      <WorkspaceKeyConnection
        onChange={setSelection}
        description="Same-origin inference APIs only · key secret stays on the server · requests can incur real charges"
      />
    </section>
    <div className="niu-api-reference" aria-label="Niu OpenAPI reference"><ApiReferenceReact configuration={configuration} /></div>
  </div>;
}
