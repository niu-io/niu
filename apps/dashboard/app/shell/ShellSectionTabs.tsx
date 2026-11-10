import { useLocation, useNavigate } from 'react-router';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { canManagePlatform, type DashboardContext } from './dashboard-context';
import { useLocale } from './ui-locale';

/** Section navigation belongs to the current canvas, never replaces global navigation. */
export default function ShellSectionTabs({ context }: {
  context: DashboardContext;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLocale();
  let entries: { path: string; label: string }[] = [];
  let selected = location.pathname;
  let label = '';
  if (location.pathname.startsWith('/activity')) {
    label = t('Activity sections', '活动页面');
    entries = [{path:'/activity',label:t('Overview','概览')},{path:'/activity/logs',label:t('Logs','请求日志')}];
  } else if (location.pathname.startsWith('/admin/') && canManagePlatform(context.session)) {
    label = t('Admin sections', '管理后台页面');
    entries = [
      ['providers',t('Providers','模型供应商')], ['routing',t('Routing','模型路由')], ['customers',t('Customers','客户管理')],
      ['reports',t('Financial reports','财务报表')], ['pricing',t('Pricing','定价配置')], ['payments',t('Payment gateways','支付网关')],
      ['branding',t('Branding','品牌定制')], ['audit',t('Audit logs','审计日志')], ['incidents',t('Incidents','事故')], ['settings',t('Settings','实例设置')],
    ].filter(([key]) => context.session?.operating_mode !== 'internal' || !['reports','pricing','payments'].includes(key)).map(([key,label]) => ({path:`/admin/${key}`,label}));
    selected = `/admin/${location.pathname.split('/')[2]}`;
  } else if (location.pathname.startsWith('/settings')) {
    label = t('Settings sections','设置页面');
    const personal = context.session?.kind === 'operator';
    const billing = context.session?.operating_mode !== 'internal' && (context.session?.kind === 'installation' || (context.session?.operator?.project_id === null && ['owner','admin'].includes(context.session.operator.role)));
    entries = [
      ...(context.organization ? [{path:'/settings/organization',label:t('Organization','组织')}] : []),
      ...(context.organization && context.session?.permissions?.manage_operators ? [{path:'/settings/members',label:t('Members','成员管理')}] : []),
      ...(billing ? [{path:'/settings/billing',label:t('Credits','额度与充值')}] : []),
      {path:personal ? '/settings/account' : '/settings/appearance',label:personal ? t('Account','账户') : t('Preferences','偏好设置')},
    ];
  }
  if (!entries.length) return null;
  return <Tabs value={selected} onValueChange={path => navigate(path + (label === t('Activity sections','活动页面') ? location.search : ''), {state:location.state})} className="mb-6 min-w-0 shrink-0">
    <div className="max-w-full overflow-x-auto"><TabsList variant="line" aria-label={label}>
      {entries.map(item => <TabsTrigger key={item.path} value={item.path}>{item.label}</TabsTrigger>)}
    </TabsList></div>
  </Tabs>;
}
