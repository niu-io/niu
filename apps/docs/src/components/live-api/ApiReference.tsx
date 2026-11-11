import { useEffect, useMemo, useRef, useState } from 'react';
import WorkspaceKeyConnection, { type DocsKeySelection } from './WorkspaceKeyConnection';
import { ApiReferenceReact, type AnyApiReferenceConfiguration } from '@scalar/api-reference-react';
import { useLocale } from '../../../../dashboard/app/shell/locale';
import '@scalar/api-reference-react/style.css';
import './api-reference.css';

/** Scalar owns documentation navigation, schema rendering and code samples. */
export default function ApiReference() {
  const { t, locale } = useLocale();
  const [selection, setSelection] = useState<DocsKeySelection | null>(null);
  const selectedKey = useRef(selection); selectedKey.current = selection;
  const [mode, setMode] = useState<'dark' | 'light'>(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  useEffect(() => {
    const observer = new MutationObserver(() => setMode(document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
    observer.observe(document.documentElement, {attributes:true, attributeFilter:['class']});
    return () => observer.disconnect();
  }, []);
  const configuration = useMemo<AnyApiReferenceConfiguration>(() => ({
    url: '/docs/openapi/public.json',
    layout: 'modern',
    theme: 'none',
    forceDarkModeState: mode,
    hideDarkModeToggle: true,
    withDefaultFonts: false,
    showSidebar: true,
    searchHotKey: 'i',
    showDeveloperTools: 'never',
    modelsSectionLabel: t('Schemas', '数据结构 (Schemas)'),
    localization: { locale: locale === 'zh-CN' ? 'zh-CN' : 'en' },
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
  }), [mode, t, locale]);
  return <div className="niu-api-documentation not-content">
    <section className="niu-api-connection-bar" aria-label={t("Connect API reference", "连接 API 参考")}>
      <WorkspaceKeyConnection
        onChange={setSelection}
        description={t(
          'Same-origin inference APIs only · key secret stays on the server · requests can incur real charges',
          '仅限同源推理 API · 密钥明文保存在服务端 · 请求可能产生真实费用',
        )}
      />
    </section>
    <div className="niu-api-reference" aria-label={t("Niu OpenAPI reference", "Niu OpenAPI 参考")}><ApiReferenceReact configuration={configuration} /></div>
  </div>;
}
