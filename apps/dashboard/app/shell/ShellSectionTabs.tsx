import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DashboardContext } from './dashboard-context';
import { useLocale } from './ui-locale';
import { workspacePathSegment } from './workspace-route';

/** Section navigation promotes into the top header bar (#dashboard-page-tabs) on index routes and stays off detail subroutes. */
export default function ShellSectionTabs({ context }: {
  context: DashboardContext;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLocale();
  const [tabsTarget, setTabsTarget] = useState<HTMLElement | null>(() =>
    typeof document !== 'undefined' ? document.getElementById('dashboard-page-tabs') : null,
  );
  useLayoutEffect(() => {
    setTabsTarget(typeof document !== 'undefined' ? document.getElementById('dashboard-page-tabs') : null);
  }, [location.pathname]);
  const workspace = context.workspace;
  const workspaces = context.workspaces ?? (workspace ? [workspace] : []);
  const workspaceSlug = workspace ? workspacePathSegment(workspace, workspaces) : '';
  const workspaceBase = workspaceSlug ? `/workspaces/${encodeURIComponent(workspaceSlug)}` : '';
  const routeWorkspaceMatch = /^\/workspaces\/([^/]+)\//.exec(location.pathname);
  const routeWorkspaceBase = routeWorkspaceMatch ? `/workspaces/${routeWorkspaceMatch[1]}` : workspaceBase;

  let entries: { path: string; label: string }[] = [];
  let selected = location.pathname;
  let label = '';
  let preserveSearch = false;

  if (location.pathname.startsWith('/activity')) {
    label = t('Activity sections', '活动页面');
    entries = [
      { path: '/activity', label: t('Overview', '概览') },
      { path: '/activity/logs', label: t('Logs', '请求日志') },
    ];
    preserveSearch = true;
  } else if (location.pathname.startsWith('/settings')) {
    label = t('Settings sections', '设置页面');
    const personal = context.session?.kind === 'operator';
    const billing = context.session?.operating_mode !== 'internal' && (
      context.session?.kind === 'installation' ||
      (context.session?.operator?.project_id === null && ['owner', 'admin'].includes(context.session.operator.role))
    );
    const accountPath = personal ? '/settings/account' : '/settings/appearance';
    entries = [
      ...(context.organization ? [{ path: '/settings/organization', label: t('Organization', '组织') }] : []),
      ...(context.organization && context.session?.permissions?.manage_operators ? [{ path: '/settings/members', label: t('Members', '成员管理') }] : []),
      ...(billing ? [{ path: '/settings/billing', label: t('Credits', '额度与充值') }] : []),
      { path: accountPath, label: personal ? t('Account', '账户') : t('Preferences', '偏好设置') },
    ];
    if (location.pathname === '/settings/about' || (personal && location.pathname === '/settings/appearance')) selected = accountPath;
  } else if (/^\/workspaces\/[^/]+\/(models|routing|evaluations)\/?$/.test(location.pathname) && routeWorkspaceBase) {
    label = t('Model catalog and policy sections', '模型与策略页面');
    entries = [
      { path: `${routeWorkspaceBase}/models`, label: t('Models', '模型') },
      { path: `${routeWorkspaceBase}/routing`, label: t('Routing', '模型路由') },
      { path: `${routeWorkspaceBase}/evaluations`, label: t('Evaluations', '评估') },
    ];
    selected = /\/evaluations\/?$/.test(location.pathname)
      ? `${routeWorkspaceBase}/evaluations`
      : /\/routing\/?$/.test(location.pathname)
        ? `${routeWorkspaceBase}/routing`
        : `${routeWorkspaceBase}/models`;
  } else if (/^\/workspaces\/[^/]+\/(usage|billing)\/?$/.test(location.pathname) && routeWorkspaceBase) {
    const internal = context.session?.operating_mode === 'internal';
    if (!internal) {
      label = t('Usage and billing sections', '用量与账单页面');
      entries = [
        { path: `${routeWorkspaceBase}/usage`, label: t('Usage', '用量') },
        { path: `${routeWorkspaceBase}/billing?tab=balance`, label: t('Spending', '支出') },
        { path: `${routeWorkspaceBase}/billing?tab=statements`, label: t('Statements', '账单') },
        { path: `${routeWorkspaceBase}/billing?tab=rates`, label: t('Rates', '费率') },
      ];
      if (/\/billing\/?$/.test(location.pathname)) {
        const billingTab = new URLSearchParams(location.search).get('tab');
        selected = billingTab === 'statements'
          ? `${routeWorkspaceBase}/billing?tab=statements`
          : billingTab === 'rates'
            ? `${routeWorkspaceBase}/billing?tab=rates`
            : `${routeWorkspaceBase}/billing?tab=balance`;
      } else {
        selected = `${routeWorkspaceBase}/usage`;
      }
    }
  } else if (/^\/workspaces\/[^/]+\/(settings|guardrails|events)\/?$/.test(location.pathname) && routeWorkspaceBase) {
    label = t('Workspace settings sections', '工作空间设置页面');
    entries = [
      { path: `${routeWorkspaceBase}/settings`, label: t('General', '常规设置') },
      { path: `${routeWorkspaceBase}/guardrails`, label: t('Guardrails', '安全护栏') },
      { path: `${routeWorkspaceBase}/events`, label: t('Events', '事件订阅') },
    ];
    selected = /\/guardrails\/?$/.test(location.pathname)
      ? `${routeWorkspaceBase}/guardrails`
      : /\/events\/?$/.test(location.pathname)
        ? `${routeWorkspaceBase}/events`
        : `${routeWorkspaceBase}/settings`;
  }

  if (!entries.length) return null;
  const tabsNode = (
    <Tabs
      value={selected}
      onValueChange={path => {
        if (path.includes('?')) {
          navigate(path, { state: location.state });
          return;
        }
        navigate(path + (preserveSearch ? location.search : ''), { state: location.state });
      }}
      className={tabsTarget ? 'min-w-0 shrink-0' : 'mb-6 min-w-0 shrink-0'}
    >
      <div className="max-w-full overflow-x-auto overflow-y-hidden"><TabsList variant="line" aria-label={label}>
        {entries.map(item => <TabsTrigger key={item.path} value={item.path}>{item.label}</TabsTrigger>)}
      </TabsList></div>
    </Tabs>
  );
  return tabsTarget
    ? createPortal(<div className="dashboard-header-tabs-slot">{tabsNode}</div>, tabsTarget)
    : tabsNode;
}
