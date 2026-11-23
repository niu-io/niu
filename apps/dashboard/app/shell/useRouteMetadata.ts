import { useContext, useEffect, useMemo } from 'react';
import { useLocation, UNSAFE_DataRouterStateContext, UNSAFE_DataRouterDataContext, type UIMatch } from 'react-router';
import { catalogTitle } from '@/lib/providers';
import { canManagePlatform, type AdminSession } from './dashboard-context';
import { navigation, type NavItem } from './navigation';
import type { RouteHandle } from './router-context';
import { useLocale } from './ui-locale';

export function useRouteMetadata(session: AdminSession | null, brandingDisplayName: string) {
  const location = useLocation();
  const routes = useContext(UNSAFE_DataRouterStateContext)?.matches;
  const data = useContext(UNSAFE_DataRouterDataContext)?.loaderData;
  const matches = useMemo<UIMatch[]>(() => (routes ?? []).map(({route, params, pathname}) => ({
    id: route.id, params, pathname, handle: route.handle, loaderData: data?.[route.id],
  })), [routes, data]);
  const { isZh, t } = useLocale();

  const matchedHandles = useMemo(() => {
    const handles: RouteHandle[] = [];
    for (const match of matches) {
      if (match.handle && typeof match.handle === 'object') {
        handles.push(match.handle as RouteHandle);
      }
    }
    return handles;
  }, [matches]);

  const leafHandle = matchedHandles[matchedHandles.length - 1];
  const handleDestination = useMemo(() => {
    for (let i = matchedHandles.length - 1; i >= 0; i -= 1) {
      if (matchedHandles[i].destination) return matchedHandles[i].destination;
    }
    return undefined;
  }, [matchedHandles]);

  const isGlobalChat =
    location.pathname === '/generations' || location.pathname.startsWith('/generations/');
  const settingsArea = location.pathname === '/settings' || location.pathname.startsWith('/settings/');
  const adminArea = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
  const supplierArea =
    adminArea ||
    location.pathname === '/providers' ||
    location.pathname.startsWith('/providers/') ||
    location.pathname === '/suppliers' ||
    location.pathname.startsWith('/suppliers/');
  const supplierManagement =
    supplierArea && location.pathname !== '/providers' && location.pathname !== '/suppliers';
  const adminSupplierId =
    adminArea &&
    canManagePlatform(session) &&
    (location.pathname.startsWith('/admin/providers/') || location.pathname.startsWith('/admin/suppliers/'))
      ? location.pathname.split('/')[3]
      : '';

  const workspaceDirectoryArea = location.pathname === '/workspaces' || location.pathname === '/workspaces/';
  const usesSelectedWorkspace =
    workspaceDirectoryArea ||
    isGlobalChat ||
    location.pathname.startsWith('/activity') ||
    settingsArea ||
    supplierArea;
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
  const loginArea = normalizedPath === '/login' || normalizedPath === '/register' || normalizedPath === '/setup';
  const publicModelsArea = normalizedPath === '/models' || normalizedPath.startsWith('/models/');
  const inviteArea = location.pathname === '/invite' || location.pathname.startsWith('/invite/');
  const activityArea = location.pathname === '/activity' || location.pathname.startsWith('/activity/');

  const searchParams = new URLSearchParams(location.search);
  const videoSessionRoute = isGlobalChat && (location.pathname.startsWith('/generations/video-') || searchParams.has('video-session'));
  const videoComposerRoute = isGlobalChat && !videoSessionRoute && (location.pathname.startsWith('/generations/runs/') || searchParams.get('new') === 'video' || searchParams.has('job'));

  const activePath = location.pathname.startsWith('/workspaces/')
    ? location.pathname.split('/').filter(Boolean).slice(2).join('/') || '.'
    : location.pathname.replace(/^\/+|\/+$/g, '');

  const scopedNavigation = useMemo<NavItem[]>(
    () =>
      navigation.filter(item =>
        location.pathname.startsWith('/workspaces/')
          ? item.destination === 'Workspace'
          : item.destination !== 'Workspace',
      ),
    [location.pathname],
  );

  const activeNavigation = useMemo<NavItem | undefined>(() => {
    // An exact resource path takes precedence over inherited workspace handles.
    const exact = scopedNavigation.find(item => item.to.replace(/^\/+|\/+$/g, '') === activePath);
    if (exact) return exact;
    if (leafHandle?.navTo) {
      const byHandle = scopedNavigation.find(
        item => item.to.replace(/^\/+|\/+$/g, '') === leafHandle.navTo?.replace(/^\/+|\/+$/g, ''),
      );
      if (byHandle) return byHandle;
    }
    return (
      scopedNavigation.find(item => item.to.replace(/^\/+|\/+$/g, '') === activePath) ??
      scopedNavigation
        .filter(item => activePath.startsWith(`${item.to.replace(/^\/+|\/+$/g, '')}/`))
        .sort((a, b) => b.to.length - a.to.length)[0]
    );
  }, [leafHandle?.navTo, scopedNavigation, activePath]);

  const title =
    videoSessionRoute
      ? `${t('Video session', '视频会话')} · ${t('Generations', '多模态生成')}`
      : videoComposerRoute
        ? `${t('Video', '视频')} · ${t('Generations', '多模态生成')}`
        : location.pathname === '/connect'
      ? t('Connect your agent', '连接你的 Agent')
      : workspaceDirectoryArea
        ? t('Workspaces', '工作空间')
        : settingsArea
          ? ({
              organization: t('Organization', '组织'),
              account: t('Account', '账户'),
              appearance: t('Appearance', '外观'),
              billing: t('Credits', '额度与充值'),
              payments: t('Credits', '额度与充值'),
              members: t('Members', '成员管理'),
              about: t('About', '关于'),
            }[location.pathname.split('/')[2] ?? 'account'] ?? t('Settings', '设置'))
          : inviteArea
            ? t('Accept invitation', '接受邀请')
            : loginArea
            ? normalizedPath === '/setup'
              ? t('Initial setup', '初始化设置')
              : normalizedPath === '/register'
                ? t('Request account', '申请注册账号')
                : t('Sign in', '登录')
              : supplierArea
                ? normalizedPath === '/admin'
                  ? t('Overview', '总览')
                  : normalizedPath === '/admin/settings/registration'
                    ? t('Registration policy', '注册策略')
                    : ({
                        customers: t('Customers', '客户管理'),
                        registrations: t('Registrations', '注册审批'),
                        reports: t('Reports', '财务与用量'),
                        oauth: t('OAuth providers', 'OAuth 服务商'),
                        payments: t('Payments', '收款配置'),
                        pricing: t('Standard pricing', '标准售价'),
                        branding: t('Branding', '品牌定制'),
                        audit: t('Audit logs', '审计日志'),
                        incidents: t('Incidents', '连接事故'),
                        pools: t('Custom models', '自定义模型'),
                        routing: t('Custom models', '自定义模型'),
                        overview: t('Overview', '概览'),
                        keys: adminSupplierId ? t('API keys', 'API 密钥') : t('Connections', '上游连接'),
                        connections: t('Connections', '上游连接'),
                        models: t('Models', '模型'),
                        usage: adminSupplierId ? t('Analytics', '统计') : t('Usage', '调用量'),
                        settlements: adminSupplierId ? t('Analytics', '统计') : t('Settlements', '结算账单'),
                        settings: adminSupplierId ? t('Configuration', '配置') : t('Settings', '平台设置'),
                      }[normalizedPath.split('/').pop() ?? ''] ??
                      (normalizedPath.startsWith('/admin/customers/')
                        ? t('Customer', '客户详情')
                        : normalizedPath === '/admin/providers' || normalizedPath === '/admin/suppliers'
                        ? t('Providers', '模型供应商')
                        : supplierManagement
                          ? t('Overview', '概览')
                          : t('Providers', '模型供应商')))
                : activePath === 'keys/new'
                  ? t('New key', '新建密钥')
                  : activePath.startsWith('keys/')
                    ? t('Key', '密钥')
                    : activePath === 'events' || activePath.startsWith('events/')
                      ? t('Event subscriptions', '事件订阅')
                      : activePath === 'models'
                      ? t('Models', '模型')
                      : activePath.startsWith('models/')
                      ? catalogTitle(
                          activePath
                            .slice('models/'.length)
                            .split('/')
                            .map(segment => {
                              try {
                                return decodeURIComponent(segment);
                              } catch {
                                return segment;
                              }
                            })
                            .join('/'),
                        )
                      : activeNavigation
                        ? isZh
                          ? activeNavigation.labelZh
                          : activeNavigation.label
                        : leafHandle?.title
                          ? isZh
                            ? leafHandle.title.zh
                            : leafHandle.title.en
                          : t('Page not found', '页面未找到');

  useEffect(() => {
    document.title = `${title} · ${brandingDisplayName}`;
  }, [title, brandingDisplayName]);

  const destination =
    activeNavigation?.destination ??
    (handleDestination && handleDestination !== 'Global' ? handleDestination : undefined) ??
    'Workspace';
  const platform = destination === 'Administration';

  return {
    location,
    matches,
    isGlobalChat,
    settingsArea,
    adminArea,
    supplierArea,
    supplierManagement,
    adminSupplierId,
    workspaceDirectoryArea,
    usesSelectedWorkspace,
    loginArea,
    publicModelsArea,
    inviteArea,
    activityArea,
    activePath,
    scopedNavigation,
    activeNavigation,
    title,
    destination,
    platform,
  };
}
