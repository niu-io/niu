import { usePaymentReadiness } from './payment-readiness';
import { useMockPayments } from './mock-payments';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { TriangleAlert } from 'lucide-react';
import { IconPalette, IconHistory, IconRoute, IconWallet, IconLanguage } from '@tabler/icons-react';
import { IconKey as KeyRound, IconUsers as Users } from '@tabler/icons-react';
import RouterPending from './RouterPending';
import { IconListDetails } from '@tabler/icons-react';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { IconShieldLock } from '@tabler/icons-react';
import { FolderKey as RailWorkspace } from "lucide-react";
import { IconSparkles as RailChat } from "@tabler/icons-react";
import { Cpu as RailModels } from "lucide-react";
import { IconPlugConnected as RailSuppliers } from "@tabler/icons-react";
import { IconBook as RailDocs, IconBookFilled as RailDocsFilled } from "@tabler/icons-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react';
import { IconLayoutDashboard as LayoutDashboard } from "@tabler/icons-react";
import { IconCreditCard as CreditCard } from "@tabler/icons-react";
import { IconChartLine as ChartNoAxesCombined } from "@tabler/icons-react";
import { IconAdjustmentsHorizontal as Settings2 } from "@tabler/icons-react";
import { IconHelpCircle as CircleHelp } from "@tabler/icons-react";
import { IconCpu as Boxes } from "@tabler/icons-react";
import { IconLayoutSidebarLeftCollapse as PanelLeftClose } from "@tabler/icons-react";
import { IconLayoutSidebarLeftExpand as PanelLeftOpen } from "@tabler/icons-react";
import { NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams, type NavLinkProps } from 'react-router';
import { IconSelector as ChevronsUpDown } from "@tabler/icons-react";
import { IconPlus as Plus } from "@tabler/icons-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { request } from '@/features/providers/api';
import { IconWifiOff as WifiOff } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { canManagePlatform, type AdminSession, type DashboardContext, type GatewayStatus, type Model, type Organization, type SessionChatKey, type Workspace, type WorkspaceProblem } from './dashboard-context';
import { navigation } from './navigation';
import AccountMenu from './AccountMenu';
import { SettingsDialog, settingsHref, SettingsNavigation } from '@/features/account/settings-page';
import { useAccountAppearance } from './useAccountAppearance';
import WorkspaceSwitcher, { WorkspaceCreateDialog } from './WorkspaceSwitcher';
import WorkspaceRecovery from './WorkspaceRecovery';
import { useGatewayConnection } from './useGatewayConnection';
import { providerPathSegment, resolveProvider, type ProviderIdentity } from './provider-route';
import { resolveWorkspacePathSegment, workspacePathSegment, workspaceDisplayName, workspaceModelsHref } from './workspace-route';
import { useBranding } from './branding';
import { useLocale, type Locale } from './locale';

import { useWorkspaceVideo } from '@/features/provider-modules/useWorkspaceVideo';

const sidebarBreakpoint = 960;

function WorkspaceNav({
  context,
  activeWorkspacePath,
  models,
  activePath,
  onCreateWorkspace,
  creationAvailable,
}: {
  context: DashboardContext;
  activeWorkspacePath: string;
  models: Model[];
  activePath: string;
  onCreateWorkspace: () => void;
  creationAvailable: boolean;
}) {
  const { isZh, t } = useLocale();
  const { isMobile, setOpenMobile } = useSidebar();
  const videoAvailable = useWorkspaceVideo(context);
  const navItems = navigation.filter(item => item.destination === 'Workspace'
    && (item.to !== 'video' || videoAvailable)
    && (item.to !== 'costs' || context.session?.kind === 'installation'));

  return <>
    <SidebarHeader className="sidebar-heading"><WorkspaceSwitcher context={context} creationAvailable={creationAvailable} onCreateWorkspace={onCreateWorkspace} /></SidebarHeader>
    <SidebarContent className="workspace-sidebar-content">
      <nav aria-label="Main navigation">
        <SidebarMenu className="workspace-nav-menu">
          {navItems.map(item => {
            const path = item.to === '.' ? activeWorkspacePath : `${activeWorkspacePath}/${item.to}`;
            const isActive = item.to === '.' ? activePath === '.' : activePath === item.to || activePath.startsWith(`${item.to.replace(/^\/+|\/+$/g, '')}/`);
            const displayLabel = isZh ? item.labelZh : item.label;
            return <SidebarMenuItem key={item.to}>
              <SidebarMenuButton asChild isActive={isActive} className="nav-item" tooltip={displayLabel}>
                <NavLink to={path} end={item.to === '.'} onClick={() => { if (isMobile) setOpenMobile(false); }} aria-label={displayLabel}>
                  <item.icon className="nav-icon" aria-hidden="true" />
                  <span>{displayLabel}</span>
                  {item.to === 'models' && models.length > 0 && <span className="nav-count">{models.length}</span>}
                </NavLink>
              </SidebarMenuButton>

            </SidebarMenuItem>;
          })}
        </SidebarMenu>
      </nav>
    </SidebarContent>
    <SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild><NavLink to="/help/"><CircleHelp size={16} /><span>{t('Documentation', '文档')}</span></NavLink></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
  </>;
}

