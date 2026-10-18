import { IconArrowLeft, IconHome, IconChevronDown } from '@tabler/icons-react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { useBranding } from './branding';
import { useLocale } from './locale';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { useEffect } from 'react';

type RouteFallbackProps = { notFound?: boolean };

function diagnosticText(value: string) {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(token|password|secret|api[_-]?key)([=:]\s*)[^\s&]+/gi, '$1$2[redacted]')
    .replace(/https?:\/\/[^\s)]+/g, '[URL]')
    .replace(/(?:\/Users\/|\/home\/|[A-Z]:\\)[^\s)]+/g, '[path]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[reference]')
    .slice(0, 1200);
}

export default function RouteFallback({ notFound = false }: RouteFallbackProps) {
  const { t } = useLocale();
  const { settings: branding, logo } = useBranding();
  const error = useRouteError();
  const response = isRouteErrorResponse(error) ? error : null;
  const status = notFound ? 404 : response?.status;
  const title = status === 404 ? t('Not Found', '页面未找到')
    : status === 401 ? t('Sign-in required', '需要登录')
    : status === 403 ? t('Access denied', '访问被拒绝')
    : status === 429 ? t('Too many requests', '请求过于频繁')
    : status && status >= 500 ? t('Server error', '服务器错误')
    : response ? t('Request failed', '请求失败') : t('Application error', '应用错误');
  const description = status === 404 ? t('The page you requested could not be found.', '未找到您请求的页面。')
    : status === 401 ? t('Sign in to open this page.', '请登录后访问此页面。')
    : status === 403 ? t('You do not have permission to open this page.', '您没有权限访问此页面。')
    : status === 429 ? t('Please wait a moment and try again.', '请稍候再试。')
    : status && status >= 500 ? t('The server could not load this page. Please try again.', '服务器无法加载此页面，请重试。')
    : t('Something went wrong while loading this page. Please try again.', '加载此页面时发生错误，请重试。');
  const responseMessage = typeof response?.data === 'string' ? response.data
    : typeof response?.data?.message === 'string' ? response.data.message : '';
  const detail = diagnosticText(error instanceof Error ? error.message : responseMessage || response?.statusText || description);
  const details = [status ? `HTTP ${status}` : error instanceof Error ? error.name : title, detail].filter(Boolean).join('\n');

  useEffect(() => { document.title = `${title} · ${branding.display_name}`; }, [title, branding.display_name]);

  return <main className="route-error" role="main">
    <span className="route-error-mark" aria-hidden="true" style={{ maskImage: `url("${logo}")`, WebkitMaskImage: `url("${logo}")` }} />
    <div className="route-error-copy"><h1>{title}</h1><p className="route-error-message">{description}</p></div>
    <Collapsible className="route-error-details">
      <CollapsibleTrigger asChild><Button variant="ghost" size="sm">{t('Error details', '错误详情')}<IconChevronDown size={16} aria-hidden="true" /></Button></CollapsibleTrigger>
      <CollapsibleContent><pre>{details}</pre></CollapsibleContent>
    </Collapsible>
    <div className="route-error-actions">
      <Button asChild><Link to="/workspaces/default/"><IconHome aria-hidden="true" />{t('Open workspace', '打开工作空间')}</Link></Button>
      <Button type="button" variant="ghost" onClick={() => window.history.back()}><IconArrowLeft aria-hidden="true" />{t('Go back', '返回上一页')}</Button>
    </div>
  </main>;
}
