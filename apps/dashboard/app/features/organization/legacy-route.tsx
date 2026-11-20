import { useMemo } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { useDashboardContext } from '@/shell/dashboard-context';
import { resolveWorkspacePathSegment } from '@/shell/workspace-route';

/**
 * `/workspaces/:workspace/organization` used to be a workspace-scoped copy of
 * organization governance. It now resolves to the canonical organization
 * Settings page while keeping its organization selection, query, hash and
 * navigation state.
 */
export default function OrganizationLegacyRoute() {
  const context = useDashboardContext();
  const { workspace: segment } = useParams();
  const location = useLocation();
  const workspace = segment ? resolveWorkspacePathSegment(segment, context.workspaces) : context.workspace;
  const organization =
    context.organizations.find(item => item.id === (workspace?.organization_id ?? context.organization?.id)) ??
    context.organization;
  const query = new URLSearchParams(location.search);
  if (!query.has('organization') && organization) {
    query.set('organization', organization.slug || organization.id);
  }
  const search = query.toString();
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
    to={`/settings/organization${search ? `?${search}` : ''}${location.hash}`}
  />;
}
