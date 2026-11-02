import { useLocale as useUILocale } from '@/shell/ui-locale';
import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconMessage as MessageSquareText } from "@tabler/icons-react";
import { IconTopologyStar as Network } from "@tabler/icons-react";
import { Link, useParams, type LoaderFunctionArgs } from 'react-router';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import ConnectPrompt from '@/components/ConnectPrompt';
import GatewayActivity from '@/features/executions/components/GatewayActivity';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import { useDashboardContext } from '@/shell/dashboard-context';
import { workspacePathSegment } from '@/shell/workspace-route';
import type { RouteHandle } from '@/shell/router-context';
import { useLocale } from '@/shell/ui-locale';

export const handle: RouteHandle = {
  destination: 'Workspace',
  navTo: '.',
  title: { en: 'Overview', zh: '概览' },
};

export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ workspace }) => ({
    endpoint: workspace
      ? `/api/v1/organizations/${workspace.organization_id}/projects/${workspace.id}/requests?limit=10`
      : null,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function OverviewRoute() {
  const { t: uiT } = useUILocale();
  useOptionalRouteLoaderData();
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

    <section className="cost-workbench" aria-label={uiT("Recent gateway requests")}>
      {token ? <GatewayActivity compact showBreakdowns key={`${token}:${workspace?.id ?? ''}`} token={token} models={models.map(model => model.id)} initialScope={scope} /> : <div className="cost-connect panel">
        <ConnectPrompt />
      </div>}
    </section>
  </>;
}
