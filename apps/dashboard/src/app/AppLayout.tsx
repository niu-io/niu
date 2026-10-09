import { IconPalette } from '@tabler/icons-react';
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
import { request } from '@/features/vendors/api';
import { IconWifiOff as WifiOff } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import type { AdminSession, DashboardContext, GatewayStatus, Model, Organization, SessionChatKey, Workspace, WorkspaceProblem } from './dashboard-context';
import { navigation } from './navigation';
import AccountMenu from './AccountMenu';
import { SettingsDialog, settingsHref, SettingsNavigation } from '@/features/account/settings-page';
import { useAccountAppearance } from './useAccountAppearance';
import WorkspaceSwitcher, { WorkspaceCreateDialog } from './WorkspaceSwitcher';
import WorkspaceRecovery from './WorkspaceRecovery';
import { useGatewayConnection } from './useGatewayConnection';
import { resolveWorkspacePathSegment, workspacePathSegment, workspaceDisplayName } from './workspace-route';
import { useBranding } from './branding';

const sidebarBreakpoint = 960;

function WorkspaceNav({
  context,
  activeWorkspacePath,
  models,
  activePath,
  onCreateWorkspace,
}: {
  context: DashboardContext;
  activeWorkspacePath: string;
  models: Model[];
  activePath: string;
  onCreateWorkspace: () => void;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const navItems = navigation.filter(item => item.destination === 'Workspace'
    && (item.to !== 'costs' || context.session?.kind === 'installation'));

  return <>
    <SidebarHeader className="sidebar-heading"><WorkspaceSwitcher context={context} onCreateWorkspace={onCreateWorkspace} /></SidebarHeader>
    <SidebarContent className="workspace-sidebar-content">
      <nav aria-label="Main navigation">
        <SidebarMenu className="workspace-nav-menu">
          {navItems.map(item => {
            const path = item.to === '.' ? activeWorkspacePath : `${activeWorkspacePath}/${item.to}`;
            const isActive = item.to === '.' ? activePath === '.' : activePath === item.to || activePath.startsWith(`${item.to.replace(/^\/+|\/+$/g, '')}/`);
            return <SidebarMenuItem key={item.to}>
              <SidebarMenuButton asChild isActive={isActive} className="nav-item" tooltip={item.label}>
                <NavLink to={path} end={item.to === '.'} onClick={() => { if (isMobile) setOpenMobile(false); }} aria-label={item.label}>
                  <item.icon className="nav-icon" aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.to === 'models' && models.length > 0 && <span className="nav-count">{models.length}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>;
          })}
        </SidebarMenu>
      </nav>
    </SidebarContent>
    <SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild><NavLink to="/help/"><CircleHelp size={16} /><span>Documentation</span></NavLink></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
  </>;
}

export function SupplierNav({ context }: { context: DashboardContext }) {
  const { provider: supplier, supplierId: adminSupplier } = useParams();
  const { isMobile, setOpenMobile } = useSidebar();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [supplierDirectory, setSuppliers] = useState<{id: string; name: string}[]>([]);
  const [directoryOwner, setDirectoryOwner] = useState('');
  const suppliers = directoryOwner === context.token ? supplierDirectory : [];
  const [loading, setLoading] = useState(false);
  const [retryRevision, setRetryRevision] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => { const refresh = () => setRetryRevision(value => value + 1); window.addEventListener('niu:supplier-profile-updated', refresh); return () => window.removeEventListener('niu:supplier-profile-updated', refresh); }, []);
  useEffect(() => {
    if (!(context.session?.kind === 'installation' || context.session?.permissions.platform_admin)) {
      setSuppliers(context.session?.provider_memberships ?? []);
      setDirectoryOwner(context.token);setError('');setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);setError('');
    void request<{data: {id: string; name: string}[]}>(context.token, '/admin/v1/providers', 'GET', undefined, controller.signal)
      .then(result => {
        if (!Array.isArray(result.data)) throw new Error('Invalid supplier list');
        if (!controller.signal.aborted) { setSuppliers(result.data);setDirectoryOwner(context.token);setError(''); }
      })
      .catch(() => { if (!controller.signal.aborted) setError('Could not load suppliers.'); })
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [context.token, context.session, retryRevision]);
  const selected = adminSupplier ?? supplier ?? search.get('supplier') ?? suppliers[0]?.id ?? '';
  const membership = suppliers.find(item => item.id === selected);

  const location = useLocation();
  const entries = supplier ? [
    { to: `/suppliers/${supplier}`, label: 'Overview', end: true },
    { to: `/suppliers/${supplier}/models`, label: 'Models & pricing', end: false },
    { to: `/suppliers/${supplier}/consumption`, label: 'Usage', end: false },
    { to: `/suppliers/${supplier}/settlements`, label: 'Settlements', end: false },
  ] : [
    { to: '/admin/suppliers', label: 'Suppliers', end: false },
    { to: '/admin/payments', label: 'Payment gateways', end: false },
    { to: '/admin/branding', label: 'Branding & theme', end: false },
  ];
  return <>
    <SidebarHeader className="sidebar-heading">
      {!supplier && <h2 className="sidebar-heading-row">Admin</h2>}
      {supplier && <div className="workspace-switcher"><DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" className="workspace-switcher-trigger" aria-label="Switch supplier" title="Switch supplier">
          <span className="workspace-switcher-copy"><strong>{membership?.name ?? (loading ? 'Loading supplier…' : error ? 'Supplier unavailable' : 'Choose supplier')}</strong></span><ChevronsUpDown size={16} />
        </Button></DropdownMenuTrigger>
        <DropdownMenuContent className="workspace-switcher-menu" side="bottom" align="start" sideOffset={8} collisionPadding={12}>
          <DropdownMenuLabel className="workspace-switcher-menu-title">Suppliers</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={selected} onValueChange={id => {
            const section = location.pathname.split('/')[adminSupplier ? 4 : 3];
            const nextSearch = new URLSearchParams(location.search);
            for (const key of ['supplier', 'create', 'properties']) nextSearch.delete(key);
            navigate(`${adminSupplier ? '/admin' : ''}/suppliers/${encodeURIComponent(id)}${section ? '/' + section : ''}${nextSearch.size ? '?' + nextSearch.toString() : ''}${location.hash}`);
            if (isMobile) setOpenMobile(false);
          }}>{suppliers.map(item => <DropdownMenuRadioItem key={item.id} value={item.id}><span>{item.name}</span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>
          {loading && <DropdownMenuLabel role="status">Loading suppliers…</DropdownMenuLabel>}
          {!loading && !error && suppliers.length === 0 && <DropdownMenuLabel>No suppliers yet</DropdownMenuLabel>}
          {error && <><div className="workspace-switcher-error" role="alert">{error}</div><DropdownMenuItem onSelect={event => {event.preventDefault();setRetryRevision(value => value + 1);}}>Retry supplier list</DropdownMenuItem></>}
          {!adminSupplier && (context.session?.kind === 'installation' || context.session?.permissions.platform_admin) && <><DropdownMenuSeparator className="workspace-switcher-separator" /><DropdownMenuItem disabled={!membership || loading || Boolean(error)} onSelect={() => navigate('/admin/suppliers/' + encodeURIComponent(selected) + '/settings')}><Settings2 size={16} />Supplier settings</DropdownMenuItem><DropdownMenuItem className="workspace-switcher-create" onSelect={() => navigate('/admin/suppliers/overview?create=supplier' + (selected ? '&supplier=' + encodeURIComponent(selected) : ''))}><Plus size={16} />Add supplier</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu></div>}
    </SidebarHeader>
    <SidebarContent className="workspace-sidebar-content">
      <nav aria-label={supplier ? "Supplier navigation" : "Admin navigation"}><SidebarMenu className="workspace-nav-menu">
        {entries.map(item => { const Icon = item.label === 'Settings' ? Settings2 : item.label === 'API keys & routes' ? KeyRound : item.label === 'Portal access' ? Users : item.label === 'Suppliers' ? RailSuppliers : item.label === 'Payment gateways' ? CreditCard : item.label === 'Branding & theme' ? IconPalette : item.label === 'Overview' ? LayoutDashboard : item.label === 'Models & pricing' ? Boxes : item.label === 'Settlements' ? CreditCard : ChartNoAxesCombined; return <SidebarMenuItem key={item.to}>
          <SidebarMenuButton asChild isActive={location.pathname === item.to || (!supplier && location.pathname.startsWith(item.to + "/"))} className="nav-item provider-zone-item">
            <NavLink to={item.to} end={item.end} onClick={() => { if (isMobile) setOpenMobile(false); }}><Icon className="nav-icon" aria-hidden="true" /><span>{item.label}</span></NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>; })}
      </SidebarMenu></nav>
    </SidebarContent>
  </>;
}

function WorkspaceSidebarToggle({ buttonRef, supplierArea = false, modelsArea = false, settingsArea = false, activityArea = false, adminArea = false }: { buttonRef: RefObject<HTMLButtonElement | null>; supplierArea?: boolean; modelsArea?: boolean; settingsArea?: boolean; activityArea?: boolean; adminArea?: boolean }) {
  const { isMobile, openMobile, state, toggleSidebar } = useSidebar();
  const expanded = isMobile ? openMobile : state === 'expanded';
  return <Button ref={buttonRef} type="button" variant="ghost" size="icon" className="sidebar-toggle" onClick={toggleSidebar} aria-expanded={expanded} aria-controls={adminArea ? "admin-navigation" : activityArea ? "activity-navigation" : settingsArea ? "settings-navigation" : modelsArea ? "model-filters" : supplierArea ? "supplier-navigation" : "workspace-navigation"} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${adminArea ? 'admin navigation' : activityArea ? 'activity navigation' : settingsArea ? 'settings navigation' : modelsArea ? 'model filters' : supplierArea ? 'supplier navigation' : 'workspace navigation'}`} title={expanded ? 'Collapse navigation' : 'Expand navigation'}>
    {expanded ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
  </Button>;
}

function ProductRailLink({ to, onActivate, children, onClick, ...props }: NavLinkProps & { onActivate?: () => void }) {
  const { isMobile, setOpenMobile } = useSidebar();
  return <NavLink to={to} {...props} onClick={event => { onActivate?.(); onClick?.(event); if (!event.defaultPrevented && isMobile) setOpenMobile(false); }}>{children}</NavLink>;
}

export default function AppLayout() {
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
  const supplierArea = adminArea || location.pathname === '/suppliers' || location.pathname.startsWith('/suppliers/');
  const supplierManagement = supplierArea && location.pathname !== '/suppliers';
  const adminSupplierId = adminArea && location.pathname.startsWith('/admin/suppliers/') ? location.pathname.split('/')[3] : '';
  const [adminSupplierName, setAdminSupplierName] = useState('');
  const [supplierProfileRevision, setSupplierProfileRevision] = useState(0);
  useEffect(() => { const refresh = () => setSupplierProfileRevision(value => value + 1); window.addEventListener('niu:supplier-profile-updated', refresh); return () => window.removeEventListener('niu:supplier-profile-updated', refresh); }, []);
  useEffect(() => {
    setAdminSupplierName('');
    if (!adminSupplierId || !token) return;
    const controller = new AbortController();
    void request<{ data: {id: string; name: string}[] }>(token, '/admin/v1/providers', 'GET', undefined, controller.signal).then(result => {
      if (!controller.signal.aborted) setAdminSupplierName(result.data.find(item => item.id === adminSupplierId)?.name ?? 'Supplier unavailable');
    }).catch(() => {});
    return () => controller.abort();
  }, [adminSupplierId, token, supplierProfileRevision]);
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
  const workspaceNavigation = useRef({routeWorkspace, workspace, workspaces, location});
  useLayoutEffect(() => { workspaceNavigation.current = {routeWorkspace, workspace, workspaces, location}; }, [routeWorkspace, workspace, workspaces, location]);
  const modelOrganizationId = routeWorkspace?.organization_id ?? selectedOrganizationId ?? workspace?.organization_id;
  const modelWorkspace = routeWorkspace ?? workspace;
  const modelWorkspaceId = modelWorkspace && modelWorkspace.organization_id === modelOrganizationId ? modelWorkspace.id : undefined;

  const authenticate = useCallback(async (credential: string, restoring = false) => {
    setError('');
    connectionController.current?.abort();
    const controller = new AbortController();
    connectionController.current = controller;
    const revision = ++connectionRevision.current;
    try {
      const sessionResponse = await fetch('/admin/v1/session', {
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
      const response = await fetch('/admin/v1/models', {
        headers: { authorization: `Bearer ${credential}` },
        signal: controller.signal,
      });
      if (revision !== connectionRevision.current || controller.signal.aborted) return;
      if (!response.ok) {
        if (revision === connectionRevision.current) setError('Could not sign in. Try again.');
        return;
      }
      const value = await response.json() as { data: Model[] };
      if (revision !== connectionRevision.current || controller.signal.aborted) return;
      setModels(value.data);
      setSession(sessionValue.data);
      setToken(credential);
      try { sessionStorage.removeItem('niu.signed-out'); } catch { /* Storage is optional. */ }
      setDraftToken('');
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
        const response = await fetch(browser ? '/admin/v1/auth/browser/logout' : '/admin/v1/auth/logout', {
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
    const controller = new AbortController();
    void (async () => {
      const configured = await fetch('/admin/v1/auth/config', { signal: controller.signal, cache: 'no-store' });
      if (configured.ok && (await configured.json()).password_login === true) {
        await authenticate('niu-browser-member-session', true);
        return null;
      }
      return null;
    })()
      .catch(() => { /* The login page handles unavailable authentication. */ })
      .finally(() => { if (!controller.signal.aborted) setSessionChecked(true); });
    return () => controller.abort();
  }, [authenticate, token, health?.status]);

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
      const response = await fetch('/admin/v1/models' + query, {
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
        const response = await fetch('/admin/v1/session', {
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
          setError('This admin session has expired or been revoked. Sign in again with valid administrator access.');
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
      fetch('/admin/v1/organizations', { headers, signal: controller.signal }),
      fetch('/admin/v1/workspaces', { headers, signal: controller.signal }),
    ]).then(async ([organizationResponse, workspaceResponse]) => {
      if (!organizationResponse.ok || !workspaceResponse.ok) {
        const [endpoint, response] = !organizationResponse.ok
          ? ['/admin/v1/organizations', organizationResponse]
          : ['/admin/v1/workspaces', workspaceResponse];
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
    if (usesSelectedWorkspace && !settingsArea && !workspaceDirectoryArea) {
      const search = new URLSearchParams(location.search);
      search.set('workspace', next.id);
      navigate({ pathname: location.pathname, search: `?${search.toString()}`, hash: location.hash }, { replace: true });
      return;
    }
    const currentSection = location.pathname.startsWith('/workspaces/') ? location.pathname.split('/').filter(Boolean).slice(2).join('/') : '';
    const keyDetail = currentSection.startsWith('keys/') && currentSection !== 'keys/new';
    const nestedPath = keyDetail ? 'keys' : currentSection;
    const nextSearch = new URLSearchParams(location.search);
    nextSearch.delete('keyId');
    const knownWorkspaces = workspaces.some(item => item.id === next.id) ? workspaces : [...workspaces, next];
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

  const createWorkspace = useCallback(async (name: string, organizationId?: string) => {
    if (!token) throw new Error('Sign in before creating a workspace.');
    const response = await fetch('/admin/v1/workspaces', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name, organization_id: organizationId || null }),
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
      `/admin/v1/organizations/${target.organization_id}/projects/${target.id}`, 'PATCH', {name: name.trim()});
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
    await request(token, `/admin/v1/organizations/${target.organization_id}/projects/${target.id}`, 'DELETE');
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
    if (!preferred && (routeWorkspaceId === 'default' || usesSelectedWorkspace)) {
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
      }
    } else {
      setWorkspace(null);
      if (routeWorkspaceId && routeWorkspaceId !== 'default') setWorkspaceError({ kind: 'missing', workspace: routeWorkspaceId });
    }
  }, [location.pathname, location.search, location.hash, usesSelectedWorkspace, navigate, routeWorkspaceId, session, token, workspaceLoading, workspaces, workspacesLoadedFor, selectedOrganizationId]);

  const gatewayStatus: GatewayStatus = health?.status === 'ok'
    ? 'online'
    : healthChecked
      ? 'offline'
      : 'checking';
  const context = useMemo<DashboardContext>(() => ({
    appearance,
    token,
    session,
    organizations,
    organization: organizations.find(item => item.id === (routeWorkspace?.organization_id ?? selectedOrganizationId)) ?? organizations[0] ?? null,
    selectOrganization,
    workspaces,
    workspace: usesSelectedWorkspace || routeWorkspaceId === 'default' ? workspace : workspace?.id === routeWorkspace?.id ? workspace : null,
    workspaceLoading,
    reloadWorkspaces,
    workspaceError,
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
  }), [appearance, token, session, organizations, selectedOrganizationId, selectOrganization, workspaces, workspace, routeWorkspaceId, usesSelectedWorkspace, workspaceLoading, reloadWorkspaces, workspaceError, selectWorkspace, createWorkspace, renameWorkspace, deleteWorkspace, chatKeys, rememberChatKey, forgetChatKey, draftToken, models, modelsLoading, modelsError, health, gatewayStatus, error, connect, authenticate, signOut, refreshModels, refreshWorkspace]);
  const activePath = location.pathname.startsWith('/workspaces/')
    ? location.pathname.split('/').filter(Boolean).slice(2).join('/') || '.'
    : location.pathname.replace(/^\/+|\/+$/g, '');
  const scopedNavigation = navigation.filter(item => location.pathname.startsWith('/workspaces/') ? item.destination === 'Workspace' || item.destination === 'Organization' : item.destination !== 'Workspace');
  const activeNavigation = scopedNavigation.find(item => item.to.replace(/^\/+|\/+$/g, '') === activePath)
    ?? scopedNavigation.filter(item => activePath.startsWith(`${item.to.replace(/^\/+|\/+$/g, '')}/`)).sort((a, b) => b.to.length - a.to.length)[0];
  const helpArea = location.pathname === '/help' || location.pathname.startsWith('/help/');
  const guardrailTitles: Record<string, string> = {policy:'Policy',input:'Input rules',output:'Output rules',access:'Model access',detectors:'External checks',history:'History',denials:'Blocked requests'};
  const isGuardrailEditor = ['guardrails/input','guardrails/output','guardrails/access','guardrails/detectors'].includes(activePath);
  const title = workspaceDirectoryArea ? 'Workspaces' : settingsArea ? ({account:'Account',appearance:'Appearance',billing:'Billing',payments:'Payments',about:'About'}[location.pathname.split('/')[2] ?? 'account'] ?? 'Settings') : loginArea
    ? location.pathname === '/installation' ? 'Installation administration' : 'Sign in'
    : helpArea
      ? 'Documentation'
    : supplierArea
      ? ({ oauth: 'OAuth providers', payments: 'Payment gateways', branding: 'Branding & theme', overview: 'Overview', configuration: 'API keys & routes', models: 'Models & pricing', consumption: 'Usage', settlements: 'Settlements', members: 'Portal access', settings: 'Settings' }[location.pathname.split('/').pop() ?? ''] ?? (location.pathname === '/admin/suppliers' ? 'Suppliers' : supplierManagement ? 'Overview' : 'Suppliers'))
      : activePath === 'keys/new'
        ? 'New API key'
        : activePath.startsWith('keys/')
          ? 'API key'
          : activePath.startsWith('guardrails/') ? guardrailTitles[activePath.split('/')[1]] ?? 'Guardrails'
          : activePath === 'benchmarks' ? 'Benchmarks'
          : activeNavigation?.label ?? 'Page not found';

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
  const hasSidebar = !helpArea && (!adminArea || ((session?.kind === 'installation' || session?.permissions.platform_admin) && session.permissions.manage_operators)) && (!settingsArea && (activityArea || supplierManagement || destination === 'Workspace'));
  const isInstallation = session?.kind === 'installation' || Boolean(session?.permissions.platform_admin);
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
    if (!loginArea && !token && sessionChecked) {
      navigate('/login', { state: { from: location.pathname + location.search + location.hash }, replace: true });
    }
  }, [loginArea, token, sessionChecked, navigate, location.pathname, location.search, location.hash]);
  const signOutFailure = signOutFailed && <Dialog open onOpenChange={setSignOutFailed}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Could not sign out</DialogTitle><DialogDescription>Your session has not been confirmed revoked. Try again when the connection is available.</DialogDescription></DialogHeader><DialogFooter><Button onClick={() => { void signOut(); }}>Try again</Button></DialogFooter></DialogContent></Dialog>;
  const gatewayOutage = !helpArea && gatewayStatus === 'offline' && <Dialog open><DialogContent showCloseButton={false} onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()} className="sm:max-w-md"><DialogHeader><WifiOff className="mb-2 size-6 text-muted-foreground" aria-hidden="true" /><DialogTitle>Gateway unavailable</DialogTitle><DialogDescription>We couldn’t reach the gateway. We’ll reconnect automatically when the service returns.</DialogDescription></DialogHeader><DialogFooter><Button disabled={gateway.checking} onClick={() => { void gateway.check(); }}>{gateway.checking ? 'Checking…' : 'Try again'}</Button></DialogFooter></DialogContent></Dialog>;
  if (!loginArea && !token && !sessionChecked) return <>{gatewayOutage}{signOutFailure}<RouterPending /></>;
  if (!loginArea && !token) return <p role="status">Redirecting to sign in…</p>;
  if (loginArea) return <div className="dashboard-login-shell"><Outlet context={context} /></div>;
  return <SidebarProvider
    open={sidebarOpen}
    onOpenChange={setSidebarOpen}
    className="app-shell"
    style={{ '--sidebar-width': 'var(--context)', '--sidebar-width-icon': 'var(--context)', '--sidebar-width-mobile': 'var(--context)' } as CSSProperties}
  >
    <a className="dashboard-skip" href="#dashboard-content">Skip to content</a>
    {!settingsArea && ['account','appearance','billing','payments','about'].includes(new URLSearchParams(location.search).get('settings') ?? '') && <SettingsDialog context={context} section={new URLSearchParams(location.search).get('settings') ?? undefined} href={section => settingsHref(location.pathname,location.search,location.hash,section)} onClose={() => { const query = new URLSearchParams(location.search); query.delete('settings'); navigate(location.pathname + (query.size ? '?' + query.toString() : '') + location.hash,{replace:true}); }}/>} 
    <WorkspaceCreateDialog context={context} open={workspaceCreateOpen} onOpenChange={setWorkspaceCreateOpen} />
    <nav className="app-rail" aria-label="Product navigation">
      <a className="rail-logo" href={import.meta.env.BASE_URL} aria-label={`${branding.display_name} home`}><img src={logo} alt="" /></a>
      {showWorkspaceAreas && <Tooltip delayDuration={250}><TooltipTrigger asChild><ProductRailLink to={activeWorkspacePath} end onActivate={() => {}} className={`rail-item${destination === 'Workspace' && location.pathname.startsWith('/workspaces/') && !supplierArea ? ' selected' : ''}`} aria-label="Workspace"><RailWorkspace size={23} strokeWidth={1.7} /></ProductRailLink></TooltipTrigger><TooltipContent side="right" sideOffset={10}>Workspace</TooltipContent></Tooltip>}
      {showWorkspaceAreas && <><Tooltip delayDuration={250}><TooltipTrigger asChild><ProductRailLink to="/generations" className={`rail-item${activePath === 'generations' ? ' selected' : ''}`} aria-label="Generations"><RailChat size={23} stroke={1.7} /></ProductRailLink></TooltipTrigger><TooltipContent side="right" sideOffset={10}>Generations</TooltipContent></Tooltip>
      <Tooltip delayDuration={250}><TooltipTrigger asChild><ProductRailLink to="/activity" className={`rail-item${activePath.startsWith('activity') ? ' selected' : ''}`} aria-label="Activity"><ChartNoAxesCombined size={23} aria-hidden="true" /></ProductRailLink></TooltipTrigger><TooltipContent side="right" sideOffset={10}>Activity</TooltipContent></Tooltip>
      <Tooltip delayDuration={250}><TooltipTrigger asChild><ProductRailLink to={`/models?workspace=${encodeURIComponent(activeWorkspacePath.split('/').pop() ?? 'default')}`} className={`rail-item${destination === 'Models' ? ' selected' : ''}`} aria-label="Models"><RailModels size={23} strokeWidth={1.7} /></ProductRailLink></TooltipTrigger><TooltipContent side="right" sideOffset={10}>Models</TooltipContent></Tooltip>
      </>}
      <div className="rail-bottom">{((isInstallation && session?.permissions.manage_operators) || Boolean(session?.provider_memberships?.length)) && <Tooltip delayDuration={250}><TooltipTrigger asChild><ProductRailLink to={isInstallation ? '/admin/suppliers' : session?.provider_memberships?.length ? `/suppliers/${session.provider_memberships[0].id}` : '/suppliers'} className={`rail-item${supplierArea ? ' selected' : ''}`} aria-label={isInstallation ? "Admin" : "Suppliers"}>{isInstallation ? <IconShieldLock size={24} aria-hidden="true" /> : <RailSuppliers size={23} stroke={1.7} aria-hidden="true" />}</ProductRailLink></TooltipTrigger><TooltipContent side="right" sideOffset={10}>{isInstallation ? "Admin" : "Suppliers"}</TooltipContent></Tooltip>}<Tooltip delayDuration={250}><TooltipTrigger asChild><ProductRailLink className={`rail-item${helpArea ? ' selected' : ''}`} to="/help/" aria-label="Documentation">{helpArea ? <RailDocsFilled size={23} /> : <RailDocs size={23} stroke={1.7} />}</ProductRailLink></TooltipTrigger><TooltipContent side="right" sideOffset={10}>Documentation</TooltipContent></Tooltip><AccountMenu context={context} workspacePath={activeWorkspacePath} supplierArea={supplierArea}/></div>
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
      {activityArea ? <><SidebarHeader className="sidebar-heading"><h2 className="sidebar-heading-row">Activity</h2></SidebarHeader><SidebarContent className="workspace-sidebar-content"><nav aria-label="Activity navigation"><SidebarMenu className="workspace-nav-menu">{[{to:'/activity',label:'Overview',icon:LayoutDashboard},{to:'/activity/logs',label:'Logs',icon:IconListDetails}].map(item => <SidebarMenuItem key={item.to}><SidebarMenuButton asChild isActive={location.pathname === item.to} className="nav-item"><ProductRailLink to={item.to + location.search} end><item.icon className="nav-icon" aria-hidden="true"/><span>{item.label}</span></ProductRailLink></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></nav></SidebarContent></> : settingsArea ? <SettingsNavigation context={context} /> : adminArea ? <SupplierNav context={context} /> : supplierArea ? <SupplierNav context={context} /> : <WorkspaceNav context={context} activeWorkspacePath={activeWorkspacePath} models={models} activePath={activePath} onCreateWorkspace={() => setWorkspaceCreateOpen(true)} />}
      {phoneNavigation && <SidebarFooter><AccountMenu context={context} workspacePath={activeWorkspacePath} supplierArea={supplierArea} mobile /></SidebarFooter>}
    </Sidebar>}
    <SidebarInset className="main-panel">
      {phoneNavigation && !hasSidebar && !isGlobalChat && (destination !== 'Models' || activePath.startsWith('models/')) && <nav className="mobile-product-navigation" aria-label="Product navigation"><a href={import.meta.env.BASE_URL} aria-label={`${branding.display_name} home`}><img src={logo} alt="" /></a><AccountMenu context={context} workspacePath={activeWorkspacePath} supplierArea={supplierArea} mobile /></nav>}
      {!settingsArea && !isGlobalChat && !helpArea && <header className="dashboard-page-header">
        {(hasSidebar || (destination === 'Models' && !activePath.startsWith('models/'))) && <WorkspaceSidebarToggle buttonRef={toggleRef} supplierArea={supplierArea} modelsArea={destination === 'Models'} settingsArea={settingsArea} activityArea={activityArea} adminArea={adminArea} />}
        {phoneNavigation && (hasSidebar || (destination === 'Models' && !activePath.startsWith('models/'))) && <a className="mobile-header-brand" href={import.meta.env.BASE_URL} aria-label={`${branding.display_name} home`}><img src={logo} alt="" /></a>}
        {destination === 'Workspace' && !workspaceDirectoryArea && !supplierArea && !adminArea ? <Breadcrumb aria-label="Breadcrumb" className="breadcrumbs"><BreadcrumbList className="flex-nowrap gap-1 sm:gap-2.5">
          <BreadcrumbItem className="min-w-0 gap-0"><BreadcrumbLink asChild><NavLink className={`truncate ${activePath.startsWith('guardrails/') ? 'max-w-12' : 'max-w-16'} sm:max-w-64`} to={activeWorkspacePath}>{workspace ? workspaceDisplayName(workspace.name) : 'Workspace'}</NavLink></BreadcrumbLink>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-6 shrink-0" aria-label="Switch workspace in header" disabled={!workspaces.length}><ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start"><DropdownMenuLabel>Workspaces</DropdownMenuLabel><DropdownMenuRadioGroup value={workspace?.id ?? ''} onValueChange={id => {const next=workspaces.find(item => item.id === id);if(next) selectWorkspace(next);}}>{workspaces.map(item => <DropdownMenuRadioItem key={item.id} value={item.id}>{workspaceDisplayName(item.name)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup><DropdownMenuSeparator/><DropdownMenuItem asChild><NavLink to="/workspaces">All workspaces</NavLink></DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
          <BreadcrumbSeparator>/</BreadcrumbSeparator>
          {activePath.startsWith('keys/') && <><BreadcrumbItem><BreadcrumbLink asChild><NavLink to={`${activeWorkspacePath}/keys`}>API keys</NavLink></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator>/</BreadcrumbSeparator></>}
          {activePath.startsWith('guardrails/') && <><BreadcrumbItem className="hidden sm:inline-flex"><BreadcrumbLink asChild><NavLink to={`${activeWorkspacePath}/guardrails`}>Guardrails</NavLink></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden sm:block">/</BreadcrumbSeparator></>}
          {isGuardrailEditor && <><BreadcrumbItem className="hidden sm:inline-flex"><BreadcrumbLink asChild><NavLink to={`${activeWorkspacePath}/guardrails/policy`}>Policy</NavLink></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden sm:block">/</BreadcrumbSeparator></>}
          {activePath.startsWith('guardrails/') && <><BreadcrumbItem className="sm:hidden"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-6" aria-label="Show parent pages">…</Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem asChild><NavLink to={`${activeWorkspacePath}/guardrails`}>Guardrails</NavLink></DropdownMenuItem>{isGuardrailEditor && <DropdownMenuItem asChild><NavLink to={`${activeWorkspacePath}/guardrails/policy`}>Policy</NavLink></DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></BreadcrumbItem><BreadcrumbSeparator className="sm:hidden">/</BreadcrumbSeparator></>}
          <BreadcrumbItem className="min-w-0"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-auto min-w-0 max-w-full gap-1 px-1 py-1" aria-label="Switch workspace page"><h1 className="dashboard-route-title">{title}</h1><ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={activeNavigation?.to ?? ''} onValueChange={value => navigate(value === '.' ? activeWorkspacePath : `${activeWorkspacePath}/${value}`)}>{scopedNavigation.filter(item => item.destination === 'Workspace').map(item => <DropdownMenuRadioItem key={item.to} value={item.to}>{item.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></BreadcrumbItem>
        </BreadcrumbList></Breadcrumb> : adminSupplierId ? <Breadcrumb aria-label="Breadcrumb" className="breadcrumbs"><BreadcrumbList><BreadcrumbItem className="hidden sm:inline-flex"><BreadcrumbLink asChild><NavLink to="/admin">Admin</NavLink></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden sm:block" /><BreadcrumbItem><BreadcrumbLink asChild><NavLink to="/admin/suppliers">Suppliers</NavLink></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbLink asChild><NavLink className="max-w-28 truncate sm:max-w-none" to={`/admin/suppliers/${encodeURIComponent(adminSupplierId)}`}>{adminSupplierName || 'Loading Supplier…'}</NavLink></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><h1 className="dashboard-route-title" aria-current="page">{title}</h1></BreadcrumbItem></BreadcrumbList></Breadcrumb> : <Breadcrumb aria-label="Breadcrumb" className="breadcrumbs">{!(workspaceDirectoryArea || destination === 'Global' || destination === 'Models' || (supplierArea && !supplierManagement)) && <><span>{settingsArea ? 'Settings' : adminArea ? 'Admin' : supplierArea ? 'Suppliers' : platform ? 'Platform' : destination === 'Organization' ? 'Organization' : 'Workspace'}</span><span className="crumb-divider" aria-hidden="true">/</span></>}<h1 className="dashboard-route-title">{destination === 'Models' && activePath.startsWith('models/') ? <NavLink to={`/models?workspace=${encodeURIComponent(activeWorkspacePath.split('/').pop() ?? 'default')}`}>Models</NavLink> : title}</h1></Breadcrumb>}
        <div id="dashboard-page-actions" className="dashboard-page-actions" />
      </header>}
      <div className={`page-content${helpArea ? ' help-content' : ''}`} id="dashboard-content" tabIndex={-1}>
        {!helpArea && gatewayStatus === 'checking' && <p role="status">Connecting to your workspace…</p>}
        {gatewayOutage}{signOutFailure}
        {(helpArea || gateway.everConnected) && <div className="gateway-route-content" hidden={!helpArea && gatewayStatus !== 'online'}>
          {adminSupplierId && <Tabs value={location.pathname.split('/')[4] || 'overview'} onValueChange={section => navigate(`/admin/suppliers/${encodeURIComponent(adminSupplierId)}${section === 'overview' ? '' : '/' + section}`)} className="mb-6 min-w-0">
            <div className="max-w-full overflow-x-auto"><TabsList variant="line" aria-label="Supplier sections">
              {[['overview', 'Overview'], ['configuration', 'API keys & routes'], ['models', 'Models & pricing'], ['consumption', 'Usage'], ['settlements', 'Settlements'], ['members', 'Portal access'], ['settings', 'Settings']].map(([value, label]) => <TabsTrigger key={value} value={value}>{label}</TabsTrigger>)}
            </TabsList></div>
          </Tabs>}
          {helpArea ? <Outlet context={context} /> : token && !supplierArea && !settingsArea && workspaceError ? <WorkspaceRecovery problem={workspaceError} onRetry={() => setWorkspaceLoadRevision(value => value + 1)} /> : token && !supplierArea && !settingsArea && (workspaceLoading || workspacesLoadedFor !== token) ? <p role="status">Loading workspace…</p> : <Outlet context={context} />}
        </div>}
      </div>
    </SidebarInset>
  </SidebarProvider>;
}
