import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, type RefObject } from 'react';
import { NavLink, useLocation } from 'react-router';
import {
  IconLayoutSidebarLeftCollapse as PanelLeftClose,
  IconLayoutSidebarLeftExpand as PanelLeftOpen,
  IconSelector as ChevronsUpDown,
} from '@tabler/icons-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import type { Organization, Workspace } from './dashboard-context';
import { useLocale } from './ui-locale';
import { navigation } from './navigation';
import ProductRailLink from './ProductRailLink';
import { workspaceDisplayName } from './workspace-route';

type NavItem = (typeof navigation)[number];

function WorkspaceSidebarToggle({
  buttonRef,
  supplierArea = false,
  modelsArea = false,
  settingsArea = false,
  activityArea = false,
  adminArea = false,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  supplierArea?: boolean;
  modelsArea?: boolean;
  settingsArea?: boolean;
  activityArea?: boolean;
  adminArea?: boolean;
}) {
  const { t: uiT } = useUILocale();
  const { t } = useLocale();
  const { isMobile, openMobile, state, toggleSidebar } = useSidebar();
  const expanded = isMobile ? openMobile : state === 'expanded';
  const targetArea = adminArea
    ? uiT("admin navigation")
    : activityArea
      ? uiT("activity navigation")
      : settingsArea
        ? uiT("settings navigation")
        : modelsArea
          ? uiT("model filters")
          : supplierArea
            ? uiT("provider navigation")
            : uiT("workspace navigation");
  const controlsId = adminArea
    ? 'admin-navigation'
    : activityArea
      ? 'activity-navigation'
      : settingsArea
        ? 'settings-navigation'
        : modelsArea
          ? 'model-filters'
          : supplierArea
            ? 'supplier-navigation'
            : 'workspace-navigation';

  return (
    <Button
      ref={buttonRef}
      type="button"
      variant="ghost"
      size="icon"
      className="sidebar-toggle"
      onClick={toggleSidebar}
      aria-expanded={expanded}
      aria-controls={controlsId}
      aria-label={`${expanded ? uiT("Collapse") : uiT("Expand")} ${targetArea}`}
      title={expanded ? t('Collapse navigation', '收起导航') : t('Expand navigation', '展开导航')}
    >
      {expanded ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
    </Button>
  );
}

export default function ShellHeader({
  toggleRef,
  hasSidebar,
  modelFiltersAvailable,
  supplierArea,
  supplierManagement,
  destination,
  settingsArea,
  activityArea,
  adminArea,
  workspaceDirectoryArea,
  phoneNavigation,
  brandingName,
  logo,
  activeWorkspacePath,
  activePath,
  organization,
  workspace,
  workspaces,
  selectWorkspace,
  adminSupplierId,
  adminSupplierName,
  platform,
  modelsHref,
  title,
}: {
  toggleRef: RefObject<HTMLButtonElement | null>;
  hasSidebar: boolean;
  modelFiltersAvailable: boolean;
  supplierArea: boolean;
  supplierManagement: boolean;
  destination: string;
  settingsArea: boolean;
  activityArea: boolean;
  adminArea: boolean;
  workspaceDirectoryArea: boolean;
  phoneNavigation: boolean;
  brandingName: string;
  logo: string;
  activeWorkspacePath: string;
  activePath: string;
  organization?: Organization | null;
  workspace: Workspace | null;
  workspaces: Workspace[];
  selectWorkspace: (next: Workspace) => void;
  activeNavigation: NavItem | undefined;
  scopedNavigation: NavItem[];
  adminSupplierId: string;
  adminSupplierName: string;
  platform: boolean;
  modelsHref: string;
  title: string;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const { t } = useLocale();
  const location = useLocation();
  const { state: sidebarState } = useSidebar();
  const trimmedPath = location.pathname.replace(/\/+$/, '');
  const isProviderOverview = Boolean(
    adminSupplierId && (
      trimmedPath === `/admin/providers/${encodeURIComponent(adminSupplierId)}` ||
      trimmedPath === `/admin/suppliers/${encodeURIComponent(adminSupplierId)}`
    ),
  );
  useEffect(() => {
    if (!adminSupplierId || !adminSupplierName) return;
    document.title = isProviderOverview
      ? `${adminSupplierName} · ${brandingName}`
      : `${title} · ${adminSupplierName} · ${brandingName}`;
  }, [adminSupplierId, adminSupplierName, brandingName, isProviderOverview, title]);
  const scopedWorkspaces = organization
    ? workspaces.filter(item => item.organization_id === organization.id)
    : workspaces;
  const headerWorkspaces = scopedWorkspaces.length ? scopedWorkspaces : workspaces;

  return (
    <header className="dashboard-page-header">
      {(hasSidebar || modelFiltersAvailable) && (
        <WorkspaceSidebarToggle
          buttonRef={toggleRef}
          supplierArea={supplierArea}
          settingsArea={settingsArea}
          activityArea={activityArea}
          adminArea={adminArea}
        />
      )}
      {phoneNavigation && hasSidebar && (
        <ProductRailLink className="mobile-header-brand" to={activeWorkspacePath} aria-label={uiF("{0} home", [brandingName])}>
          <img src={logo} alt="" />
        </ProductRailLink>
      )}
      {destination === 'Workspace' && !workspaceDirectoryArea && !supplierArea && !adminArea ? (
        <Breadcrumb aria-label={uiT("Breadcrumb")} className="breadcrumbs">
          <BreadcrumbList className="flex-nowrap gap-1 sm:gap-2.5">
            <BreadcrumbItem className="min-w-0 overflow-hidden gap-0">
              <BreadcrumbLink asChild>
                <ProductRailLink
                  className="max-w-20 min-w-0 shrink truncate sm:max-w-64"
                  to={activeWorkspacePath}
                >
                  {workspace ? workspaceDisplayName(workspace.name) : t('Workspace', '工作空间')}
                </ProductRailLink>
              </BreadcrumbLink>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('size-6 shrink-0', sidebarState === 'expanded' && 'min-[960px]:hidden')}
                    aria-label={uiT("Switch workspace in header")}
                    disabled={!headerWorkspaces.length}
                  >
                    <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>{t('Workspaces', '工作空间')}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={workspace?.id ?? ''}
                    onValueChange={id => {
                      const next = headerWorkspaces.find(item => item.id === id);
                      if (next) selectWorkspace(next);
                    }}
                  >
                    {headerWorkspaces.map(item => {
                      const displayName = workspaceDisplayName(item.name);
                      const hasDuplicateName = headerWorkspaces.filter(candidate => workspaceDisplayName(candidate.name) === displayName).length > 1;
                      const slugLabel = hasDuplicateName && (item.slug || item.route_slug) ? ` · ${item.slug || item.route_slug}` : '';
                      return (
                        <DropdownMenuRadioItem key={item.id} value={item.id}>
                          {displayName}{slugLabel}
                        </DropdownMenuRadioItem>
                      );
                    })}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <ProductRailLink to="/workspaces">{t('All workspaces', '所有工作空间')}</ProductRailLink>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
            <BreadcrumbSeparator>/</BreadcrumbSeparator>
            {activePath.startsWith('keys/') && (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <ProductRailLink to={`${activeWorkspacePath}/keys`}>
                      {t('API keys', 'API 密钥')}
                    </ProductRailLink>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator>/</BreadcrumbSeparator>
              </>
            )}
            {activePath.startsWith('models/') && (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <ProductRailLink to={`${activeWorkspacePath}/models`}>
                      {t('Models', '模型')}
                    </ProductRailLink>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator>/</BreadcrumbSeparator>
              </>
            )}
            <BreadcrumbItem className="min-w-0">
              <h1 className="dashboard-route-title">{title}</h1>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      ) : adminSupplierId ? (
        <Breadcrumb aria-label={uiT("Breadcrumb")} className="breadcrumbs">
          <BreadcrumbList className="flex-nowrap gap-1.5 sm:gap-2.5">
            <BreadcrumbItem className="hidden sm:inline-flex">
              <BreadcrumbLink asChild>
                <ProductRailLink to="/admin/providers">{t('Providers', '模型供应商')}</ProductRailLink>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:block" />
            {isProviderOverview ? (
              <BreadcrumbItem className="min-w-0">
                <h1 className="dashboard-route-title truncate" aria-current="page">
                  {adminSupplierName || t('Loading Provider…', '正在加载供应商…')}
                </h1>
              </BreadcrumbItem>
            ) : (
              <>
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbLink asChild>
                    <ProductRailLink
                      className="max-w-44 truncate sm:max-w-none"
                      to={`/admin/providers/${encodeURIComponent(adminSupplierId)}`}
                    >
                      {adminSupplierName || t('Loading Provider…', '正在加载供应商…')}
                    </ProductRailLink>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="min-w-0">
                  <h1 className="dashboard-route-title truncate" aria-current="page">
                    {title}
                  </h1>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      ) : (
        <Breadcrumb aria-label={uiT("Breadcrumb")} className="breadcrumbs">
          <BreadcrumbList className="flex-nowrap gap-1.5 sm:gap-2.5">
            {(settingsArea ||
              !(
                adminArea ||
                workspaceDirectoryArea ||
                destination === 'Global' ||
                destination === 'Models' ||
                (supplierArea && !supplierManagement)
              )) && (
              <>
                <BreadcrumbItem className="hidden sm:inline-flex">
                  <span>
                    {settingsArea
                      ? ['organization', 'members', 'billing', 'payments'].includes(location.pathname.split('/')[2] ?? '')
                        ? t('Organization settings', '组织设置')
                        : t('Account settings', '账户设置')
                      : supplierArea
                        ? t('Providers', '模型供应商')
                        : platform
                          ? t('Platform', '平台')
                          : t('Workspace', '工作空间')}
                  </span>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:block">/</BreadcrumbSeparator>
              </>
            )}
            <BreadcrumbItem className="min-w-0">
              <h1 className="dashboard-route-title">
                {destination === 'Models' && activePath.startsWith('models/') ? (
                  <NavLink to={modelsHref}>
                    {t('Models', '模型')}
                  </NavLink>
                ) : (
                  title
                )}
              </h1>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div
        id="dashboard-page-actions"
        className="dashboard-page-actions"
      />
    </header>
  );
}
