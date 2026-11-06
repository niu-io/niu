import { useMemo } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { useDashboardContext } from '@/shell/dashboard-context';
import { resolveWorkspacePathSegment, workspacePathSegment } from '@/shell/workspace-route';

/**
 * Preserve the workspace membership scope of the former Users page. The
 * canonical Members section reads the explicit `workspace` scope and keeps
 * organization-wide members visible alongside workspace-scoped members.
 */
export default function WorkspaceUsersLegacyRoute() {
  const context = useDashboardContext();
  const { workspace: segment } = useParams();
  const location = useLocation();
  const workspace = segment ? resolveWorkspacePathSegment(segment, context.workspaces) : context.workspace;
  const scope = workspace
    ? workspacePathSegment(workspace, context.workspaces)
    : segment || (context.workspace ? workspacePathSegment(context.workspace, context.workspaces) : 'default');
  const query = new URLSearchParams(location.search);
  query.set('workspace', scope);
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  // Keep this object stable across context-driven re-renders. Navigate
  // compares state by identity and would otherwise restart the same
  // navigation while the target route chunk is still loading.
  const state = useMemo(
    () => location.state && typeof location.state === 'object'
      ? { ...location.state, settingsReturnTo: returnTo }
      : { settingsReturnTo: returnTo },
    [location.state, returnTo],
  );
  return <Navigate
    replace
    state={state}
    to={`/settings/members?${query.toString()}${location.hash}`}
  />;
}
