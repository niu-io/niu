import { Outlet, useOutletContext, useParams } from 'react-router';
import WorkspaceIncidentNotice from '@/features/incidents/WorkspaceIncidentNotice';
import type { DashboardContext } from './dashboard-context';
import type { RouteHandle } from './router-context';
import { resolveWorkspacePathSegment } from './workspace-route';

export const handle: RouteHandle = { destination: 'Workspace' };

export default function WorkspaceScopeLayout() {
  const context = useOutletContext<DashboardContext>();
  const { workspace: slug } = useParams();
  const workspace = slug ? resolveWorkspacePathSegment(slug, context.workspaces) : undefined;
  return <>{workspace && slug && <WorkspaceIncidentNotice key={`${context.token}:${workspace.id}`} token={context.token} workspaceId={workspace.id} workspaceSlug={slug} />}<Outlet context={context} /></>;
}
