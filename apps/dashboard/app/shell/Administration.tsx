import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Link, Outlet, useLocation } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { WorkspaceShellSkeleton } from '@/components/PageSkeletons';
import { canManagePlatform, useDashboardContext } from './dashboard-context';
import type { RouteHandle } from './router-context';
import IncidentNotice from '@/features/incidents/IncidentNotice';

export const handle: RouteHandle = { destination: 'Administration' };

/** Central permission boundary for platform configuration routes. */
export default function Administration() {
  const { t: uiT } = useUILocale();
  const context = useDashboardContext();
  const location = useLocation();
  if (!context.session) return <WorkspaceShellSkeleton label={uiT("Checking administrator access…")} />;
  if (!canManagePlatform(context.session)) {
    return <Alert><AlertTitle>{uiT("Administrator access required")}</AlertTitle><AlertDescription><p>{uiT("Your account cannot manage platform configuration.")}</p><Button asChild variant="outline" className="mt-3"><Link to="/workspaces/default/">{uiT("Open workspace")}</Link></Button></AlertDescription></Alert>;
  }
  return <>{!location.pathname.replace(/\/+$/, '').endsWith('/admin/incidents') && <IncidentNotice key={`${context.token}:${context.session.kind}:${context.session.operator?.id ?? ''}`} token={context.token} />}<Outlet context={context} /></>;
}
