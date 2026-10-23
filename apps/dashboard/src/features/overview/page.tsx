import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconMessage as MessageSquareText } from "@tabler/icons-react";
import { IconTopologyStar as Network } from "@tabler/icons-react";
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import ConnectPrompt from '@/components/ConnectPrompt';
import GatewayActivity from '@/features/executions/components/GatewayActivity';
import { useDashboardContext } from '@/app/dashboard-context';
import { workspacePathSegment } from '@/app/workspace-route';
import { useLocale } from '@/app/locale';

export default function OverviewRoute() {
  const { t } = useLocale();
  const { token, workspace, workspaces, models, session } = useDashboardContext();
  const canManagePlatform = Boolean(session?.permissions?.platform_admin || (session?.kind === 'installation' && session?.permissions?.manage_operators !== false));
  const { workspace: workspaceSegment } = useParams();
  const chatSearch = new URLSearchParams({ new: '1' });
  if (workspaceSegment || workspace) chatSearch.set('workspace', workspaceSegment || workspacePathSegment(workspace!, workspaces ?? [workspace!]));
  const scope = workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null;
  return <>
    <PageHeader title={t('Overview', '概览')} action={token && <div className="overview-primary-actions">{models.length
      ? <Button asChild><Link to={`/generations?${chatSearch}`} className="header-icon-action" aria-label={t('Compare models', '对比模型')} title={t('Compare models', '对比模型')}><MessageSquareText aria-hidden="true" /><span>{t('Compare models', '对比模型')}</span></Link></Button>
      : canManagePlatform
        ? <Button asChild><Link to="/admin/providers" className="header-icon-action" aria-label={t('Connect provider', '接入供应商')} title={t('Connect provider', '接入供应商')}><Network aria-hidden="true" /><span>{t('Connect provider', '接入供应商')}</span></Link></Button>
        : <Button asChild><Link to="models" className="header-icon-action" aria-label={t('Browse models', '浏览模型')} title={t('Browse models', '浏览模型')}><Network aria-hidden="true" /><span>{t('Browse models', '浏览模型')}</span></Link></Button>}<Button asChild variant="outline"><Link to="keys" className="header-icon-action" aria-label={t('API keys', 'API 密钥')} title={t('API keys', 'API 密钥')}><KeyRound aria-hidden="true" /><span>{t('API keys', 'API 密钥')}</span></Link></Button></div>} />

    <section className="cost-workbench" aria-label="Recent gateway requests">
      {token ? <GatewayActivity compact key={`${token}:${workspace?.id ?? ''}`} token={token} models={models.map(model => model.id)} initialScope={scope} /> : <div className="cost-connect panel">
        <ConnectPrompt />
      </div>}
    </section>
  </>;
}