export function ProviderNav({ context }: { context: DashboardContext }) {
  const { isZh, t } = useLocale();
  const { provider: providerParam, supplier: supplierParam, providerId: adminProviderParam, supplierId: adminSupplierParam } = useParams();
  const provider = providerParam ?? supplierParam;
  const adminProvider = adminProviderParam ?? adminSupplierParam;
  const { isMobile, setOpenMobile } = useSidebar();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [providerDirectory, setProviders] = useState<ProviderIdentity[]>([]);
  const [directoryOwner, setDirectoryOwner] = useState('');
  const providers = directoryOwner === context.token ? providerDirectory : [];
  const [loading, setLoading] = useState(false);
  const [retryRevision, setRetryRevision] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => { const refresh = () => setRetryRevision(value => value + 1); window.addEventListener('niu:supplier-profile-updated', refresh); window.addEventListener('niu:provider-profile-updated', refresh); return () => { window.removeEventListener('niu:supplier-profile-updated', refresh); window.removeEventListener('niu:provider-profile-updated', refresh); }; }, []);
  useEffect(() => {
    if (!canManagePlatform(context.session)) {
      setProviders(context.session?.provider_memberships ?? []);
      setDirectoryOwner(context.token);setError('');setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);setError('');
    void request<{data: ProviderIdentity[]}>(context.token, '/api/v1/providers', 'GET', undefined, controller.signal)
      .then(result => {
        if (!Array.isArray(result.data)) throw new Error('Invalid provider list');
        if (!controller.signal.aborted) { setProviders(result.data);setDirectoryOwner(context.token);setError(''); }
      })
      .catch(() => { if (!controller.signal.aborted) setError(t('Could not load providers.', '无法加载模型供应商列表。')); })
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [context.token, context.session, retryRevision]);
  const selected = adminProvider ?? provider ?? search.get('provider') ?? search.get('supplier') ?? providers[0]?.id ?? '';
  const membership = resolveProvider(selected, providers);
  const selectedSegment = membership ? providerPathSegment(membership) : selected;

  const location = useLocation();
  const entries = provider ? [
    { to: `/providers/${provider}`, label: 'Overview', labelZh: '概览', end: true },
    { to: `/providers/${provider}/models`, label: 'Models', labelZh: '模型', end: false },
    { to: `/providers/${provider}/usage`, label: 'Usage', labelZh: '调用量', end: false },
    { to: `/providers/${provider}/settlements`, label: 'Settlements', labelZh: '结算账单', end: false },
  ] : [
    { to: '/admin/providers', label: 'Providers', labelZh: '模型供应商', end: false },
    { to: '/admin/pools', label: 'Model pools', labelZh: '模型池', end: false },
    { to: '/admin/customers', label: 'Customers', labelZh: '客户管理', end: false },
    { to: '/admin/reports', label: 'Financial reports', labelZh: '财务报表', end: false },
    { to: '/admin/balances', label: 'Account balances', labelZh: '账户余额', end: false },
    { to: '/admin/pricing', label: 'Pricing', labelZh: '定价配置', end: false },
    { to: '/admin/payments', label: 'Payment gateways', labelZh: '支付网关', end: false },
    { to: '/admin/branding', label: 'Branding', labelZh: '品牌定制', end: false },
    { to: '/admin/audit', label: 'Audit logs', labelZh: '审计日志', end: false },
    { to: '/admin/settings', label: 'Settings', labelZh: '实例设置', end: false },
  ];
  return <>
    <SidebarHeader className="sidebar-heading">
      {!provider && <h2 className="sidebar-heading-row">{t('Admin', '管理后台')}</h2>}
      {provider && <div className="workspace-switcher"><DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" className="workspace-switcher-trigger" aria-label="Switch provider" title={t('Switch provider', '切换供应商')}>
          <span className="workspace-switcher-copy"><strong>{membership?.name ?? (loading ? t('Loading provider…', '正在加载供应商…') : error ? t('Provider unavailable', '供应商暂不可用') : t('Choose provider', '选择供应商'))}</strong></span><ChevronsUpDown size={16} />
        </Button></DropdownMenuTrigger>
        <DropdownMenuContent className="workspace-switcher-menu" side="bottom" align="start" sideOffset={8} collisionPadding={12}>
          <DropdownMenuLabel className="workspace-switcher-menu-title">{t('Providers', '模型供应商')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={membership?.id ?? selected} onValueChange={id => {
            const section = location.pathname.split('/')[adminProvider ? 4 : 3];
            const nextSearch = new URLSearchParams(location.search);
            for (const key of ['provider', 'supplier', 'create', 'properties']) nextSearch.delete(key);
            navigate(`${adminProvider ? '/admin' : ''}/providers/${encodeURIComponent(providerPathSegment(providers.find(item => item.id === id) ?? {id}))}${section ? '/' + section : ''}${nextSearch.size ? '?' + nextSearch.toString() : ''}${location.hash}`);
            if (isMobile) setOpenMobile(false);
          }}>{providers.map(item => <DropdownMenuRadioItem key={item.id} value={item.id}><span>{item.name}</span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>
          {loading && <DropdownMenuLabel role="status">{t('Loading providers…', '正在加载供应商…')}</DropdownMenuLabel>}
          {!loading && !error && providers.length === 0 && <DropdownMenuLabel>{t('No providers yet', '暂无供应商')}</DropdownMenuLabel>}
          {error && <><div className="workspace-switcher-error" role="alert">{error}</div><DropdownMenuItem onSelect={event => {event.preventDefault();setRetryRevision(value => value + 1);}}>{t('Retry provider list', '重试加载供应商列表')}</DropdownMenuItem></>}
          {!adminProvider && canManagePlatform(context.session) && <><DropdownMenuSeparator className="workspace-switcher-separator" /><DropdownMenuItem disabled={!membership || loading || Boolean(error)} onSelect={() => navigate('/admin/providers/' + encodeURIComponent(selectedSegment) + '/settings')}><Settings2 size={16} />{t('Provider settings', '供应商设置')}</DropdownMenuItem><DropdownMenuItem className="workspace-switcher-create" onSelect={() => navigate('/admin/providers/overview?create=provider' + (selected ? '&provider=' + encodeURIComponent(selectedSegment) : ''))}><Plus size={16} />{t('Add provider', '添加供应商')}</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu></div>}
    </SidebarHeader>
    <SidebarContent className="workspace-sidebar-content">
      <nav aria-label={provider ? "Provider navigation" : "Admin navigation"}><SidebarMenu className="workspace-nav-menu">
        {entries.map(item => { const Icon = item.label === 'Settings' ? Settings2 : item.label === 'API keys' ? KeyRound : (item.label === 'Members' || item.label === 'Customers') ? Users : item.label === 'Providers' ? RailSuppliers : item.label === 'Model pools' ? IconRoute : item.label === 'Account balances' ? IconWallet : item.label === 'Payment gateways' ? CreditCard : item.label === 'Branding' ? IconPalette : item.label === 'Audit logs' ? IconHistory : item.label === 'Overview' ? LayoutDashboard : item.label === 'Models' ? Boxes : item.label === 'Settlements' ? CreditCard : ChartNoAxesCombined; return <SidebarMenuItem key={item.to}>
          <SidebarMenuButton asChild isActive={location.pathname === item.to || (!provider && location.pathname.startsWith(item.to + "/"))} className="nav-item provider-zone-item">
            <NavLink to={item.to} end={item.end} onClick={() => { if (isMobile) setOpenMobile(false); }}><Icon className="nav-icon" aria-hidden="true" /><span>{isZh ? item.labelZh : item.label}</span></NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>; })}
      </SidebarMenu></nav>
    </SidebarContent>
  </>;
}
export { ProviderNav as SupplierNav };

function WorkspaceSidebarToggle({ buttonRef, supplierArea = false, modelsArea = false, settingsArea = false, activityArea = false, adminArea = false }: { buttonRef: RefObject<HTMLButtonElement | null>; supplierArea?: boolean; modelsArea?: boolean; settingsArea?: boolean; activityArea?: boolean; adminArea?: boolean }) {
  const { t } = useLocale();
  const { isMobile, openMobile, state, toggleSidebar } = useSidebar();
  const expanded = isMobile ? openMobile : state === 'expanded';
  return <Button ref={buttonRef} type="button" variant="ghost" size="icon" className="sidebar-toggle" onClick={toggleSidebar} aria-expanded={expanded} aria-controls={adminArea ? "admin-navigation" : activityArea ? "activity-navigation" : settingsArea ? "settings-navigation" : modelsArea ? "model-filters" : supplierArea ? "supplier-navigation" : "workspace-navigation"} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${adminArea ? 'admin navigation' : activityArea ? 'activity navigation' : settingsArea ? 'settings navigation' : modelsArea ? 'model filters' : supplierArea ? 'provider navigation' : 'workspace navigation'}`} title={expanded ? t('Collapse navigation', '收起导航') : t('Expand navigation', '展开导航')}>
    {expanded ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
  </Button>;
}

function ProductRailLink({ to, onActivate, children, onClick, ...props }: NavLinkProps & { onActivate?: () => void }) {
  const { isMobile, setOpenMobile } = useSidebar();
  return <NavLink to={to} {...props} onClick={event => { onActivate?.(); onClick?.(event); if (!event.defaultPrevented && isMobile) setOpenMobile(false); }}>{children}</NavLink>;
}

export default function AppLayout() {
  const { locale, setLocale, isZh, t } = useLocale();
  const mockPaymentsEnabled = useMockPayments();
  const {settings:branding,logo} = useBranding();
  const [workspaceCreateOpen, setWorkspaceCreateOpen] = useState(false);
  const [token, setToken] = useState('');
  const [signOutFailed, setSignOutFailed] = useState(false);
  const signOutPending = useRef(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [draftToken, setDraftToken] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState('');
  const [session, setSession] = useState<AdminSession | null>(null);
  const appearance = useAccountAppearance(token, JSON.stringify([token,session?.kind,session?.operator?.id]), session?.kind === 'operator', session?.operator?.id ?? '',branding.default_appearance);
  const [chatKeys, setChatKeys] = useState<SessionChatKey[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspacesLoadedFor, setWorkspacesLoadedFor] = useState('');
  const [workspaceLoadRevision, setWorkspaceLoadRevision] = useState(0);
  const [workspaceError, setWorkspaceError] = useState<WorkspaceProblem | null>(null);
  const [error, setError] = useState('');
  const connectionRevision = useRef(0);
  const connectionController = useRef<AbortController | null>(null);
  const modelController = useRef<AbortController | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { workspace: routeWorkspaceId } = useParams();
  const isGlobalChat = location.pathname === '/generations';
  const settingsArea = location.pathname === '/settings' || location.pathname.startsWith('/settings/');
  const adminArea = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
  const supplierArea = adminArea || location.pathname === '/providers' || location.pathname.startsWith('/providers/') || location.pathname === '/suppliers' || location.pathname.startsWith('/suppliers/');
  const supplierManagement = supplierArea && location.pathname !== '/providers' && location.pathname !== '/suppliers';
  const adminSupplierId = adminArea && (location.pathname.startsWith('/admin/providers/') || location.pathname.startsWith('/admin/suppliers/')) ? location.pathname.split('/')[3] : '';
  const supplierTabsRef = useRef<HTMLDivElement>(null);
  const [providerDirectory, setProviderDirectory] = useState<ProviderIdentity[]>([]);
  const [providerDirectoryOwner, setProviderDirectoryOwner] = useState('');
  const [providerDirectoryLoading, setProviderDirectoryLoading] = useState(false);
  const providerDirectoryIdentity = session ? `${token}:${session.kind}:${session.operator?.id ?? ''}` : '';
  const authorizedProviders = session && providerDirectoryOwner === providerDirectoryIdentity ? providerDirectory : [];
  const adminSupplierName = resolveProvider(adminSupplierId, authorizedProviders)?.name ?? '';
  const [supplierProfileRevision, setSupplierProfileRevision] = useState(0);
  useEffect(() => { const refresh = () => setSupplierProfileRevision(value => value + 1); window.addEventListener('niu:supplier-profile-updated', refresh); window.addEventListener('niu:provider-profile-updated', refresh); return () => { window.removeEventListener('niu:supplier-profile-updated', refresh); window.removeEventListener('niu:provider-profile-updated', refresh); }; }, []);
  useEffect(() => {
    if (!supplierArea || !session) return;
    if (!canManagePlatform(session)) {
      setProviderDirectory(session.provider_memberships ?? []); setProviderDirectoryOwner(providerDirectoryIdentity); return;
    }
    const controller = new AbortController();
    setProviderDirectoryLoading(true);
    void request<{data: ProviderIdentity[]}>(token, '/api/v1/providers', 'GET', undefined, controller.signal).then(result => {
      if (!controller.signal.aborted) {setProviderDirectory(result.data);setProviderDirectoryOwner(providerDirectoryIdentity);}
    }).catch(() => { /* Retain last resolved breadcrumb/slug directory; ProviderNav and ProvidersDirectory surface visible load errors and retry actions. */ }).finally(() => {if (!controller.signal.aborted) setProviderDirectoryLoading(false);});
    return () => controller.abort();
  }, [supplierArea, token, session, supplierProfileRevision, providerDirectoryIdentity]);
  useEffect(() => {
    const parts = location.pathname.split('/');
    const index = parts[1] === 'admin' ? 3 : 2;
    if (parts[index - 1] !== 'providers' && parts[index - 1] !== 'suppliers') return;
    const provider = resolveProvider(decodeURIComponent(parts[index] ?? ''), authorizedProviders);
    if (!provider?.slug || parts[index] === provider.slug) return;
    parts[index] = encodeURIComponent(provider.slug);
    navigate({pathname: parts.join('/'), search:location.search, hash:location.hash}, {replace:true});
  }, [location.pathname, location.search, location.hash, authorizedProviders, navigate]);
  const workspaceDirectoryArea = location.pathname === '/workspaces' || location.pathname === '/workspaces/';
  const usesSelectedWorkspace = workspaceDirectoryArea || isGlobalChat || location.pathname.startsWith('/activity') || settingsArea || supplierArea || location.pathname === '/models' || location.pathname.startsWith('/models/');
  const loginArea = location.pathname === '/login' || location.pathname === '/installation';
  const gateway = useGatewayConnection(location.pathname);
  const { health, checked: healthChecked } = gateway;

  const rememberChatKey = useCallback((key: SessionChatKey) => {
    setChatKeys(current => [key, ...current.filter(item => item.id !== key.id || item.projectId !== key.projectId)]);
  }, []);
  const forgetChatKey = useCallback((id: string) => {
    setChatKeys(current => current.filter(item => item.id !== id));
  }, []);

  useEffect(() => {
    setChatKeys([]);
    setSelectedOrganizationId(null);
  }, [token]);
  const routeWorkspace = routeWorkspaceId && routeWorkspaceId !== 'default'
    ? resolveWorkspacePathSegment(routeWorkspaceId, workspaces)
    : undefined;
  const requestedWorkspaceId = usesSelectedWorkspace ? new URLSearchParams(location.search).get('workspace') : null;
  const requestedWorkspace = requestedWorkspaceId ? resolveWorkspacePathSegment(requestedWorkspaceId, workspaces) : undefined;
  const isDefaultWorkspaceAlias = requestedWorkspaceId === 'default' && !requestedWorkspace;
  // Explicit routes must not inherit a different workspace during selection effects.
  const selectedWorkspace = requestedWorkspaceId && !isDefaultWorkspaceAlias ? requestedWorkspace ?? null : workspace;
  const effectiveWorkspaceError: WorkspaceProblem | null = requestedWorkspaceId && !isDefaultWorkspaceAlias && !requestedWorkspace
    && !workspaceLoading && workspacesLoadedFor === token
    ? { kind: 'missing', workspace: requestedWorkspaceId }
    : workspaceError?.kind === 'missing' && (requestedWorkspace || isDefaultWorkspaceAlias) ? null : workspaceError;
  const workspaceNavigation = useRef({routeWorkspace, workspace, workspaces, location});
  useLayoutEffect(() => { workspaceNavigation.current = {routeWorkspace, workspace, workspaces, location}; }, [routeWorkspace, workspace, workspaces, location]);
  const modelOrganizationId = routeWorkspace?.organization_id ?? (requestedWorkspaceId && !isDefaultWorkspaceAlias ? requestedWorkspace?.organization_id : selectedOrganizationId ?? workspace?.organization_id);
  const modelWorkspace = routeWorkspace ?? selectedWorkspace;
  const paymentReadiness = usePaymentReadiness(token, modelOrganizationId);
  const modelsHref = token ? workspaceModelsHref(modelWorkspace ?? workspace, workspaces) : '/models/';
  const modelWorkspaceId = modelWorkspace && modelWorkspace.organization_id === modelOrganizationId ? modelWorkspace.id : undefined;

  const authenticationPath = useRef(location.pathname);
  authenticationPath.current = location.pathname;
  const authenticate = useCallback(async (credential: string, restoring = false) => {
    if (restoring && authenticationPath.current === '/installation') return;
    setError('');
    connectionController.current?.abort();
    const controller = new AbortController();
    connectionController.current = controller;
    const revision = ++connectionRevision.current;
    try {
      const sessionResponse = await fetch('/api/v1/session', {
        headers: { authorization: 'Bearer ' + credential },
        signal: controller.signal,
      });
      if (revision !== connectionRevision.current || controller.signal.aborted) return;
      if (!sessionResponse.ok) {
        if (revision === connectionRevision.current && !(restoring && sessionResponse.status === 401)) setError('Could not sign in. Try again.');
        return;
      }
      const sessionValue = await sessionResponse.json() as { data: AdminSession };
      if (revision !== connectionRevision.current || controller.signal.aborted) return;
      if (restoring && authenticationPath.current === '/installation') return;
      // A verified member session remains usable when model discovery fails.
      // The existing scoped catalog effect owns loading and diagnostic errors.
      setModels([]);
      setModelsError('');
      setModelsLoading(true);
      setSession(sessionValue.data);
      setToken(credential);
      try { sessionStorage.removeItem('niu.signed-out'); } catch { /* Storage is optional. */ }
      if (!restoring) setDraftToken('');
    } catch {
      if (revision === connectionRevision.current) setError('Could not sign in. Try again.');
    }
  }, []);

  const signOut = useCallback(async () => {
    if (signOutPending.current) return;
    signOutPending.current = true;
    try {
      if (token === 'niu-browser-member-session' || session?.kind === 'operator') {
        const browser = token === 'niu-browser-member-session';
        const response = await fetch(browser ? '/api/v1/auth/browser/logout' : '/api/v1/auth/logout', {
          method: 'POST', cache: 'no-store',
          headers: browser ? undefined : { authorization: `Bearer ${token}` },
        });
        if (!response.ok && response.status !== 401) throw new Error('Sign-out unavailable');
      }
    } catch {
      setSignOutFailed(true);
      signOutPending.current = false;
      return;
    }
    signOutPending.current = false;
    setSignOutFailed(false);
    if (token === 'niu-browser-member-session') {
      try { localStorage.setItem('niu.auth.signout', crypto.randomUUID()); } catch { /* Focus revalidation remains available. */ }
    }
    connectionController.current?.abort();
    connectionController.current = null;
    connectionRevision.current += 1;
    try { sessionStorage.setItem('niu.signed-out', '1'); } catch { /* Storage is optional. */ }
    setToken('');
    setDraftToken('');
    setSession(null);
    setModels([]);
    setChatKeys([]);
    setOrganizations([]);
    setWorkspaces([]);
    setWorkspace(null);
    setSelectedOrganizationId(null);
    setWorkspaceError(null);
    setWorkspaceLoading(false);
    setWorkspacesLoadedFor('');
    setError('');
    if (import.meta.env.DEV) {
      void fetch(`${import.meta.env.BASE_URL}login/session`, {
        method: 'DELETE',
        headers: { 'x-niu-dev-login': '1' },
      }).catch(() => { /* Dev sign-out remains local when the helper is unavailable. */ });
    }
  }, [token, session]);

  const connect = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await authenticate(draftToken);
  }, [authenticate, draftToken]);

  useEffect(() => {
    if (token || health?.status !== 'ok') return;
    try { if (sessionStorage.getItem('niu.signed-out') === '1') { setSessionChecked(true); return; } } catch { /* Storage is optional. */ }
    if (location.pathname === '/installation') { setSessionChecked(true); return; }
    const controller = new AbortController();
    const revision = connectionRevision.current;
    void (async () => {
      const configured = await fetch('/api/v1/auth/config', { signal: controller.signal, cache: 'no-store' });
      if (configured.ok && (await configured.json()).password_login === true) {
        if (controller.signal.aborted || revision !== connectionRevision.current) return;
        await authenticate('niu-browser-member-session', true);
        return null;
      }
      return null;
    })()
      .catch(() => { /* The login page handles unavailable authentication. */ })
      .finally(() => { if (!controller.signal.aborted) setSessionChecked(true); });
    return () => controller.abort();
  }, [authenticate, token, health?.status, location.pathname]);

  const refreshModels = useCallback(async () => {
    if (!token) return;
    const connection = connectionController.current;
    if (!connection || connection.signal.aborted) return;
    modelController.current?.abort();
    const controller = new AbortController();
    modelController.current = controller;
    setModelsLoading(true);setModelsError('');
    const revision = connectionRevision.current;
    const query = modelOrganizationId ? '?organization_id=' + encodeURIComponent(modelOrganizationId) + (modelWorkspaceId ? '&project_id=' + encodeURIComponent(modelWorkspaceId) : '') : '';
    try {
      const response = await fetch('/api/v1/models' + query, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.any([connection.signal, controller.signal]),
      });
      if (revision !== connectionRevision.current || controller.signal.aborted || modelController.current !== controller) return;
      if (!response.ok) throw new Error('Could not load the model catalog.');
      const value = await response.json() as { data: Model[] };
      if (!Array.isArray(value.data)) throw new Error('Invalid model catalog response.');
      if (revision === connectionRevision.current && !controller.signal.aborted && modelController.current === controller) setModels(value.data);
    } catch {
      // Preserve this account's last verified catalog during a transient failure.
      if (revision === connectionRevision.current && !controller.signal.aborted && modelController.current === controller) setModelsError('Could not load the model catalog.');
    } finally {
      if (revision === connectionRevision.current && !controller.signal.aborted && modelController.current === controller) setModelsLoading(false);
    }
  }, [token, modelOrganizationId, modelWorkspaceId]);

  useEffect(() => {
    setModels([]);setModelsError('');
    if (!token || !modelOrganizationId) { setModelsLoading(Boolean(token)); return; }
    void refreshModels();
    return () => modelController.current?.abort();
  }, [token, modelOrganizationId, modelWorkspaceId, refreshModels]);

  const refreshWorkspace = useCallback(async () => {
    const revision = connectionRevision.current;
    const controller = token ? connectionController.current : null;
    if (token && (!controller || controller.signal.aborted)) return;
    if (!await gateway.check()) return;
    if (token && controller && revision === connectionRevision.current && !controller.signal.aborted) {
      try {
        const response = await fetch('/api/v1/session', {
          headers: { authorization: 'Bearer ' + token },
          signal: controller.signal,
        });
        if (revision !== connectionRevision.current || controller.signal.aborted) return;
        if (response.status === 401) {
          controller.abort();
          if (connectionController.current === controller) connectionController.current = null;
          connectionRevision.current += 1;
          setToken('');
          setDraftToken('');
          setModels([]);
          setSession(null);
          setError('Your session has expired or been revoked. Sign in again.');
        } else if (response.ok) {
          const currentSession = (await response.json() as { data: AdminSession }).data;
          if (revision === connectionRevision.current && !controller.signal.aborted) setSession(currentSession);
        }
      } catch {
        // Preserve the last verified identity during a transient network failure.
      }
    }
    if (revision === connectionRevision.current && token && controller && !controller.signal.aborted) await refreshModels();
  }, [refreshModels, token, gateway.check]);

  useEffect(() => {
    if (!token) return;
    let pending = false;
    const revalidate = () => {
      if (document.visibilityState === 'hidden' || pending) return;
      pending = true;
      void refreshWorkspace().finally(() => { pending = false; });
    };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
    };
  }, [token, refreshWorkspace]);

  useEffect(() => {
    if (token !== 'niu-browser-member-session') return;
    const signedOutElsewhere = (event: StorageEvent) => {
      if (event.key !== 'niu.auth.signout' || !event.newValue) return;
      connectionController.current?.abort();
      connectionController.current = null;
      connectionRevision.current += 1;
      try { sessionStorage.setItem('niu.signed-out', '1'); } catch { /* Storage is optional. */ }
      setToken(''); setDraftToken(''); setSession(null); setModels([]); setChatKeys([]);
    };
    window.addEventListener('storage', signedOutElsewhere);
    return () => window.removeEventListener('storage', signedOutElsewhere);
  }, [token]);

  useEffect(() => {
    setWorkspacesLoadedFor('');
    if (!token) {
      setOrganizations([]);
      setWorkspaces([]);
      setWorkspace(null);
      setWorkspaceLoading(false);
      setWorkspaceError(null);
      return;
    }
    const controller = new AbortController();
    setOrganizations([]);
    setWorkspaces([]);
    setWorkspace(null);
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    const headers = { authorization: `Bearer ${token}` };
    void Promise.all([
      fetch('/api/v1/organizations', { headers, signal: controller.signal }),
      fetch('/api/v1/workspaces', { headers, signal: controller.signal }),
    ]).then(async ([organizationResponse, workspaceResponse]) => {
      if (!organizationResponse.ok || !workspaceResponse.ok) {
        const [endpoint, response] = !organizationResponse.ok
          ? ['/api/v1/organizations', organizationResponse]
          : ['/api/v1/workspaces', workspaceResponse];
        setWorkspaceError({ kind: 'api', endpoint, status: response.status });
        return;
      }
      const [organizationData, workspaceData] = await Promise.all([
        organizationResponse.json() as Promise<{ data: Organization[] }>,
        workspaceResponse.json() as Promise<{ data: Workspace[] }>,
      ]);
      if (controller.signal.aborted) return;
      setOrganizations(organizationData.data);
      setWorkspaces(workspaceData.data);
      setWorkspacesLoadedFor(token);
    }).catch(() => {
      if (!controller.signal.aborted) setWorkspaceError({ kind: 'network' });
    }).finally(() => {
      if (!controller.signal.aborted) setWorkspaceLoading(false);
    });
    return () => controller.abort();
  }, [token, workspaceLoadRevision]);

  const reloadWorkspaces = useCallback(() => setWorkspaceLoadRevision(value => value + 1), []);

  const previousHealth = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (health?.status === 'ok' && previousHealth.current === 'offline') {
      if (workspaceError && workspaceError.kind !== 'missing') setWorkspaceLoadRevision(value => value + 1);
      void refreshWorkspace();
    }
    previousHealth.current = health?.status === 'ok' ? 'online' : healthChecked ? 'offline' : undefined;
  }, [health?.status, healthChecked, refreshWorkspace, workspaceError]);

  const selectWorkspace = useCallback((next: Workspace) => {
    if (!usesSelectedWorkspace && next.id === routeWorkspace?.id) return;
    setSelectedOrganizationId(next.organization_id);
    setWorkspace(next);
    setWorkspaceError(null);
    try { window.localStorage.setItem('niu.active-workspace', next.id); } catch { /* URL remains the source of truth. */ }
    const knownWorkspaces = workspaces.some(item => item.id === next.id) ? workspaces : [...workspaces, next];
    if (usesSelectedWorkspace && !settingsArea && !workspaceDirectoryArea) {
      const search = new URLSearchParams(location.search);
      search.set('workspace', workspacePathSegment(next, knownWorkspaces));
      navigate({ pathname: location.pathname, search: `?${search.toString()}`, hash: location.hash }, { replace: true });
      return;
    }
    const currentSection = location.pathname.startsWith('/workspaces/') ? location.pathname.split('/').filter(Boolean).slice(2).join('/') : '';
    const keyDetail = currentSection.startsWith('keys/') && currentSection !== 'keys/new';
    const nestedPath = keyDetail ? 'keys' : currentSection;
    const nextSearch = new URLSearchParams(location.search);
    nextSearch.delete('keyId');
    navigate({
      pathname: `/workspaces/${workspacePathSegment(next, knownWorkspaces)}${nestedPath ? `/${nestedPath}` : ''}`,
      search: nextSearch.toString() ? `?${nextSearch}` : '',
      hash: keyDetail || location.hash.startsWith('#gateway-attempt-') ? '' : location.hash,
    }, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate, workspaces, usesSelectedWorkspace, settingsArea, workspaceDirectoryArea, routeWorkspace?.id]);

  const selectOrganization = useCallback((next: Organization) => {
    if (!organizations.some(item => item.id === next.id)) return;
    setSelectedOrganizationId(next.id);
    const firstWorkspace = workspaces.find(item => item.organization_id === next.id);
    if (firstWorkspace) {
      selectWorkspace(firstWorkspace);
    } else {
      setWorkspace(null);
      setWorkspaceError(null);
      navigate('/workspaces/default/', { replace: true });
    }
  }, [organizations, workspaces, selectWorkspace, navigate]);

  const createWorkspace = useCallback(async (name: string, organizationId?: string, slug?: string, spendingLimit?: {currency: string; limit_nanos: string}) => {
    if (!token) throw new Error('Sign in before creating a workspace.');
    const response = await fetch('/api/v1/workspaces', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name, slug, spending_limit: spendingLimit, organization_id: organizationId || null }),
    });
    const body = await response.json().catch(() => null) as (Workspace & { error?: { message?: string } }) | null;
    if (!response.ok || !body) throw new Error(body?.error?.message ?? `Could not create workspace (${response.status}).`);
    const created: Workspace = {
      ...body,
      id: body.id,
      name: body.name,
      organization_id: body.organization_id,
      organization_name: body.organization_name ?? organizations.find(item => item.id === body.organization_id)?.name ?? 'Personal workspace',
    };
    setWorkspaces(previous => [...previous, created]);
    if (!organizations.some(item => item.id === created.organization_id)) {
      setOrganizations(previous => [...previous, { id: created.organization_id, name: created.organization_name }]);
    }
    selectWorkspace(created);
    return created;
  }, [organizations, selectWorkspace, token]);

  const renameWorkspace = useCallback(async (target: Workspace, name: string) => {
    const revision = connectionRevision.current;
    const result = await request<{id: string; name: string}>(token,
      `/api/v1/organizations/${target.organization_id}/projects/${target.id}`, 'PATCH', {name: name.trim()});
    if (result.id !== target.id || typeof result.name !== 'string' || !result.name.trim()) throw new Error('Could not confirm the workspace name. Reload before retrying.');
    const renamed = {...target, name: result.name};
    if (revision !== connectionRevision.current) return renamed;
    const current = workspaceNavigation.current;
    const updated = current.workspaces.map(item => item.id === target.id ? renamed : item);
    setWorkspaces(previous => previous.map(item => item.id === target.id ? renamed : item));
    setWorkspace(current => current?.id === target.id ? renamed : current);
    setWorkspaceError(null);
    if (current.routeWorkspace?.id === target.id) {
      const nested = current.location.pathname.split('/').filter(Boolean).slice(2).join('/');
      navigate({pathname: `/workspaces/${workspacePathSegment(renamed, updated)}${nested ? '/' + nested : ''}`, search: current.location.search, hash: current.location.hash}, {replace: true});
    }
    return renamed;
  }, [token, workspaces, routeWorkspace?.id, location.pathname, location.search, location.hash, navigate]);

  const deleteWorkspace = useCallback(async (target: Workspace) => {
    const revision = connectionRevision.current;
    await request(token, `/api/v1/organizations/${target.organization_id}/projects/${target.id}`, 'DELETE');
    if (revision !== connectionRevision.current) return;
    const current = workspaceNavigation.current;
    const remaining = current.workspaces.filter(item => item.id !== target.id);
    setWorkspaces(previous => previous.filter(item => item.id !== target.id));
    setChatKeys(current => current.filter(item => item.projectId !== target.id));
    if (current.routeWorkspace?.id === target.id || current.workspace?.id === target.id) {
      const next = remaining.find(item => item.organization_id === target.organization_id) ?? null;
      setWorkspace(next);
      setWorkspaceError(null);
      try {
        if (next) window.localStorage.setItem('niu.active-workspace', next.id);
        else window.localStorage.removeItem('niu.active-workspace');
      } catch { /* Navigation remains available without cache. */ }
      navigate(next ? `/workspaces/${workspacePathSegment(next, remaining)}` : '/workspaces/default/', {replace: true});
    }
  }, [token, workspaces, workspace?.id, routeWorkspace?.id, navigate]);

  useEffect(() => {
    if (!token || workspaceLoading || workspacesLoadedFor !== token) return;
    let preferred = routeWorkspace;
    if (usesSelectedWorkspace) {
      const requestedWorkspace = new URLSearchParams(location.search).get('workspace');
      preferred = requestedWorkspace ? resolveWorkspacePathSegment(requestedWorkspace, workspaces) : undefined;
    }
    if (!preferred && (routeWorkspaceId === 'default' || (usesSelectedWorkspace && (!requestedWorkspaceId || requestedWorkspaceId === 'default')))) {
      const operatorProjectId = session?.operator?.project_id;
      let storedId: string | null = null;
      try { storedId = window.localStorage.getItem('niu.active-workspace'); } catch { /* Storage is optional. */ }
      const candidates = selectedOrganizationId
        ? workspaces.filter(item => item.organization_id === selectedOrganizationId)
        : workspaces;
      preferred = candidates.find(item => item.id === operatorProjectId)
        ?? candidates.find(item => item.id === storedId)
        ?? candidates[0];
    }
    if (preferred) {
      setWorkspace(preferred);
      setWorkspaceError(null);
      try { window.localStorage.setItem('niu.active-workspace', preferred.id); } catch { /* Route remains the source of truth. */ }
      const preferredSegment = workspacePathSegment(preferred, workspaces);
      if (!usesSelectedWorkspace && routeWorkspaceId !== preferredSegment) {
        const nestedPath = location.pathname.split('/').filter(Boolean).slice(2).join('/');
        navigate({ pathname: `/workspaces/${preferredSegment}${nestedPath ? `/${nestedPath}` : ''}`, search: location.search, hash: location.hash }, { replace: true });
      } else if (usesSelectedWorkspace && requestedWorkspaceId && requestedWorkspaceId !== preferredSegment) {
        const search = new URLSearchParams(location.search);
        search.set('workspace', preferredSegment);
        navigate({ pathname: location.pathname, search: `?${search.toString()}`, hash: location.hash }, { replace: true });
      }
    } else {
      setWorkspace(null);
      if ((requestedWorkspaceId && requestedWorkspaceId !== 'default') || (routeWorkspaceId && routeWorkspaceId !== 'default')) setWorkspaceError({ kind: 'missing', workspace: requestedWorkspaceId || routeWorkspaceId! });
    }
  }, [location.pathname, location.search, location.hash, usesSelectedWorkspace, requestedWorkspaceId, navigate, routeWorkspaceId, session, token, workspaceLoading, workspaces, workspacesLoadedFor, selectedOrganizationId]);

  const gatewayStatus: GatewayStatus = health?.status === 'ok'
    ? 'online'
    : healthChecked
      ? 'offline'
      : 'checking';
  useLayoutEffect(() => {
    const strip = supplierTabsRef.current;
    if (!strip) return;
    const revealActiveTab = () => strip.querySelector<HTMLElement>('[role="tab"][data-state="active"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    revealActiveTab();
    const observer = new ResizeObserver(revealActiveTab);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [location.pathname, gatewayStatus]);

  const profileConnectionRevision = connectionRevision.current;
  const context = useMemo<DashboardContext>(() => ({
    appearance,
    sessionChecked,
    token,
    session,
    updateProfile: profile => {
      // A completed write belongs to this connection, never a later sign-in.
      if (connectionRevision.current !== profileConnectionRevision) return;
      setSession(current => current?.kind === 'operator'
        && current.operator?.id === session?.operator?.id
        && (!current.profile || profile.revision >= current.profile.revision)
        ? {...current, profile} : current);
    },
    providerDirectory: authorizedProviders,
    providerDirectoryLoading,
    organizations,
    organization: organizations.find(item => item.id === (routeWorkspace?.organization_id ?? selectedOrganizationId)) ?? organizations[0] ?? null,
    selectOrganization,
    workspaces,
    workspace: usesSelectedWorkspace ? selectedWorkspace : routeWorkspaceId === 'default' ? workspace : workspace?.id === routeWorkspace?.id ? workspace : null,
    workspaceLoading,
    reloadWorkspaces,
    workspaceError: effectiveWorkspaceError,
    selectWorkspace,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    chatKeys,
    rememberChatKey,
    forgetChatKey,
    draftToken,
    setDraftToken,
    models,
    health,
    gatewayStatus,
    error,
    connect,
    connectWithToken: authenticate,
    signOut,
    modelsLoading,
    modelsError,
    refreshModels,
    refreshWorkspace,
  }), [authorizedProviders, providerDirectoryLoading, appearance, sessionChecked, token, session, profileConnectionRevision, organizations, selectedOrganizationId, selectOrganization, workspaces, workspace, selectedWorkspace, effectiveWorkspaceError, routeWorkspaceId, usesSelectedWorkspace, workspaceLoading, reloadWorkspaces, workspaceError, selectWorkspace, createWorkspace, renameWorkspace, deleteWorkspace, chatKeys, rememberChatKey, forgetChatKey, draftToken, models, modelsLoading, modelsError, health, gatewayStatus, error, connect, authenticate, signOut, refreshModels, refreshWorkspace]);
  const activePath = location.pathname.startsWith('/workspaces/')
    ? location.pathname.split('/').filter(Boolean).slice(2).join('/') || '.'
    : location.pathname.replace(/^\/+|\/+$/g, '');
  const scopedNavigation = navigation.filter(item => location.pathname.startsWith('/workspaces/') ? item.destination === 'Workspace' || item.destination === 'Organization' : item.destination !== 'Workspace');
  const activeNavigation = scopedNavigation.find(item => item.to.replace(/^\/+|\/+$/g, '') === activePath)
    ?? scopedNavigation.filter(item => activePath.startsWith(`${item.to.replace(/^\/+|\/+$/g, '')}/`)).sort((a, b) => b.to.length - a.to.length)[0];
  const helpArea = location.pathname === '/help' || location.pathname.startsWith('/help/');
  const guardrailTitles: Record<string, string> = isZh
    ? {policy:'策略',input:'输入规则',output:'输出规则',access:'模型访问',detectors:'外部检测',history:'变更历史',denials:'拦截记录'}
    : {policy:'Policy',input:'Input rules',output:'Output rules',access:'Model access',detectors:'External checks',history:'History',denials:'Blocked requests'};
  const isGuardrailEditor = ['guardrails/input','guardrails/output','guardrails/access','guardrails/detectors'].includes(activePath);
  const title = workspaceDirectoryArea ? t('Workspaces', '工作空间') : settingsArea ? ({account:t('Account', '账户'),appearance:t('Appearance', '外观'),billing:t('Credits', '额度与充值'),payments:t('Credits', '额度与充值'),about:t('About', '关于')}[location.pathname.split('/')[2] ?? 'account'] ?? t('Settings', '设置')) : loginArea
    ? location.pathname === '/installation' ? t('Installation administration', '实例管理') : t('Sign in', '登录')
    : helpArea
      ? t('Documentation', '文档')
    : supplierArea
      ? ({ customers: t('Customers', '客户管理'), reports: t('Financial reports', '财务报表'), balances: t('Account balances', '账户余额'), oauth: t('OAuth providers', 'OAuth 服务商'), payments: t('Payment gateways', '支付网关'), pricing: t('Pricing', '定价配置'), branding: t('Branding', '品牌定制'), audit: t('Audit logs', '审计日志'), pools: t('Model pools', '模型池'), overview: t('Overview', '概览'), keys: t('API keys', 'API 密钥'), models: t('Models', '模型'), usage: t('Usage', '调用量'), settlements: t('Settlements', '结算账单'), members: t('Members', '成员管理'), settings: t('Settings', '设置') }[location.pathname.split('/').pop() ?? ''] ?? ((location.pathname === '/admin/providers' || location.pathname === '/admin/suppliers') ? t('Providers', '模型供应商') : supplierManagement ? t('Overview', '概览') : t('Providers', '模型供应商')))
      : activePath === 'keys/new'
        ? t('New API key', '新建 API 密钥')
        : activePath.startsWith('keys/')
          ? t('API key', 'API 密钥')
          : activePath.startsWith('guardrails/') ? guardrailTitles[activePath.split('/')[1]] ?? t('Guardrails', '安全护栏')
          : activeNavigation ? (isZh ? activeNavigation.labelZh : activeNavigation.label) : t('Page not found', '页面未找到');

  useEffect(() => {
    document.title = `${title} · ${branding.display_name}`;
  }, [title, branding.display_name]);

  const sidebarViewportWidth = useRef(typeof window !== 'undefined' ? window.innerWidth : sidebarBreakpoint);
  const [phoneNavigation, setPhoneNavigation] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 580);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= sidebarBreakpoint);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const destination = activeNavigation?.destination ?? 'Workspace';
  const platform = destination === 'Administration';
  const activityArea = location.pathname === '/activity' || location.pathname.startsWith('/activity/');
  const isInstallation = canManagePlatform(session);
  const hasSidebar = !helpArea && (!adminArea || isInstallation) && (!settingsArea && (activityArea || supplierManagement || destination === 'Workspace'));
  const setupBlocked = Boolean(token && !supplierArea && !settingsArea && !helpArea && paymentReadiness.status !== 'ready');
  const modelFiltersAvailable = destination === 'Models' && !activePath.startsWith('models/')
    && !setupBlocked && !workspaceLoading && workspacesLoadedFor === token && !effectiveWorkspaceError
    && (models.length > 0 || (!modelsLoading && !modelsError));
  const showWorkspaceAreas = !supplierArea || isInstallation || Boolean(session?.operator);
  const activeWorkspacePath = !isGlobalChat && routeWorkspaceId
    ? `/workspaces/${routeWorkspaceId}`
    : workspace
      ? `/workspaces/${workspacePathSegment(workspace, workspaces)}`
      : '/workspaces/default';
  useEffect(() => {
    try { localStorage.setItem('niu.navigation.workspace-path', activeWorkspacePath); } catch { /* Storage is optional. */ }
  }, [activeWorkspacePath]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('[role="menu"], [role="dialog"]')) {
        setSidebarOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  useEffect(() => {
    const closeOnCompactViewport = () => {
      const width = window.innerWidth;
      setPhoneNavigation(width <= 580);
      if (sidebarViewportWidth.current >= sidebarBreakpoint && width < sidebarBreakpoint) {
        setSidebarOpen(false);
        if (sidebarRef.current?.contains(document.activeElement)) toggleRef.current?.focus();
      }
      sidebarViewportWidth.current = width;
    };
    window.addEventListener('resize', closeOnCompactViewport);
    return () => window.removeEventListener('resize', closeOnCompactViewport);
  }, []);
  useEffect(() => {
    if (!loginArea && !helpArea && !token && sessionChecked) {
      navigate('/login', { state: { from: location.pathname + location.search + location.hash }, replace: true });
    }
  }, [loginArea, helpArea, token, sessionChecked, navigate, location.pathname, location.search, location.hash]);
  const signOutFailure = signOutFailed && <Dialog open onOpenChange={setSignOutFailed}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{t('Could not sign out', '无法退出登录')}</DialogTitle><DialogDescription>{t('Your session has not been confirmed revoked. Try again when the connection is available.', '尚未确认注销您的会话，请在网络连接恢复后重试。')}</DialogDescription></DialogHeader><DialogFooter><Button onClick={() => { void signOut(); }}>{t('Try again', '重试')}</Button></DialogFooter></DialogContent></Dialog>;
  const gatewayOutage = !helpArea && gatewayStatus === 'offline' && <Dialog open><DialogContent showCloseButton={false} onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()} className="sm:max-w-md"><DialogHeader><WifiOff className="mb-2 size-6 text-muted-foreground" aria-hidden="true" /><DialogTitle>{t('Gateway unavailable', '网关不可用')}</DialogTitle><DialogDescription>{t('We couldn’t reach the gateway. We’ll reconnect automatically when the service returns.', '无法连接到网关。服务恢复后将自动重新连接。')}</DialogDescription></DialogHeader><DialogFooter><Button disabled={gateway.checking} onClick={() => { void gateway.check(); }}>{gateway.checking ? t('Checking…', '正在检查…') : t('Try again', '重试')}</Button></DialogFooter></DialogContent></Dialog>;
  if (!loginArea && !helpArea && !token && !sessionChecked) return <>{gatewayOutage}{signOutFailure}<RouterPending /></>;
  if (!loginArea && !helpArea && !token) return <p role="status">{t('Redirecting to sign in…', '正在跳转到登录页…')}</p>;
  if (loginArea) return <div className="dashboard-login-shell"><Outlet context={context} /></div>;
  return <SidebarProvider
    open={sidebarOpen}
    onOpenChange={setSidebarOpen}
    className="app-shell"
    style={{ '--sidebar-width': 'var(--context)', '--sidebar-width-icon': 'var(--context)', '--sidebar-width-mobile': 'var(--context)' } as CSSProperties}
  >
    <a className="dashboard-skip" href="#dashboard-content">{t('Skip to content', '跳转到主内容')}</a>
    {!settingsArea && ['account','appearance','billing','payments','about'].includes(new URLSearchParams(location.search).get('settings') ?? '') && <SettingsDialog context={context} section={new URLSearchParams(location.search).get('settings') ?? undefined} href={section => settingsHref(location.pathname,location.search,location.hash,section)} onClose={() => { const query = new URLSearchParams(location.search); query.delete('settings'); navigate(location.pathname + (query.size ? '?' + query.toString() : '') + location.hash,{replace:true}); }}/>} 
    <WorkspaceCreateDialog context={context} open={workspaceCreateOpen && paymentReadiness.status === 'ready'} onOpenChange={setWorkspaceCreateOpen} />
    <nav className="app-rail" aria-label="Product navigation">
      <a className="rail-logo" href={import.meta.env.BASE_URL} aria-label={`${branding.display_name} home`}><img src={logo} alt="" /></a>
      {showWorkspaceAreas && <Tooltip delayDuration={250}><TooltipTrigger asChild><ProductRailLink to={activeWorkspacePath} end onActivate={() => {}} className={`rail-item${destination === 'Workspace' && location.pathname.startsWith('/workspaces/') && !supplierArea ? ' selected' : ''}`} aria-label={t('Workspace', '工作空间')}><RailWorkspace size={23} strokeWidth={1.7} /></ProductRailLink></TooltipTrigger><TooltipContent side="right" sideOffset={10}>{t('Workspace', '工作空间')}</TooltipContent></Tooltip>}
      {showWorkspaceAreas && <><Tooltip delayDuration={250}><TooltipTrigger asChild><ProductRailLink to="/generations" className={`rail-item${activePath === 'generations' ? ' selected' : ''}`} aria-label={t('Generations', '生成对话')}><RailChat size={23} stroke={1.7} /></ProductRailLink></TooltipTrigger><TooltipContent side="right" sideOffset={10}>{t('Generations', '生成对话')}</TooltipContent></Tooltip>
      <Tooltip delayDuration={250}><TooltipTrigger asChild><ProductRailLink to="/activity" className={`rail-item${activePath.startsWith('activity') ? ' selected' : ''}`} aria-label={t('Activity', '活动')}><ChartNoAxesCombined size={23} aria-hidden="true" /></ProductRailLink></TooltipTrigger><TooltipContent side="right" sideOffset={10}>{t('Activity', '活动')}</TooltipContent></Tooltip>
      <Tooltip delayDuration={250}><TooltipTrigger asChild><ProductRailLink to={modelsHref} reloadDocument={!token} className={`rail-item${destination === 'Models' ? ' selected' : ''}`} aria-label={t('Models', '模型')}><RailModels size={23} strokeWidth={1.7} /></ProductRailLink></TooltipTrigger><TooltipContent side="right" sideOffset={10}>{t('Models', '模型')}</TooltipContent></Tooltip>
      </>}
      <div className="rail-bottom">{(isInstallation || Boolean(session?.provider_memberships?.length)) && <Tooltip delayDuration={250}><TooltipTrigger asChild><ProductRailLink to={isInstallation ? '/admin/providers' : session?.provider_memberships?.length ? `/providers/${providerPathSegment(session.provider_memberships[0])}` : '/providers'} className={`rail-item${supplierArea ? ' selected' : ''}`} aria-label={isInstallation ? t("Admin", "管理后台") : t("Providers", "模型供应商")}>{isInstallation ? <IconShieldLock size={24} aria-hidden="true" /> : <RailSuppliers size={23} stroke={1.7} aria-hidden="true" />}</ProductRailLink></TooltipTrigger><TooltipContent side="right" sideOffset={10}>{isInstallation ? t("Admin", "管理后台") : t("Providers", "模型供应商")}</TooltipContent></Tooltip>}<Tooltip delayDuration={250}><TooltipTrigger asChild><ProductRailLink className={`rail-item${helpArea ? ' selected' : ''}`} to="/help/" aria-label={t("Documentation", "文档")}>{helpArea ? <RailDocsFilled size={23} /> : <RailDocs size={23} stroke={1.7} />}</ProductRailLink></TooltipTrigger><TooltipContent side="right" sideOffset={10}>{t("Documentation", "文档")}</TooltipContent></Tooltip><DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="rail-item" aria-label={t("Switch language", "切换界面语言")} title={t(`Language: ${locale === 'zh-CN' ? '简体中文' : 'English'}`, `界面语言：${locale === 'zh-CN' ? '简体中文' : 'English'}`)}><IconLanguage size={22} stroke={1.7} aria-hidden="true" /></button></DropdownMenuTrigger><DropdownMenuContent side="right" align="end" sideOffset={12} collisionPadding={12} className="w-40"><DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground"><IconLanguage size={14} />{t("Language", "界面语言")}</DropdownMenuLabel><DropdownMenuRadioGroup aria-label="Language" value={locale} onValueChange={value => setLocale(value as Locale)}><DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem><DropdownMenuRadioItem value="zh-CN">简体中文</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu><AccountMenu context={context} workspacePath={activeWorkspacePath} supplierArea={supplierArea}/></div>
    </nav>
    <div className="app-rail-spacer" aria-hidden="true" />
    {hasSidebar && <Sidebar
      ref={sidebarRef}
      id={adminArea ? "admin-navigation" : activityArea ? "activity-navigation" : settingsArea ? "settings-navigation" : supplierArea ? "supplier-navigation" : "workspace-navigation"}
      side="left"
      variant="sidebar"
      collapsible="offcanvas"
      className="niu-workspace-sidebar"
      mobileClassName="niu-workspace-sidebar-mobile" mobileContentProps={{ onCloseAutoFocus: event => { if (toggleRef.current?.isConnected) { event.preventDefault(); toggleRef.current.focus(); } }, onInteractOutside: event => { const target = event.detail.originalEvent.target; if (target instanceof Element && target.closest('.app-rail, .account-menu, [data-slot="dropdown-menu-sub-content"]')) event.preventDefault(); } }}
      mobileStyle={{ left: 'var(--rail)', top: 0, right: 0, bottom: 0, width: 'min(var(--context), calc(100vw - var(--rail)))', height: 'auto' }}
    >
      {activityArea ? <><SidebarHeader className="sidebar-heading"><h2 className="sidebar-heading-row">{t('Activity', '活动')}</h2></SidebarHeader><SidebarContent className="workspace-sidebar-content"><nav aria-label="Activity navigation"><SidebarMenu className="workspace-nav-menu">{[{to:'/activity',label:t('Overview', '概览'),icon:LayoutDashboard},{to:'/activity/logs',label:t('Logs', '请求日志'),icon:IconListDetails}].map(item => <SidebarMenuItem key={item.to}><SidebarMenuButton asChild isActive={location.pathname === item.to} className="nav-item"><ProductRailLink to={item.to + location.search} end><item.icon className="nav-icon" aria-hidden="true"/><span>{item.label}</span></ProductRailLink></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></nav></SidebarContent></> : settingsArea ? <SettingsNavigation context={context} /> : adminArea ? <ProviderNav context={context} /> : supplierArea ? <ProviderNav context={context} /> : <WorkspaceNav creationAvailable={paymentReadiness.status === 'ready'} context={context} activeWorkspacePath={activeWorkspacePath} models={models} activePath={activePath} onCreateWorkspace={() => setWorkspaceCreateOpen(true)} />}
      {phoneNavigation && <SidebarFooter><AccountMenu context={context} workspacePath={activeWorkspacePath} supplierArea={supplierArea} mobile /></SidebarFooter>}
    </Sidebar>}
    <SidebarInset className="main-panel">
      {mockPaymentsEnabled && <Alert className="mock-payment-warning shrink-0 rounded-none" role="status"><TriangleAlert aria-hidden="true"/><AlertTitle className="line-clamp-none">{t('Mock payments enabled · Real model costs', '模拟支付已开启 · 实际产生模型费用')}</AlertTitle><AlertDescription>{t('Only payments are simulated. LLM requests still incur upstream Provider charges. Do not share this environment’s Niu API keys or upstream Provider keys publicly.', '当前仅模拟充值支付流程，模型调用仍会产生真实的上游供应商费用。请勿公开分享此环境的 Niu API 密钥或上游供应商密钥。')}</AlertDescription></Alert>}
      {phoneNavigation && !hasSidebar && !isGlobalChat && <nav className="mobile-product-navigation" aria-label="Product navigation"><a href={import.meta.env.BASE_URL} aria-label={`${branding.display_name} home`}><img src={logo} alt="" /></a><AccountMenu context={context} workspacePath={activeWorkspacePath} supplierArea={supplierArea} mobile /></nav>}
      {!settingsArea && !isGlobalChat && !helpArea && <header className="dashboard-page-header">
        {(hasSidebar || modelFiltersAvailable) && <WorkspaceSidebarToggle buttonRef={toggleRef} supplierArea={supplierArea} modelsArea={destination === 'Models'} settingsArea={settingsArea} activityArea={activityArea} adminArea={adminArea} />}
        {phoneNavigation && hasSidebar && <a className="mobile-header-brand" href={import.meta.env.BASE_URL} aria-label={`${branding.display_name} home`}><img src={logo} alt="" /></a>}
        {destination === 'Workspace' && !workspaceDirectoryArea && !supplierArea && !adminArea ? <Breadcrumb aria-label="Breadcrumb" className="breadcrumbs"><BreadcrumbList className="flex-nowrap gap-1 sm:gap-2.5">
          <BreadcrumbItem className="min-w-0 gap-0"><BreadcrumbLink asChild><NavLink className={`truncate ${activePath.startsWith('guardrails/') ? 'max-w-12' : 'max-w-16'} sm:max-w-64`} to={activeWorkspacePath}>{workspace ? workspaceDisplayName(workspace.name) : t('Workspace', '工作空间')}</NavLink></BreadcrumbLink>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-6 shrink-0" aria-label="Switch workspace in header" disabled={!workspaces.length}><ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start"><DropdownMenuLabel>{t('Workspaces', '工作空间')}</DropdownMenuLabel><DropdownMenuRadioGroup value={workspace?.id ?? ''} onValueChange={id => {const next=workspaces.find(item => item.id === id);if(next) selectWorkspace(next);}}>{workspaces.map(item => <DropdownMenuRadioItem key={item.id} value={item.id}>{workspaceDisplayName(item.name)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup><DropdownMenuSeparator/><DropdownMenuItem asChild><NavLink to="/workspaces">{t('All workspaces', '所有工作空间')}</NavLink></DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
          <BreadcrumbSeparator>/</BreadcrumbSeparator>
          {activePath.startsWith('keys/') && <><BreadcrumbItem><BreadcrumbLink asChild><NavLink to={`${activeWorkspacePath}/keys`}>{t('API keys', 'API 密钥')}</NavLink></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator>/</BreadcrumbSeparator></>}
          {activePath.startsWith('guardrails/') && <><BreadcrumbItem className="hidden sm:inline-flex"><BreadcrumbLink asChild><NavLink to={`${activeWorkspacePath}/guardrails`}>{t('Guardrails', '安全护栏')}</NavLink></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden sm:block">/</BreadcrumbSeparator></>}
          {isGuardrailEditor && <><BreadcrumbItem className="hidden sm:inline-flex"><BreadcrumbLink asChild><NavLink to={`${activeWorkspacePath}/guardrails/policy`}>{t('Policy', '策略')}</NavLink></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden sm:block">/</BreadcrumbSeparator></>}
          {activePath.startsWith('guardrails/') && <><BreadcrumbItem className="sm:hidden"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-6" aria-label="Show parent pages">…</Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem asChild><NavLink to={`${activeWorkspacePath}/guardrails`}>{t('Guardrails', '安全护栏')}</NavLink></DropdownMenuItem>{isGuardrailEditor && <DropdownMenuItem asChild><NavLink to={`${activeWorkspacePath}/guardrails/policy`}>{t('Policy', '策略')}</NavLink></DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></BreadcrumbItem><BreadcrumbSeparator className="sm:hidden">/</BreadcrumbSeparator></>}
          <BreadcrumbItem className="min-w-0"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-auto min-w-0 max-w-full gap-1 px-1 py-1" aria-label="Switch workspace page"><h1 className="dashboard-route-title">{title}</h1><ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={activeNavigation?.to ?? ''} onValueChange={value => navigate(value === '.' ? activeWorkspacePath : `${activeWorkspacePath}/${value}`)}>{scopedNavigation.filter(item => item.destination === 'Workspace').map(item => <DropdownMenuRadioItem key={item.to} value={item.to}>{isZh ? item.labelZh : item.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></BreadcrumbItem>
        </BreadcrumbList></Breadcrumb> : adminSupplierId ? <Breadcrumb aria-label="Breadcrumb" className="breadcrumbs"><BreadcrumbList><BreadcrumbItem className="hidden sm:inline-flex"><BreadcrumbLink asChild><NavLink to="/admin/providers">{t('Providers', '模型供应商')}</NavLink></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden sm:block" /><BreadcrumbItem><BreadcrumbLink asChild><NavLink className="max-w-28 truncate sm:max-w-none" to={`/admin/providers/${encodeURIComponent(adminSupplierId)}`}>{adminSupplierName || t('Loading Provider…', '正在加载供应商…')}</NavLink></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><h1 className="dashboard-route-title" aria-current="page">{title}</h1></BreadcrumbItem></BreadcrumbList></Breadcrumb> : <Breadcrumb aria-label="Breadcrumb" className="breadcrumbs">{!(adminArea || workspaceDirectoryArea || destination === 'Global' || destination === 'Models' || (supplierArea && !supplierManagement)) && <><span>{settingsArea ? t('Settings', '设置') : supplierArea ? t('Providers', '模型供应商') : platform ? t('Platform', '平台') : destination === 'Organization' ? t('Organization', '组织') : t('Workspace', '工作空间')}</span><span className="crumb-divider" aria-hidden="true">/</span></>}<h1 className="dashboard-route-title">{destination === 'Models' && activePath.startsWith('models/') ? <NavLink to={modelsHref} reloadDocument={!token}>{t('Models', '模型')}</NavLink> : title}</h1></Breadcrumb>}
        <div id="dashboard-page-actions" className="dashboard-page-actions" hidden={setupBlocked} style={setupBlocked ? {display:'none'} : undefined} />
      </header>}
      <div className={`page-content${helpArea ? ' help-content' : ''}`} id="dashboard-content" tabIndex={-1}>
        {!helpArea && gatewayStatus === 'checking' && <p role="status">{t('Connecting to your workspace…', '正在连接工作空间…')}</p>}
        {gatewayOutage}{signOutFailure}
        {(helpArea || gateway.everConnected) && <div className="gateway-route-content" hidden={!helpArea && gatewayStatus !== 'online'}>
          {adminSupplierId && <Tabs value={location.pathname.split('/')[4] || 'overview'} onValueChange={section => navigate(`/admin/providers/${encodeURIComponent(adminSupplierId)}${section === 'overview' ? '' : '/' + section}`)} className="mb-6 min-w-0">
            <div ref={supplierTabsRef} className="max-w-full overflow-x-auto"><TabsList variant="line" aria-label="Provider sections">
              {[['overview', t('Overview', '概览')], ['keys', t('API keys', 'API 密钥')], ['models', t('Models', '模型')], ['usage', t('Usage', '调用量')], ['settlements', t('Settlements', '结算账单')], ['members', t('Members', '成员管理')], ['settings', t('Settings', '设置')]].map(([value, label]) => <TabsTrigger key={value} value={value}>{label}</TabsTrigger>)}
            </TabsList></div>
          </Tabs>}
          {setupBlocked && <section className="space-y-4 py-6" aria-label="Service setup">
            <h2 className="text-lg font-semibold">{paymentReadiness.status === 'loading' ? t('Checking service setup…', '正在检查服务配置…') : paymentReadiness.status === 'error' ? t('Could not verify service setup', '无法验证服务配置') : t('Service setup required', '需要完成服务配置')}</h2>
            <p role="status" className="text-muted-foreground">{paymentReadiness.status === 'loading' ? t('Checking payment setup or funding for this account.', '正在检查当前账户的支付配置或资金状态。') : paymentReadiness.status === 'error' ? t('We couldn’t check service setup. Your work is preserved. Check your connection and try again.', '无法检查服务配置。您的工作已保留，请检查网络连接后重试。') : isInstallation ? t('Configure the platform currency, then connect a payment gateway or fund this company’s account. Funded self-hosted workspaces do not require a merchant.', '请先配置平台结算币种，然后连接支付网关或为该企业账户充值。已充值的私有化部署工作空间无需配置商户网关。') : t('Your service administrator needs to configure payments or fund your company’s account before workspace features become available.', '您的服务管理员需要先配置支付网关或为企业账户充值，工作空间功能方可使用。')}</p>
            <div className="flex flex-wrap gap-3">{isInstallation && paymentReadiness.status === 'blocked' && <Button asChild><NavLink to={paymentReadiness.reason === 'currency_required' ? '/admin/settings' : '/admin/payments'}>{paymentReadiness.reason === 'currency_required' ? t('Configure platform currency', '配置平台币种') : t('Configure payment gateways', '配置支付网关')}</NavLink></Button>}{isInstallation && paymentReadiness.status === 'blocked' && paymentReadiness.reason !== 'currency_required' && <Button variant="outline" asChild><NavLink to="/admin/balances">{t('Manage account funding', '管理账户充值')}</NavLink></Button>}<Button variant="outline" disabled={paymentReadiness.status === 'loading'} onClick={()=>{paymentReadiness.retry();setWorkspaceLoadRevision(value=>value+1);}}>{t('Check again', '重新检查')}</Button></div>
          </section>}
          {(!setupBlocked || paymentReadiness.retainContent) && <div hidden={setupBlocked}>{helpArea ? <Outlet context={context} /> : token && !supplierArea && !settingsArea && effectiveWorkspaceError ? <WorkspaceRecovery problem={effectiveWorkspaceError} onRetry={() => setWorkspaceLoadRevision(value => value + 1)} /> : token && !supplierArea && !settingsArea && (workspaceLoading || workspacesLoadedFor !== token) ? <p role="status">{t('Loading workspace…', '正在加载工作空间…')}</p> : <Outlet context={context} />}</div>}
        </div>}
      </div>
    </SidebarInset>
  </SidebarProvider>;
}
