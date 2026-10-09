import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconMessage as MessageSquareText } from "@tabler/icons-react";
import { IconTopologyStar as Network } from "@tabler/icons-react";
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import ConnectPrompt from '@/components/ConnectPrompt';
import GatewayActivity from '@/features/executions/components/GatewayActivity';
import { useDashboardContext } from '@/app/dashboard-context';

export default function OverviewRoute() {
  const { token, workspace, models, session } = useDashboardContext();
  const canManagePlatform = Boolean((session?.kind === 'installation' || session?.permissions?.platform_admin) && session?.permissions?.manage_operators);
  const { workspace: workspaceSegment } = useParams();
  const chatSearch = new URLSearchParams({ new: '1' });
  if (workspaceSegment || workspace?.id) chatSearch.set('workspace', workspaceSegment || workspace!.id);
  const scope = workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null;
  return <>
    <PageHeader title="Overview" action={token && <div className="overview-primary-actions">{models.length
      ? <Button asChild><Link to={`/generations?${chatSearch}`} className="header-icon-action" aria-label="Compare models" title="Compare models"><MessageSquareText aria-hidden="true" /><span>Compare models</span></Link></Button>
      : canManagePlatform
        ? <Button asChild><Link to="/admin/suppliers" className="header-icon-action" aria-label="Connect supplier" title="Connect supplier"><Network aria-hidden="true" /><span>Connect supplier</span></Link></Button>
        : <Button asChild><Link to="models" className="header-icon-action" aria-label="Browse models" title="Browse models"><Network aria-hidden="true" /><span>Browse models</span></Link></Button>}<Button asChild variant="outline"><Link to="keys" className="header-icon-action" aria-label="API keys" title="API keys"><KeyRound aria-hidden="true" /><span>API keys</span></Link></Button></div>} />

    <section className="cost-workbench" aria-label="Recent gateway requests">
      {token ? <GatewayActivity compact key={`${token}:${workspace?.id ?? ''}`} token={token} models={models.map(model => model.id)} initialScope={scope} /> : <div className="cost-connect panel">
        <ConnectPrompt />
      </div>}
    </section>
  </>;
}
