import { useLocation, useNavigate } from 'react-router';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DashboardContext } from './dashboard-context';
import { useLocale } from './ui-locale';
import { workspacePathSegment } from './workspace-route';

/** Section navigation belongs to the current canvas, never replaces global navigation. */
export default function ShellSectionTabs({ context }: {
  context: DashboardContext;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLocale();
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
  } else if (/^\/workspaces\/[^/]+\/(settings|guardrails|billing)(\/|$)/.test(location.pathname) && routeWorkspaceBase) {
    label = t('Workspace settings sections', '工作空间设置页面');
    const internal = context.session?.operating_mode === 'internal';
    entries = [
      { path: `${routeWorkspaceBase}/settings`, label: t('General', '常规设置') },
      ...(!internal ? [{ path: `${routeWorkspaceBase}/billing`, label: t('Billing', '账单与费率') }] : []),
      { path: `${routeWorkspaceBase}/guardrails`, label: t('Guardrails', '安全护栏') },
    ];
    selected = location.pathname.includes('/guardrails')
      ? `${routeWorkspaceBase}/guardrails`
      : location.pathname.includes('/billing') && !internal
        ? `${routeWorkspaceBase}/billing`
        : `${routeWorkspaceBase}/settings`;
  } else if (/^\/workspaces\/[^/]+\/(assets|library|video)(\/|$)/.test(location.pathname) && routeWorkspaceBase) {
    label = t('Generations sections', '生成与素材页面');
    entries = [
      { path: '/generations', label: t('Sessions', '对话会话') },
      { path: `${routeWorkspaceBase}/assets`, label: t('Assets', '素材库') },
    ];
    selected = `${routeWorkspaceBase}/assets`;
  }

  if (!entries.length) return null;
  return <Tabs
    value={selected}
    onValueChange={path => {
      if (path.includes('?')) {
        navigate(path, { state: location.state });
        return;
      }
      navigate(path + (preserveSearch ? location.search : ''), { state: location.state });
    }}
    className="mb-6 min-w-0 shrink-0"
  >
    <div className="max-w-full overflow-x-auto overflow-y-hidden"><TabsList variant="line" aria-label={label}>
      {entries.map(item => <TabsTrigger key={item.path} value={item.path}>{item.label}</TabsTrigger>)}
    </TabsList></div>
  </Tabs>;
}
