import type { RefObject } from 'react';
import { NavLink, useNavigate } from 'react-router';
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
import type { Workspace } from './dashboard-context';
import { useLocale } from './locale';
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
  const { t } = useLocale();
  const { isMobile, openMobile, state, toggleSidebar } = useSidebar();
  const expanded = isMobile ? openMobile : state === 'expanded';
  const targetArea = adminArea
    ? 'admin navigation'
    : activityArea
      ? 'activity navigation'
      : settingsArea
        ? 'settings navigation'
        : modelsArea
          ? 'model filters'
          : supplierArea
            ? 'provider navigation'
            : 'workspace navigation';
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
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${targetArea}`}
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
  isGuardrailEditor,
  workspace,
  workspaces,
  selectWorkspace,
  activeNavigation,
  scopedNavigation,
  adminSupplierId,
  adminSupplierName,
  platform,
  modelsHref,
  token,
  title,
  setupBlocked,
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
  isGuardrailEditor: boolean;
  workspace: Workspace | null;
  workspaces: Workspace[];
  selectWorkspace: (next: Workspace) => void;
  activeNavigation: NavItem | undefined;
  scopedNavigation: NavItem[];
  adminSupplierId: string;
  adminSupplierName: string;
  platform: boolean;
  modelsHref: string;
  token: string;
  title: string;
  setupBlocked: boolean;
}) {
  const { isZh, t } = useLocale();
  const navigate = useNavigate();

  return (
    <header className="dashboard-page-header">
      {(hasSidebar || modelFiltersAvailable) && (
        <WorkspaceSidebarToggle
          buttonRef={toggleRef}
          supplierArea={supplierArea}
          modelsArea={destination === 'Models'}
          settingsArea={settingsArea}
          activityArea={activityArea}
          adminArea={adminArea}
        />
      )}
      {phoneNavigation && hasSidebar && (
        <a className="mobile-header-brand" href={import.meta.env.BASE_URL} aria-label={`${brandingName} home`}>
          <img src={logo} alt="" />
        </a>
      )}
      {destination === 'Workspace' && !workspaceDirectoryArea && !supplierArea && !adminArea ? (
        <Breadcrumb aria-label="Breadcrumb" className="breadcrumbs">
          <BreadcrumbList className="flex-nowrap gap-1 sm:gap-2.5">
            <BreadcrumbItem className="min-w-0 gap-0">
              <BreadcrumbLink asChild>
                <ProductRailLink
                  className={`truncate ${activePath.startsWith('guardrails/') ? 'max-w-12' : 'max-w-16'} sm:max-w-64`}
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
                    className="size-6 shrink-0"
                    aria-label="Switch workspace in header"
                    disabled={!workspaces.length}
                  >
                    <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>{t('Workspaces', '工作空间')}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={workspace?.id ?? ''}
                    onValueChange={id => {
                      const next = workspaces.find(item => item.id === id);
                      if (next) selectWorkspace(next);
                    }}
                  >
                    {workspaces.map(item => (
                      <DropdownMenuRadioItem key={item.id} value={item.id}>
                        {workspaceDisplayName(item.name)}
                      </DropdownMenuRadioItem>
                    ))}
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
            {activePath.startsWith('guardrails/') && (
              <>
                <BreadcrumbItem className="hidden sm:inline-flex">
                  <BreadcrumbLink asChild>
                    <ProductRailLink to={`${activeWorkspacePath}/guardrails`}>
                      {t('Guardrails', '安全护栏')}
                    </ProductRailLink>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:block">/</BreadcrumbSeparator>
              </>
            )}
            {isGuardrailEditor && (
              <>
                <BreadcrumbItem className="hidden sm:inline-flex">
                  <BreadcrumbLink asChild>
                    <ProductRailLink to={`${activeWorkspacePath}/guardrails/policy`}>
                      {t('Policy', '策略')}
                    </ProductRailLink>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:block">/</BreadcrumbSeparator>
              </>
            )}
            {activePath.startsWith('guardrails/') && (
              <>
                <BreadcrumbItem className="sm:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-6" aria-label="Show parent pages">
                        …
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem asChild>
                        <ProductRailLink to={`${activeWorkspacePath}/guardrails`}>
                          {t('Guardrails', '安全护栏')}
                        </ProductRailLink>
                      </DropdownMenuItem>
                      {isGuardrailEditor && (
                        <DropdownMenuItem asChild>
                          <ProductRailLink to={`${activeWorkspacePath}/guardrails/policy`}>
                            {t('Policy', '策略')}
                          </ProductRailLink>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="sm:hidden">/</BreadcrumbSeparator>
              </>
            )}
            <BreadcrumbItem className="min-w-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-auto min-w-0 max-w-full gap-1 px-1 py-1"
                    aria-label="Switch workspace page"
                  >
                    <h1 className="dashboard-route-title">{title}</h1>
                    <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={activeNavigation?.to ?? ''}
                    onValueChange={value =>
                      navigate(value === '.' ? activeWorkspacePath : `${activeWorkspacePath}/${value}`)
                    }
                  >
                    {scopedNavigation
                      .filter(item => item.destination === 'Workspace')
                      .map(item => (
                        <DropdownMenuRadioItem key={item.to} value={item.to}>
                          {isZh ? item.labelZh : item.label}
                        </DropdownMenuRadioItem>
                      ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      ) : adminSupplierId ? (
        <Breadcrumb aria-label="Breadcrumb" className="breadcrumbs">
          <BreadcrumbList>
            <BreadcrumbItem className="hidden sm:inline-flex">
              <BreadcrumbLink asChild>
                <ProductRailLink to="/admin/providers">{t('Providers', '模型供应商')}</ProductRailLink>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:block" />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <ProductRailLink
                  className="max-w-28 truncate sm:max-w-none"
                  to={`/admin/providers/${encodeURIComponent(adminSupplierId)}`}
                >
                  {adminSupplierName || t('Loading Provider…', '正在加载供应商…')}
                </ProductRailLink>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <h1 className="dashboard-route-title" aria-current="page">
                {title}
              </h1>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      ) : (
        <Breadcrumb aria-label="Breadcrumb" className="breadcrumbs">
          {!(
            adminArea ||
            workspaceDirectoryArea ||
            destination === 'Global' ||
            destination === 'Models' ||
            (supplierArea && !supplierManagement)
          ) && (
            <>
              <span>
                {settingsArea
                  ? t('Settings', '设置')
                  : supplierArea
                    ? t('Providers', '模型供应商')
                    : platform
                      ? t('Platform', '平台')
                      : destination === 'Organization'
                        ? t('Organization', '组织')
                        : t('Workspace', '工作空间')}
              </span>
              <span className="crumb-divider" aria-hidden="true">
                /
              </span>
            </>
          )}
          <h1 className="dashboard-route-title">
            {destination === 'Models' && activePath.startsWith('models/') ? (
              <NavLink to={modelsHref} reloadDocument={!token}>
                {t('Models', '模型')}
              </NavLink>
            ) : (
              title
            )}
          </h1>
        </Breadcrumb>
      )}
      <div
        id="dashboard-page-actions"
        className="dashboard-page-actions"
        hidden={setupBlocked}
        style={setupBlocked ? { display: 'none' } : undefined}
      />
    </header>
  );
}
