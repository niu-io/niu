import { IconArrowLeft as ArrowLeft } from "@tabler/icons-react";
import { IconHome as House } from "@tabler/icons-react";
import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { useBranding } from './branding';
import { Button } from '@/components/ui/button';
import { useEffect } from 'react';

type RouteFallbackProps = { notFound?: boolean };

export default function RouteFallback({ notFound = false }: RouteFallbackProps) {
  const {settings:branding,logo} = useBranding();
  const error = useRouteError();
  const missingPage = notFound || (error != null && isRouteErrorResponse(error) && error.status === 404);
  const title = missingPage ? 'Page not found' : 'We couldn’t open this page';
  const message = missingPage
    ? 'This link may be outdated.'
    : 'The dashboard ran into a problem while opening this page. Return to your workspace and try again.';

  useEffect(() => { document.title = `${title} · ${branding.display_name}`; }, [title,branding.display_name]);

  return <main className="route-error" role="main">
    <span
      className="route-error-mark"
      aria-hidden="true"
      style={{ maskImage: `url("${logo}")`, WebkitMaskImage: `url("${logo}")` }}
    />
    <p className="route-error-brand">{branding.display_name} <span>Dashboard</span></p>
    <h1>{title}</h1>
    <p className="route-error-message">{message}</p>
    <div className="route-error-actions">
      <Button asChild><Link to="/workspaces/default/"><House aria-hidden="true" />Open workspace</Link></Button>
      <Button type="button" variant="ghost" onClick={() => window.history.back()}><ArrowLeft aria-hidden="true" />Go back</Button>
    </div>
  </main>;
}
