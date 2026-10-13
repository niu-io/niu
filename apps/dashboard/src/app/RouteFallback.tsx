import { IconArrowLeft, IconHome, IconChevronDown } from '@tabler/icons-react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { useBranding } from './branding';
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
  const { settings: branding, logo } = useBranding();
  const error = useRouteError();
  const response = isRouteErrorResponse(error) ? error : null;
  const status = notFound ? 404 : response?.status;
  const title = status === 404 ? 'Not Found'
    : status === 401 ? 'Sign-in required'
    : status === 403 ? 'Access denied'
    : status === 429 ? 'Too many requests'
    : status && status >= 500 ? 'Server error'
    : response ? 'Request failed' : 'Application error';
  const description = status === 404 ? 'The page you requested could not be found.'
    : status === 401 ? 'Sign in to open this page.'
    : status === 403 ? 'You do not have permission to open this page.'
    : status === 429 ? 'Please wait a moment and try again.'
    : status && status >= 500 ? 'The server could not load this page. Please try again.'
    : 'Something went wrong while loading this page. Please try again.';
  const responseMessage = typeof response?.data === 'string' ? response.data
    : typeof response?.data?.message === 'string' ? response.data.message : '';
  const detail = diagnosticText(error instanceof Error ? error.message : responseMessage || response?.statusText || description);
  const details = [status ? `HTTP ${status}` : error instanceof Error ? error.name : title, detail].filter(Boolean).join('\n');

  useEffect(() => { document.title = `${title} · ${branding.display_name}`; }, [title, branding.display_name]);

  return <main className="route-error" role="main">
    <span className="route-error-mark" aria-hidden="true" style={{ maskImage: `url("${logo}")`, WebkitMaskImage: `url("${logo}")` }} />
    <div className="route-error-copy"><h1>{title}</h1><p className="route-error-message">{description}</p></div>
    <Collapsible className="route-error-details">
      <CollapsibleTrigger asChild><Button variant="ghost" size="sm">Error details<IconChevronDown size={16} aria-hidden="true" /></Button></CollapsibleTrigger>
      <CollapsibleContent><pre>{details}</pre></CollapsibleContent>
    </Collapsible>
    <div className="route-error-actions">
      <Button asChild><Link to="/workspaces/default/"><IconHome aria-hidden="true" />Open workspace</Link></Button>
      <Button type="button" variant="ghost" onClick={() => window.history.back()}><IconArrowLeft aria-hidden="true" />Go back</Button>
    </div>
  </main>;
}
