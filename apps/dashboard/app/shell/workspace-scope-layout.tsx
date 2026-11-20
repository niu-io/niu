import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router';
import WorkspaceIncidentNotice from '@/features/incidents/WorkspaceIncidentNotice';
import type { DashboardContext } from './dashboard-context';
import type { RouteHandle } from './router-context';
import { resolveWorkspacePathSegment, workspacePathSegment } from './workspace-route';

export const handle: RouteHandle = { destination: 'Workspace' };

export default function WorkspaceScopeLayout() {
  const context = useOutletContext<DashboardContext>();
  const { workspace: slug } = useParams();
  const workspace = slug ? resolveWorkspacePathSegment(slug, context.workspaces) : undefined;
  const canonical = workspace ? workspacePathSegment(workspace, context.workspaces) : undefined;
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!workspace || !slug || !canonical || slug === canonical) return;
    const prefix = `/workspaces/${encodeURIComponent(slug)}`;
    const suffix = location.pathname.startsWith(prefix) ? location.pathname.slice(prefix.length) : '';
    navigate(`/workspaces/${encodeURIComponent(canonical)}${suffix}${location.search}${location.hash}`, { replace: true });
  }, [workspace, slug, canonical, location.pathname, location.search, location.hash, navigate]);
  return <>{workspace && slug && <WorkspaceIncidentNotice key={`${context.token}:${workspace.id}`} token={context.token} workspaceId={workspace.id} workspaceSlug={slug} />}<Outlet context={context} /></>;
}
