import { useRef, useState } from 'react';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { IconKey, IconSparkles, IconTopologyStar as Network } from "@tabler/icons-react";
import { Link, useNavigate, useParams, type LoaderFunctionArgs } from 'react-router';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import ConnectPrompt from '@/components/ConnectPrompt';
import GatewayActivity from '@/features/executions/components/GatewayActivity';
import { QuickKeyDialog, useQuickKeyProvisioner } from '@/features/generations/QuickKeyDialog';
import OverviewQuickStart from './components/OverviewQuickStart';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import { useDashboardContext } from '@/shell/dashboard-context';
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
      ? `/api/v1/workspaces/${workspace.id}/requests?limit=10`
      : null,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function OverviewRoute() {
  const { t: uiT } = useUILocale();
  useOptionalRouteLoaderData();
  const { t } = useLocale();
  const navigate = useNavigate();
  const { token, workspace, models, modelsLoading = false, session, rememberChatKey, reloadWorkspaces } = useDashboardContext();
  const canManagePlatform = Boolean(session?.permissions?.platform_admin || (session?.kind === 'installation' && session?.permissions?.manage_operators !== false));
  const canWrite = session?.permissions.write === true;
  const { workspace: workspaceSegment } = useParams();
  const currentWorkspaceSegment = workspaceSegment || workspace?.slug || workspace?.route_slug || 'default';
  const workspaceRoot = `/workspaces/${encodeURIComponent(currentWorkspaceSegment)}`;
  const modelsHref = `${workspaceRoot}/models`;
  const chatSearch = new URLSearchParams({ new: '1' });
  if (workspaceSegment || workspace) chatSearch.set('workspace', currentWorkspaceSegment);
  const generationsTarget = `/generations?${chatSearch}`;
  const scope = workspace ? { organizationId: workspace.organization_id, projectId: workspace.id } : null;
  const catalogPending = Boolean(modelsLoading && models.length === 0);
  const needsApiKey = models.length > 0 && workspace?.active_key_count === 0;
  const [quickKeyOpen, setQuickKeyOpen] = useState(false);
  const quickKeyTriggerRef = useRef<HTMLButtonElement>(null);
  const quickKey = useQuickKeyProvisioner();

  async function handleQuickCreateAndOpen() {
    if (!token || !workspace) return;
    const created = await quickKey.run({
      token,
      organizationId: workspace.organization_id,
      workspaceId: workspace.id,
      rememberChatKey,
      reloadWorkspaces,
    });
    if (!created) return;
    setQuickKeyOpen(false);
    const nextSearch = new URLSearchParams(chatSearch);
    nextSearch.set('key', created.slug || created.id);
    navigate(`/generations?${nextSearch}`);
  }

  const emptyState = <OverviewQuickStart />;
  return <>
    <PageHeader title={t('Overview', '概览')} action={token && !catalogPending && <div className="overview-primary-actions">{models.length
      ? needsApiKey
        ? canWrite
          ? <Button ref={quickKeyTriggerRef} type="button" aria-label={t('Create API key', '创建 API 密钥')} title={t('Create API key', '创建 API 密钥')} onClick={() => { quickKey.setError(''); setQuickKeyOpen(true); }}><IconKey aria-hidden="true" /><span>{t('Create key', '创建密钥')}</span></Button>
          : <Button asChild variant="outline"><Link to={`${workspaceRoot}/keys`} className="header-icon-action"><IconKey aria-hidden="true" /><span>{t('Keys', '密钥')}</span></Link></Button>
        : <Button asChild><Link to={generationsTarget} className="header-icon-action" aria-label={t('Open Generations', '开始生成')} title={t('Open Generations', '开始生成')}><IconSparkles aria-hidden="true" /><span>{t('Open Generations', '开始生成')}</span></Link></Button>
      : canManagePlatform
        ? <Button asChild><Link to="/admin" className="header-icon-action" aria-label={t('Admin setup', '进入管理后台')} title={t('Admin setup', '进入管理后台')}><Network aria-hidden="true" /><span>{t('Admin setup', '进入管理后台')}</span></Link></Button>
        : <Button asChild><Link to={modelsHref} className="header-icon-action" aria-label={t('Browse models', '浏览模型')} title={t('Browse models', '浏览模型')}><Network aria-hidden="true" /><span>{t('Browse models', '浏览模型')}</span></Link></Button>}</div>} />

    {token && workspace && (
      <section aria-label={t('Workspace status', '工作空间状态')} className="mb-5 grid gap-3 sm:grid-cols-3">
        <Link to={modelsHref} className="flex items-center justify-between gap-3 rounded-[var(--radius-panel)] bg-card px-4 py-3.5 transition-colors hover:bg-accent/50">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t('Available models', '可用模型')}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums" aria-busy={catalogPending || undefined}>{catalogPending ? '—' : models.length}</p>
          </div>
          <span className="text-xs text-muted-foreground">{t('Browse', '查看')} →</span>
        </Link>
        <Link to={`${workspaceRoot}/keys`} className="flex items-center justify-between gap-3 rounded-[var(--radius-panel)] bg-card px-4 py-3.5 transition-colors hover:bg-accent/50">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t('Active API keys', '有效 API 密钥')}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{workspace.active_key_count ?? 0}</p>
          </div>
          <span className="text-xs text-muted-foreground">{t('Manage', '管理')} →</span>
        </Link>
        <Link to={`${workspaceRoot}/billing`} className="flex items-center justify-between gap-3 rounded-[var(--radius-panel)] bg-card px-4 py-3.5 transition-colors hover:bg-accent/50">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t('Credits & billing', '额度与账单')}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{t('Balance, top-ups & rates', '余额、充值与费率')}</p>
          </div>
          <span className="text-xs text-muted-foreground">{t('Open', '查看')} →</span>
        </Link>
      </section>
    )}

    <QuickKeyDialog
      open={quickKeyOpen}
      onOpenChange={setQuickKeyOpen}
      mode="setup"
      canWrite={canWrite}
      workspaceRoot={workspaceRoot}
      returnTo={generationsTarget}
      busy={quickKey.busy}
      error={quickKey.error}
      onQuickCreate={() => void handleQuickCreateAndOpen()}
      triggerRef={quickKeyTriggerRef}
    />

    <section className="cost-workbench" aria-label={uiT("Recent gateway requests")}>
      {token ? <GatewayActivity compact emptyState={emptyState} workspaceRoute={workspaceRoot} hideBillingLink={false} key={`${token}:${workspace?.id ?? ''}`} token={token} models={models.map(model => model.id)} initialScope={scope} /> : <div className="cost-connect panel">
        <ConnectPrompt />
      </div>}
    </section>
  </>;
}
