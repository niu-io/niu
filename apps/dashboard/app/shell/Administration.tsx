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
    const roles = context.roleSwitch;
    const canActivateAdmin = Boolean(roles?.available.includes('admin') && roles.active !== 'admin');
    return <Alert><AlertTitle>{uiT("Administrator access required")}</AlertTitle><AlertDescription>
      {canActivateAdmin ? <>
        <p>{uiT("Your account has Platform administrator access assigned, but this session is in User mode.")}</p>
        <p>{uiT("Switch to administrator mode to manage platform configuration. This does not grant new authority.")}</p>
        <Button type="button" variant="outline" className="mt-3" disabled={roles?.saving} onClick={() => void roles?.setRole('admin')}>{roles?.saving ? uiT("Switching…") : uiT("Switch to administrator mode")}</Button>
        {roles?.error && <p role="alert" className="mt-2 text-destructive">{uiT(roles.error)}</p>}
      </> : <>
        <p>{uiT("Your account does not have Platform administrator access. Ask an installation administrator to grant it.")}</p>
        <p>{uiT("You can continue using workspace features in the meantime.")}</p>
      </>}
      <Button asChild variant="outline" className="mt-3"><Link to="/workspaces/default/">{uiT("Open workspace")}</Link></Button>
    </AlertDescription></Alert>;
  }
  return <>{!location.pathname.replace(/\/+$/, '').endsWith('/admin/incidents') && <IncidentNotice key={`${context.token}:${context.session.kind}:${context.session.operator?.id ?? ''}`} token={context.token} />}<Outlet context={context} /></>;
}
