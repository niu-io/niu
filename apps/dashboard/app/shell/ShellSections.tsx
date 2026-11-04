import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Cpu as RailModels, FolderKey as RailWorkspace } from 'lucide-react';
import {
  IconBook as RailDocs,
  IconBookFilled as RailDocsFilled,
  IconChartLine as ChartNoAxesCombined,
  IconLayoutDashboard as LayoutDashboard,
  IconListDetails,
  IconShieldLock,
  IconSparkles as RailChat,
  IconWifiOff as WifiOff,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SettingsNavigation } from '@/features/account/settings-shell';
import AccountMenu from './AccountMenu';
import type { DashboardContext, GatewayStatus, Model } from './dashboard-context';
import { prefetchRouteIntent } from './prefetch';
import ProductRailLink from './ProductRailLink';
import { ProviderNav } from './ProviderNav';
import { useLocale } from './ui-locale';
import WorkspaceNav from './WorkspaceNav';

export function SignOutFailureDialog({
  open,
  onOpenChange,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
}) {
  const { t } = useLocale();
  if (!open) return null;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Could not sign out', '无法退出登录')}</DialogTitle>
          <DialogDescription>
            {t(
              'Your session has not been confirmed revoked. Try again when the connection is available.',
              '尚未确认注销您的会话，请在网络连接恢复后重试。',
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onRetry}>{t('Try again', '重试')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GatewayOutageDialog({
  open,
  checking,
  onRetry,
}: {
  open: boolean;
  checking: boolean;
  onRetry: () => void;
}) {
  const { t } = useLocale();
  if (!open) return null;
  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={event => event.preventDefault()}
        onInteractOutside={event => event.preventDefault()}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <WifiOff className="mb-2 size-6 text-muted-foreground" aria-hidden="true" />
          <DialogTitle>{t('Gateway unavailable', '网关不可用')}</DialogTitle>
          <DialogDescription>
            {t(
              'We couldn’t reach the gateway. We’ll reconnect automatically when the service returns.',
              '无法连接到网关。服务恢复后将自动重新连接。',
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button disabled={checking} onClick={onRetry}>
            {checking ? t('Checking…', '正在检查…') : t('Try again', '重试')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShellRail({
  brandingDisplayName,
  logo,
  showWorkspaceAreas,
  activeWorkspacePath,
  destination,
  pathname,
  supplierArea,
  generationsHref,
  activePath,
  modelsHref,
  token,
  isInstallation,
  helpArea,
  context,
}: {
  brandingDisplayName: string;
  logo: string;
  showWorkspaceAreas: boolean;
  activeWorkspacePath: string;
  destination: string;
  pathname: string;
  supplierArea: boolean;
  generationsHref: string;
  activePath: string;
  modelsHref: string;
  token: string;
  isInstallation: boolean;
  helpArea: boolean;
  context: DashboardContext;
}) {
  const { t, format: uiF } = useLocale();
  const uiT = (en: string) => t(en, en);
  return (
    <nav className="app-rail" aria-label={uiT('Product navigation')}>
      <a className="rail-logo" href={import.meta.env.BASE_URL} aria-label={uiF('{0} home', [brandingDisplayName])}>
        <img src={logo} alt="" />
      </a>
      {showWorkspaceAreas && (
        <Tooltip delayDuration={250}>
          <TooltipTrigger asChild>
            <ProductRailLink
              to={activeWorkspacePath}
              end
              className={`rail-item${
                destination === 'Workspace' && pathname.startsWith('/workspaces/') && !supplierArea
                  ? ' selected'
                  : ''
              }`}
              aria-label={t('Workspace', '工作空间')}
            >
              <RailWorkspace size={23} strokeWidth={1.7} />
            </ProductRailLink>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            {t('Workspace', '工作空间')}
          </TooltipContent>
        </Tooltip>
      )}
      {showWorkspaceAreas && (
        <>
          <Tooltip delayDuration={250}>
            <TooltipTrigger asChild>
              <ProductRailLink
                to={generationsHref}
                className={`rail-item${
                  activePath === 'generations' || activePath.startsWith('generations/') ? ' selected' : ''
                }`}
                aria-label={t('Generations', '生成对话')}
              >
                <RailChat size={23} stroke={1.7} />
              </ProductRailLink>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {t('Generations', '生成对话')}
            </TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={250}>
            <TooltipTrigger asChild>
              <ProductRailLink
                to="/activity"
                className={`rail-item${activePath.startsWith('activity') ? ' selected' : ''}`}
                aria-label={t('Activity', '活动')}
              >
                <ChartNoAxesCombined size={23} aria-hidden="true" />
              </ProductRailLink>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {t('Activity', '活动')}
            </TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={250}>
            <TooltipTrigger asChild>
              <ProductRailLink
                to={modelsHref}
                reloadDocument={!token}
                disablePrefetch={!token}
                className={`rail-item${destination === 'Models' ? ' selected' : ''}`}
                aria-label={t('Models', '模型')}
              >
                <RailModels size={23} strokeWidth={1.7} />
              </ProductRailLink>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {t('Models', '模型')}
            </TooltipContent>
          </Tooltip>
        </>
      )}
      <div className="rail-bottom">
        {isInstallation && (
          <Tooltip delayDuration={250}>
            <TooltipTrigger asChild>
              <ProductRailLink
                to="/admin/providers"
                className={`rail-item${supplierArea ? ' selected' : ''}`}
                aria-label={t('Admin', '管理后台')}
              >
                <IconShieldLock size={24} aria-hidden="true" />
              </ProductRailLink>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {t('Admin', '管理后台')}
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip delayDuration={250}>
          <TooltipTrigger asChild>
            <ProductRailLink
              className={`rail-item${helpArea ? ' selected' : ''}`}
              to="/help/"
              aria-label={t('Docs', '文档')}
            >
              {helpArea ? <RailDocsFilled size={23} /> : <RailDocs size={23} stroke={1.7} />}
            </ProductRailLink>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            {t('Docs', '文档')}
          </TooltipContent>
        </Tooltip>
        <AccountMenu context={context} workspacePath={activeWorkspacePath} supplierArea={supplierArea} />
      </div>
    </nav>
  );
}

export function ShellSidebar({
  sidebarRef,
  toggleRef,
  adminArea,
  activityArea,
  settingsArea,
  supplierArea,
  phoneNavigation,
  creationAvailable,
  context,
  activeWorkspacePath,
  models,
  activePath,
  onCreateWorkspace,
}: {
  sidebarRef: RefObject<HTMLDivElement | null>;
  toggleRef: RefObject<HTMLButtonElement | null>;
  adminArea: boolean;
  activityArea: boolean;
  settingsArea: boolean;
  supplierArea: boolean;
  phoneNavigation: boolean;
  creationAvailable: boolean;
  context: DashboardContext;
  activeWorkspacePath: string;
  models: Model[];
  activePath: string;
  onCreateWorkspace: () => void;
}) {
  const { t } = useLocale();
  const uiT = (en: string) => t(en, en);
  const location = useLocation();
  return (
    <Sidebar
      ref={sidebarRef}
      id={
        adminArea
          ? 'admin-navigation'
          : activityArea
            ? 'activity-navigation'
            : settingsArea
              ? 'settings-navigation'
              : supplierArea
                ? 'supplier-navigation'
                : 'workspace-navigation'
      }
      side="left"
      variant="sidebar"
      collapsible="offcanvas"
      className="niu-workspace-sidebar"
      mobileClassName="niu-workspace-sidebar-mobile"
      mobileContentProps={{
        onCloseAutoFocus: event => {
          if (toggleRef.current?.isConnected) {
            event.preventDefault();
            toggleRef.current.focus();
          }
        },
        onInteractOutside: event => {
          const target = event.detail.originalEvent.target;
          if (
            target instanceof Element &&
            target.closest('.app-rail, .account-menu, [data-slot="dropdown-menu-sub-content"]')
          ) {
            event.preventDefault();
          }
        },
      }}
      mobileStyle={{
        left: 'var(--rail)',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(var(--context), calc(100vw - var(--rail)))',
        height: 'auto',
      }}
    >
      {activityArea ? (
        <>
          <SidebarHeader className="sidebar-heading">
            <h2 className="sidebar-heading-row">{t('Activity', '活动')}</h2>
          </SidebarHeader>
          <SidebarContent className="workspace-sidebar-content">
            <nav aria-label={uiT('Activity navigation')}>
              <SidebarMenu className="workspace-nav-menu">
                {[
                  { to: '/activity', label: t('Overview', '概览'), icon: LayoutDashboard },
                  { to: '/activity/logs', label: t('Logs', '请求日志'), icon: IconListDetails },
                ].map(item => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={location.pathname === item.to} className="nav-item">
                      <ProductRailLink to={item.to + location.search} end>
                        <item.icon className="nav-icon" aria-hidden="true" />
                        <span>{item.label}</span>
                      </ProductRailLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarContent>
        </>
      ) : settingsArea ? (
        <SettingsNavigation context={context} />
      ) : adminArea || supplierArea ? (
        <ProviderNav context={context} />
      ) : (
        <WorkspaceNav
          creationAvailable={creationAvailable}
          context={context}
          activeWorkspacePath={activeWorkspacePath}
          models={models}
          activePath={activePath}
          onCreateWorkspace={onCreateWorkspace}
        />
      )}
      {phoneNavigation && (
        <SidebarFooter>
          <AccountMenu context={context} workspacePath={activeWorkspacePath} supplierArea={supplierArea} mobile />
        </SidebarFooter>
      )}
    </Sidebar>
  );
}

export function AdminProviderTabs({
  adminSupplierId,
  operatingMode,
  gatewayStatus,
}: {
  adminSupplierId: string;
  operatingMode: string | undefined;
  gatewayStatus: GatewayStatus;
}) {
  const { t } = useLocale();
  const uiT = (en: string) => t(en, en);
  const location = useLocation();
  const navigate = useNavigate();
  const supplierTabsRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const strip = supplierTabsRef.current;
    if (!strip) return;
    const revealActiveTab = () =>
      strip
        .querySelector<HTMLElement>('[role="tab"][data-state="active"]')
        ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    revealActiveTab();
    const observer = new ResizeObserver(revealActiveTab);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [location.pathname, gatewayStatus]);

  return (
    <Tabs
      value={location.pathname.split('/')[4] || 'overview'}
      onValueChange={section =>
        navigate(
          `/admin/providers/${encodeURIComponent(adminSupplierId)}${
            section === 'overview' ? '' : '/' + section
          }`,
        )
      }
      className="mb-6 min-w-0"
    >
      <div ref={supplierTabsRef} className="max-w-full overflow-x-auto">
        <TabsList variant="line" aria-label={uiT('Provider sections')}>
          {[
            ['overview', t('Overview', '概览')],
            ['keys', t('API keys', 'API 密钥')],
            ['models', t('Models', '模型')],
            ['usage', t('Usage', '调用量')],
            ['settlements', t('Settlements', '结算账单')],
            ['settings', t('Settings', '设置')],
          ]
            .filter(([value]) => operatingMode !== 'internal' || !['settlements'].includes(value))
            .map(([value, label]) => {
              const tabPath = `/admin/providers/${encodeURIComponent(adminSupplierId)}${
                value === 'overview' ? '' : '/' + value
              }`;
              return (
                <TabsTrigger
                  key={value}
                  value={value}
                  onPointerEnter={() => prefetchRouteIntent(tabPath)}
                  onFocus={() => prefetchRouteIntent(tabPath)}
                >
                  {label}
                </TabsTrigger>
              );
            })}
        </TabsList>
      </div>
    </Tabs>
  );
}
