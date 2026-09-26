import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';

export default function AppError() {
  const error = useRouteError();
  const title = isRouteErrorResponse(error) ? `${error.status} · ${error.statusText}` : 'Console error';
  const message = isRouteErrorResponse(error)
    ? 'This page could not be loaded. Return to the overview and try again.'
    : 'The console hit an unexpected error. Return to the overview to continue.';

  return <main className="route-error">
    <div className="route-error-mark">N</div>
    <p className="eyebrow">niu.io · Console</p>
    <h1>{title}</h1>
    <p>{message}</p>
    <Button asChild><Link to="/workspaces/default/">Return to overview</Link></Button>
  </main>;
}
