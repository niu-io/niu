import { useLocale as useUILocale } from '@/shell/ui-locale';
import { IconSettings } from '@tabler/icons-react';
import { useState } from 'react';
import { WorkspaceCreateDialog } from '@/shell/WorkspaceSwitcher';
import { Link } from 'react-router';
import { IconPlus as Plus } from "@tabler/icons-react";
import { IconUsers as UsersRound } from "@tabler/icons-react";
import ConnectGate from '@/shell/ConnectGate';
import type { DashboardContext } from '@/shell/dashboard-context';
import { prefetchRouteIntent } from '@/shell/prefetch';
import { workspaceDisplayName, workspacePathSegment } from '@/shell/workspace-route';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';

export function OrganizationSettings({ context }: { context: DashboardContext }) {
  const { t: uiT, format: uiF } = useUILocale();
  const { organization, workspaces, session } = context;
  const [createOpen, setCreateOpen] = useState(false);
  const entries = workspaces.filter(item => item.organization_id === organization?.id);
  const canCreate = session?.permissions.write && (session.kind === 'installation' || session.operator?.project_id === null);

  return <div className="organization-settings">
    <PageHeader title={uiT("Organization settings")} />
    {!organization ? <section className="panel"><p>{uiT("No organization is available. Create a workspace to get started.")}</p></section> : <>
      <section className="organization-settings-card" aria-labelledby="organization-details-title">
        <h2 id="organization-details-title">{uiT("General")}</h2>
        <dl className="organization-details"><div><dt>{uiT("Organization name")}</dt><dd>{organization.name}</dd></div></dl>
      </section>
      <section className="organization-settings-card" aria-labelledby="organization-workspaces-title">
        <div className="organization-section-heading"><div><h2 id="organization-workspaces-title">{uiT("Workspaces")}</h2></div>{canCreate && <Button variant="outline" onClick={() => setCreateOpen(true)}><Plus size={16} />{uiT("Create workspace")}</Button>}</div>
        {entries.length ? <ul className="organization-workspaces">{entries.map(item => { const seg = workspacePathSegment(item, workspaces); const overviewTo = `/workspaces/${seg}`; const settingsTo = `/workspaces/${seg}/settings`; const usersTo = `/workspaces/${seg}/users`; return <li key={item.id} className="flex items-center gap-2"><Link className="min-w-0 flex-1" to={overviewTo} onMouseEnter={() => prefetchRouteIntent(overviewTo)} onFocus={() => prefetchRouteIntent(overviewTo)}><span>{workspaceDisplayName(item.name)}</span></Link><Button asChild variant="ghost" size="icon"><Link to={settingsTo} onMouseEnter={() => prefetchRouteIntent(settingsTo)} onFocus={() => prefetchRouteIntent(settingsTo)} aria-label={uiF("Settings for {0}", [workspaceDisplayName(item.name)])} title={uiF("Settings for {0}", [workspaceDisplayName(item.name)])}><IconSettings size={16}/></Link></Button>{session?.permissions.manage_operators && <Button asChild variant="ghost" size="icon"><Link to={usersTo} onMouseEnter={() => prefetchRouteIntent(usersTo)} onFocus={() => prefetchRouteIntent(usersTo)} aria-label={uiF("Users for {0}", [workspaceDisplayName(item.name)])} title={uiF("Users for {0}", [workspaceDisplayName(item.name)])}><UsersRound size={16} /></Link></Button>}</li>; })}</ul> : <p>{uiT("No workspaces yet.")}</p>}
      </section>
      <WorkspaceCreateDialog context={context} open={createOpen} onOpenChange={setCreateOpen}/>
    </>}
  </div>;
}

export default function OrganizationRoute() {
  return <ConnectGate>{context => <OrganizationSettings key={context.organization?.id} context={context} />}</ConnectGate>;
}
