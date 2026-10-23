import { Link, Outlet } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { canManagePlatform, useDashboardContext } from './dashboard-context';

/** Central permission boundary for platform configuration routes. */
export default function Administration() {
  const context = useDashboardContext();
  if (!context.session) return <p role="status">Checking administrator access…</p>;
  if (!canManagePlatform(context.session)) {
    return <Alert><AlertTitle>Administrator access required</AlertTitle><AlertDescription><p>Your account cannot manage platform configuration.</p><Button asChild variant="outline" className="mt-3"><Link to="/workspaces/default/">Open workspace</Link></Button></AlertDescription></Alert>;
  }
  return <Outlet context={context} />;
}
