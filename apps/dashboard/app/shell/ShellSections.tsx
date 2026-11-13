import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
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
  useSidebar,
} from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShellNavigation, ShellAccount } from './ShellNavigation';
import type { DashboardContext, GatewayStatus, Model } from './dashboard-context';
import { prefetchRouteIntent } from './prefetch';
import { useLocale } from './ui-locale';

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

export function ShellSidebar({
  sidebarRef,
  toggleRef,
  adminArea,
  activityArea,
  settingsArea,
  supplierArea,
}: {
  sidebarRef: RefObject<HTMLDivElement | null>;
  toggleRef: RefObject<HTMLButtonElement | null>;
  adminArea: boolean;
  activityArea: boolean;
  settingsArea: boolean;
  supplierArea: boolean;
  contextual: boolean;
  creationAvailable: boolean;
  context: DashboardContext;
  activeWorkspacePath: string;
  models: Model[];
  activePath: string;
  onCreateWorkspace: () => void;
}) {
  const { setOpenMobile } = useSidebar();
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
      collapsible="icon"
      className="niu-workspace-sidebar"
      mobileClassName="niu-workspace-sidebar-mobile"
      mobileContentProps={{
        onEscapeKeyDown: event => {
          event.preventDefault();
          setOpenMobile(false);
        },
        onKeyDownCapture: event => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          setOpenMobile(false);
        },
        onCloseAutoFocus: event => {
          if (document.querySelector('[data-global-settings-dialog]')) { event.preventDefault(); return; }
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
        left: 0,
        top: 0,
        bottom: 0,
        width: 'min(280px, calc(100vw - 32px))',
        height: 'auto',
      }}
    >
      <ShellNavigation
        toggleRef={toggleRef}
        adminArea={adminArea}
        activityArea={activityArea}
        settingsArea={settingsArea}
        supplierArea={supplierArea}
      />
      <ShellAccount />
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
      <div ref={supplierTabsRef} className="max-w-full overflow-x-auto overflow-y-hidden">
        <TabsList variant="line" aria-label={t('Provider sections', '供应商详情分区')}>
          {[
            ['overview', t('Overview', '概览')],
            ['keys', t('API keys', 'API 密钥')],
            ['models', t('Models', '模型')],
            ['usage', t('Usage', '调用量')],
            ['settlements', t('Settlements', '结算账单')],
            ['members', t('Members', '成员')],
            ['settings', t('Settings', '设置')],
          ]
            .filter(([value]) => operatingMode !== 'internal' || !['settlements', 'members'].includes(value))
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
