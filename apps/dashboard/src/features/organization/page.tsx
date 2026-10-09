import { IconSettings } from '@tabler/icons-react';
import MediaRateHistory from '@/features/provider-business/MediaRateHistory';
import { useState } from 'react';
import { WorkspaceCreateDialog } from '@/app/WorkspaceSwitcher';
import { Link } from 'react-router';
import { IconArrowUpRight as ArrowUpRight } from "@tabler/icons-react";
import { IconPlus as Plus } from "@tabler/icons-react";
import { IconUsers as UsersRound } from "@tabler/icons-react";
import ConnectGate from '@/app/ConnectGate';
import type { DashboardContext } from '@/app/dashboard-context';
import { workspaceDisplayName, workspacePathSegment } from '@/app/workspace-route';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';

export function OrganizationSettings({ context }: { context: DashboardContext }) {
  const { organization, workspaces, session } = context;
  const [createOpen, setCreateOpen] = useState(false);
  const entries = workspaces.filter(item => item.organization_id === organization?.id);
  const canCreate = session?.permissions.write && (session.kind === 'installation' || session.operator?.project_id === null);

  return <div className="organization-settings">
    <PageHeader title="Organization settings" />
    {!organization ? <section className="panel"><p>No organization is available. Create a workspace to get started.</p></section> : <>
      <section className="organization-settings-card" aria-labelledby="organization-details-title">
        <h2 id="organization-details-title">General</h2>
        <dl className="organization-details"><div><dt>Organization name</dt><dd>{organization.name}</dd></div></dl>
      </section>
      <section className="organization-settings-card" aria-labelledby="organization-workspaces-title">
        <div className="organization-section-heading"><div><h2 id="organization-workspaces-title">Workspaces</h2></div>{canCreate && <Button variant="outline" onClick={() => setCreateOpen(true)}><Plus size={16} />Create workspace</Button>}</div>
        {entries.length ? <ul className="organization-workspaces">{entries.map(item => <li key={item.id} className="flex items-center gap-2"><Link className="min-w-0 flex-1" to={`/workspaces/${workspacePathSegment(item, workspaces)}`}><span>{workspaceDisplayName(item.name)}</span><ArrowUpRight size={16} aria-hidden="true" /></Link><Button asChild variant="ghost" size="icon"><Link to={`/workspaces/${workspacePathSegment(item, workspaces)}/settings`} aria-label={`Settings for ${workspaceDisplayName(item.name)}`} title={`Settings for ${workspaceDisplayName(item.name)}`}><IconSettings size={16}/></Link></Button>{session?.permissions.manage_operators && <Button asChild variant="ghost" size="icon"><Link to={`/workspaces/${workspacePathSegment(item, workspaces)}/users`} aria-label={`Users for ${workspaceDisplayName(item.name)}`} title={`Users for ${workspaceDisplayName(item.name)}`}><UsersRound size={16} /></Link></Button>}</li>)}</ul> : <p>No workspaces yet.</p>}
      </section>
      {(session?.kind === 'installation' || session?.permissions.platform_admin) && <section className="organization-settings-card" aria-labelledby="organization-pricing-title">
        <h2 id="organization-pricing-title">Media selling rates</h2>
        <MediaRateHistory token={context.token} organization={organization.id} canConfigure={Boolean(session.permissions.write)}/>
      </section>}
      <WorkspaceCreateDialog context={context} open={createOpen} onOpenChange={setCreateOpen}/>
    </>}
  </div>;
}

export default function OrganizationRoute() {
  return <ConnectGate>{context => <OrganizationSettings key={context.organization?.id} context={context} />}</ConnectGate>;
}
