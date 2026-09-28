import { ArrowLeft, House } from 'lucide-react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import logo from '../../../../branding/assets/niu-mark.png';
import { Button } from '@/components/ui/button';

type RouteFallbackProps = { notFound?: boolean };

export default function RouteFallback({ notFound = false }: RouteFallbackProps) {
  const error = useRouteError();
  const missingPage = notFound || (error != null && isRouteErrorResponse(error) && error.status === 404);
  const title = missingPage ? 'Page not found' : 'We couldn’t open this page';
  const message = missingPage
    ? 'This address doesn’t lead to a Niu Console page. Return to your workspace and continue from the navigation.'
    : 'The console ran into a problem while opening this page. Return to your workspace and try again.';

  return <main className="route-error" role="main">
    <span
      className="route-error-mark"
      aria-hidden="true"
      style={{ maskImage: `url("${logo}")`, WebkitMaskImage: `url("${logo}")` }}
    />
    <p className="route-error-brand">niu.io <span>Console</span></p>
    <h1>{title}</h1>
    <p className="route-error-message">{message}</p>
    <div className="route-error-actions">
      <Button asChild><Link to="/workspaces/default/"><House aria-hidden="true" />Open workspace</Link></Button>
      <Button type="button" variant="ghost" onClick={() => window.history.back()}><ArrowLeft aria-hidden="true" />Go back</Button>
    </div>
  </main>;
}
