import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react';
import { LayoutDashboard, Wallet, ChartNoAxesCombined, Settings2, ServerCog, CircleHelp, FolderDot, FolderOpenDot, Boxes, MessagesSquare, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams, type NavLinkProps } from 'react-router';
import { ChevronsUpDown, Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { request } from '@/features/vendors/api';
import { Button } from '@/components/ui/button';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import type { AdminSession, ConsoleContext, GatewayStatus, Health, Model, Organization, SessionChatKey, Workspace, WorkspaceProblem } from './console-context';
import { navigation } from './navigation';
import AccountMenu from './AccountMenu';
import WorkspaceSwitcher, { WorkspaceCreateDialog } from './WorkspaceSwitcher';
import WorkspaceRecovery from './WorkspaceRecovery';
import { resolveWorkspacePathSegment, workspacePathSegment } from './workspace-route';
import logo from '../../../../branding/assets/niu-mark.png';

const gatewayHealthUrl = `${import.meta.env.BASE_URL}healthz`;
const sidebarBreakpoint = 960;

function WorkspaceNav({
  context,
  activeWorkspacePath,
  models,
  activePath,
  scopeLabel,
  onCreateWorkspace,
}: {
  context: ConsoleContext;
  activeWorkspacePath: string;
  models: Model[];
  activePath: string;
  scopeLabel: string;
  onCreateWorkspace: () => void;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const navItems = navigation.filter(item => item.destination === 'Workspace'
    && (item.to !== 'costs' || context.session?.kind === 'installation'));

  return <>
    <SidebarHeader className="sidebar-heading"><WorkspaceSwitcher context={context} onCreateWorkspace={onCreateWorkspace} /></SidebarHeader>
    <SidebarContent className="workspace-sidebar-content">
      {(context.session?.operator || !context.session) && <div className="session-context"><span>{scopeLabel}</span>{context.session?.operator && <details><summary>View access scope</summary><dl><dt>Organization</dt><dd>{context.session.operator.organization_id}</dd>{context.session.operator.project_id && <><dt>Workspace</dt><dd>{context.session.operator.project_id}</dd></>}<dt>Role</dt><dd>{context.session.operator.role}</dd></dl></details>}{!context.session && <p>The gateway is available. Sign in with an installation admin token to manage it.</p>}</div>}
      <nav aria-label="Main navigation">
        <SidebarMenu className="workspace-nav-menu">
          {navItems.map(item => {
            const path = item.to === '.' ? activeWorkspacePath : `${activeWorkspacePath}/${item.to}`;
            const isActive = item.to === '.' ? activePath === '.' : activePath === item.to || activePath.startsWith(`${item.to}/`);
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

function SupplierNav({ context }: { context: ConsoleContext }) {
  const { provider } = useParams();
  const { isMobile, setOpenMobile } = useSidebar();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<{id: string; name: string}[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (context.session?.kind !== 'installation') {
      setSuppliers(context.session?.provider_memberships ?? []);
      return;
    }
    const controller = new AbortController();
    void request<{data: {id: string; name: string}[]}>(context.token, '/admin/v1/providers', 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setSuppliers(result.data); setError(''); } })
      .catch(() => { if (!controller.signal.aborted) setError('Could not load suppliers'); });
    return () => controller.abort();
  }, [context.token, context.session, search.get('supplier')]);
  const selected = provider ?? search.get('supplier') ?? suppliers[0]?.id ?? '';
  const membership = suppliers.find(item => item.id === selected);
  const suffix = selected ? '?supplier=' + encodeURIComponent(selected) : '';

  const location = useLocation();
  const entries = provider ? [
    { to: `/providers/${provider}`, label: 'Overview', end: true },
    { to: `/providers/${provider}/models`, label: 'Models & pricing', end: false },
    { to: `/providers/${provider}/consumption`, label: 'Usage', end: false },
    { to: `/providers/${provider}/settlements`, label: 'Billing', end: false },
  ] : [
    { to: '/providers', label: 'Overview', end: true },
    { to: '/providers/manage/models', label: 'Models & pricing', end: false },
    { to: '/providers/manage/consumption', label: 'Usage', end: false },
    { to: '/providers/manage/settlements', label: 'Billing', end: false },
  ];
  return <>
    <SidebarHeader className="sidebar-heading">
      <div className="workspace-switcher"><DropdownMenu>
        <DropdownMenuTrigger className="workspace-switcher-trigger" aria-label="Switch supplier" title="Switch supplier">
          <span className="workspace-switcher-copy"><strong>{membership?.name ?? 'Choose supplier'}</strong></span><ChevronsUpDown size={16} />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="workspace-switcher-menu" side="bottom" align="start" sideOffset={8} collisionPadding={12}>
          <DropdownMenuLabel className="workspace-switcher-menu-title">Suppliers</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={selected} onValueChange={id => {
            if (provider) navigate('/providers/' + encodeURIComponent(id) + (location.pathname.split('/')[3] ? '/' + location.pathname.split('/')[3] : ''));
            else setSearch(current => { current.set('supplier', id); current.delete('create'); return current; });
          }}>{suppliers.map(item => <DropdownMenuRadioItem className="workspace-switcher-item" key={item.id} value={item.id}><span>{item.name}</span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>
          {error && <div className="workspace-switcher-error" role="alert">{error}</div>}
          {context.session?.kind === 'installation' && <><DropdownMenuSeparator className="workspace-switcher-separator" /><DropdownMenuItem disabled={!selected} onSelect={() => navigate('/providers?properties=supplier&supplier=' + encodeURIComponent(selected))}><Settings2 size={16} />Supplier properties</DropdownMenuItem><DropdownMenuItem className="workspace-switcher-create" onSelect={() => navigate('/providers?create=supplier' + (selected ? '&supplier=' + encodeURIComponent(selected) : ''))}><Plus size={16} />Add supplier</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu></div>
    </SidebarHeader>
    <SidebarContent className="workspace-sidebar-content">
      <nav aria-label="Supplier navigation"><SidebarMenu className="workspace-nav-menu">
        {entries.map(item => { const Icon = item.label === 'Overview' ? LayoutDashboard : item.label === 'Models & pricing' ? Boxes : item.label === 'Billing' ? Wallet : ChartNoAxesCombined; return <SidebarMenuItem key={item.to}>
          <SidebarMenuButton asChild isActive={location.pathname === item.to} className="nav-item provider-zone-item">
            <NavLink to={item.to + (provider ? '' : suffix)} end={item.end} onClick={() => { if (isMobile) setOpenMobile(false); }}><Icon className="nav-icon" aria-hidden="true" /><span>{item.label}</span></NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>; })}
      </SidebarMenu></nav>
    </SidebarContent>
  </>;
}

function WorkspaceSidebarToggle({ buttonRef, providerArea = false, modelsArea = false }: { buttonRef: RefObject<HTMLButtonElement | null>; providerArea?: boolean; modelsArea?: boolean }) {
  const { isMobile, openMobile, state, toggleSidebar } = useSidebar();
  const expanded = isMobile ? openMobile : state === 'expanded';
  return <Button ref={buttonRef} type="button" variant="ghost" size="icon" className="sidebar-toggle" onClick={toggleSidebar} aria-expanded={expanded} aria-controls={modelsArea ? "model-filters" : providerArea ? "provider-navigation" : "workspace-navigation"} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${modelsArea ? 'model filters' : providerArea ? 'supplier navigation' : 'workspace navigation'}`} title={expanded ? 'Collapse navigation' : 'Expand navigation'}>
    {expanded ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
  </Button>;
}

function WorkspaceRailLink({ to, onActivate, children, onClick, ...props }: NavLinkProps & { onActivate?: () => void }) {
  return <NavLink to={to} {...props} onClick={event => { onActivate?.(); onClick?.(event); }}>{children}</NavLink>;
}

export default function AppLayout() {
  const [workspaceCreateOpen, setWorkspaceCreateOpen] = useState(false);
  const [token, setToken] = useState('');
  const [draftToken, setDraftToken] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [chatKeys, setChatKeys] = useState<SessionChatKey[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspacesLoadedFor, setWorkspacesLoadedFor] = useState('');
  const [workspaceLoadRevision, setWorkspaceLoadRevision] = useState(0);
  const [workspaceError, setWorkspaceError] = useState<WorkspaceProblem | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthChecked, setHealthChecked] = useState(false);
  const [error, setError] = useState('');
  const connectionRevision = useRef(0);
  const connectionController = useRef<AbortController | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { workspace: routeWorkspaceId } = useParams();
  const isGlobalChat = location.pathname === '/chat';
  const loginArea = location.pathname === '/login';

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

  useEffect(() => {
    const controller = new AbortController();
    void fetch(gatewayHealthUrl, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Gateway unavailable'); return response.json(); })
      .then((value: Health) => { if (!controller.signal.aborted) setHealth(value); })
      .catch(() => { if (!controller.signal.aborted) setHealth(null); })
      .finally(() => { if (!controller.signal.aborted) setHealthChecked(true); });
    return () => controller.abort();
  }, []);

  const authenticate = useCallback(async (credential: string) => {
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
        if (revision === connectionRevision.current) setError('The admin token was rejected or the Niu gateway is unavailable.');
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
        if (revision === connectionRevision.current) setError('The admin token was rejected or the Niu gateway is unavailable.');
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
      if (revision === connectionRevision.current) setError('The admin token was rejected or the Niu gateway is unavailable.');
    }
  }, []);

  const signOut = useCallback(() => {
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
  }, []);

  const connect = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await authenticate(draftToken);
  }, [authenticate, draftToken]);

  useEffect(() => {
    if (!import.meta.env.DEV || import.meta.env.MODE === 'test') return;
    try { if (sessionStorage.getItem('niu.signed-out') === '1') return; } catch { /* Storage is optional. */ }
    const controller = new AbortController();
    void fetch(`${import.meta.env.BASE_URL}__niu_dev_session`, {
      method: 'POST', headers: { 'x-niu-dev-session': '1' }, signal: controller.signal,
    }).then(async response => {
      if (!response.ok) return;
      const value = await response.json() as { token?: string };
      if (!controller.signal.aborted && value.token) await authenticate(value.token);
    }).catch(() => { /* Manual connection remains available without the dev launcher. */ });
    return () => controller.abort();
  }, [authenticate]);

  const refreshModels = useCallback(async () => {
    if (!token) return;
    const controller = connectionController.current;
    if (!controller || controller.signal.aborted) return;
    const revision = connectionRevision.current;
    try {
      const response = await fetch('/admin/v1/models', {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (revision !== connectionRevision.current || controller.signal.aborted) return;
      if (!response.ok) return;
      const value = await response.json() as { data: Model[] };
      if (revision === connectionRevision.current && !controller.signal.aborted) setModels(value.data);
    } catch {
      // Keep the last known route list visible during a transient gateway failure.
    }
  }, [token]);

  const refreshWorkspace = useCallback(async () => {
    const revision = connectionRevision.current;
    const controller = token ? connectionController.current : null;
    if (token && (!controller || controller.signal.aborted)) return;
    try {
      const response = await fetch(gatewayHealthUrl, controller ? { signal: controller.signal } : undefined);
      if (!response.ok) throw new Error('Health check failed');
      const value = await response.json() as Health;
      if (revision === connectionRevision.current && !controller?.signal.aborted) setHealth(value);
    } catch {
      if (revision === connectionRevision.current && !controller?.signal.aborted) setHealth(null);
    }
    if (revision === connectionRevision.current && !controller?.signal.aborted) setHealthChecked(true);
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
  }, [refreshModels, token]);

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

  const selectWorkspace = useCallback((next: Workspace) => {
    setSelectedOrganizationId(next.organization_id);
    setWorkspace(next);
    setWorkspaceError(null);
    try { window.localStorage.setItem('niu.active-workspace', next.id); } catch { /* URL remains the source of truth. */ }
    if (location.pathname === '/chat') {
      const search = new URLSearchParams(location.search);
      search.set('workspace', next.id);
      navigate({ pathname: '/chat', search: `?${search.toString()}`, hash: location.hash }, { replace: true });
      return;
    }
    const nestedPath = location.pathname.split('/').filter(Boolean).slice(2).join('/');
    const knownWorkspaces = workspaces.some(item => item.id === next.id) ? workspaces : [...workspaces, next];
    navigate({
      pathname: `/workspaces/${workspacePathSegment(next, knownWorkspaces)}${nestedPath ? `/${nestedPath}` : ''}`,
      search: location.search,
      hash: location.hash,
    }, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate, workspaces]);

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
      id: body.id,
      name: body.name,
      organization_id: body.organization_id,
      organization_name: organizations.find(item => item.id === body.organization_id)?.name ?? 'Personal workspace',
    };
    setWorkspaces(previous => [...previous, created]);
    if (!organizations.some(item => item.id === created.organization_id)) {
      setOrganizations(previous => [...previous, { id: created.organization_id, name: created.organization_name }]);
    }
    selectWorkspace(created);
    return created;
  }, [organizations, selectWorkspace, token]);

  useEffect(() => {
    if (!token || workspaceLoading || workspacesLoadedFor !== token) return;
    let preferred = routeWorkspace;
    if (isGlobalChat) {
      const requestedWorkspace = new URLSearchParams(location.search).get('workspace');
      preferred = requestedWorkspace ? resolveWorkspacePathSegment(requestedWorkspace, workspaces) : undefined;
    }
    if (!preferred && (routeWorkspaceId === 'default' || isGlobalChat)) {
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
      if (!isGlobalChat && routeWorkspaceId !== preferredSegment) {
        const nestedPath = location.pathname.split('/').filter(Boolean).slice(2).join('/');
        navigate({ pathname: `/workspaces/${preferredSegment}${nestedPath ? `/${nestedPath}` : ''}`, search: location.search, hash: location.hash }, { replace: true });
      }
    } else {
      setWorkspace(null);
      if (routeWorkspaceId && routeWorkspaceId !== 'default') setWorkspaceError({ kind: 'missing', workspace: routeWorkspaceId });
    }
  }, [location.pathname, location.search, location.hash, isGlobalChat, navigate, routeWorkspaceId, session, token, workspaceLoading, workspaces, workspacesLoadedFor, selectedOrganizationId]);

  const gatewayStatus: GatewayStatus = health?.status === 'ok'
    ? 'online'
    : healthChecked
      ? 'offline'
      : 'checking';
  const context = useMemo<ConsoleContext>(() => ({
    token,
    session,
    organizations,
    organization: organizations.find(item => item.id === (routeWorkspace?.organization_id ?? selectedOrganizationId)) ?? organizations[0] ?? null,
    selectOrganization,
    workspaces,
    workspace: isGlobalChat ? workspace : workspace?.id === routeWorkspace?.id ? workspace : null,
    workspaceLoading,
    workspaceError,
    selectWorkspace,
    createWorkspace,
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
    signOut,
    refreshModels,
    refreshWorkspace,
  }), [token, session, organizations, selectedOrganizationId, selectOrganization, workspaces, workspace, routeWorkspaceId, isGlobalChat, workspaceLoading, workspaceError, selectWorkspace, createWorkspace, chatKeys, rememberChatKey, forgetChatKey, draftToken, models, health, gatewayStatus, error, connect, signOut, refreshModels, refreshWorkspace]);
  const activePath = location.pathname.startsWith('/workspaces/')
    ? location.pathname.split('/').filter(Boolean).slice(2).join('/') || '.'
    : location.pathname.replace(/^\/+|\/+$/g, '');
  const activeNavigation = navigation.find(item => item.to.replace(/^\/+|\/+$/g, '') === activePath)
    ?? navigation.filter(item => item.destination !== 'Global' && activePath.startsWith(`${item.to}/`)).sort((a, b) => b.to.length - a.to.length)[0];
  const providerArea = location.pathname === '/providers' || location.pathname.startsWith('/providers/');
  const helpArea = location.pathname === '/help' || location.pathname.startsWith('/help/');
  const title = loginArea
    ? 'Sign in'
    : helpArea
      ? 'Documentation'
    : providerArea
      ? ({ configuration: 'Supplier properties', models: 'Models & pricing', consumption: 'Usage', settlements: 'Billing' }[location.pathname.split('/').pop() ?? ''] ?? 'Overview')
      : activePath === 'keys/new'
        ? 'New API key'
        : activePath.startsWith('keys/')
          ? 'API key'
          : activeNavigation?.label ?? 'Page not found';

  useEffect(() => {
    document.title = `${title} · Niu`;
  }, [title]);

  const sidebarViewportWidth = useRef(typeof window !== 'undefined' ? window.innerWidth : sidebarBreakpoint);
  const [phoneNavigation, setPhoneNavigation] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 580);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= sidebarBreakpoint);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const destination = activeNavigation?.destination ?? 'Workspace';
  const platform = destination === 'Administration';
  const hasSidebar = !helpArea && (providerArea || destination === 'Workspace');
  const isInstallation = session?.kind === 'installation';
  const activeWorkspacePath = !isGlobalChat && routeWorkspaceId
    ? `/workspaces/${routeWorkspaceId}`
    : workspace
      ? `/workspaces/${workspacePathSegment(workspace, workspaces)}`
      : '/workspaces/default';
  useEffect(() => {
    try { localStorage.setItem('niu.navigation.workspace-path', activeWorkspacePath); } catch { /* Storage is optional. */ }
  }, [activeWorkspacePath]);
  const scopeLabel = session?.operator?.project_id ? 'Workspace access' : session?.operator ? 'Organization access' : 'Administrator access needed';
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
  if (loginArea) return <div className="console-login-shell"><Outlet context={context} /></div>;
  return <SidebarProvider
    open={sidebarOpen}
    onOpenChange={setSidebarOpen}
    className="app-shell"
    style={{ '--sidebar-width': 'var(--context)', '--sidebar-width-icon': 'var(--context)', '--sidebar-width-mobile': 'var(--context)' } as CSSProperties}
  >
    <a className="console-skip" href="#console-content">Skip to content</a>
    <WorkspaceCreateDialog context={context} open={workspaceCreateOpen} onOpenChange={setWorkspaceCreateOpen} />
    <nav className="app-rail" aria-label="Product navigation">
      <a className="rail-logo" href={import.meta.env.BASE_URL} aria-label="niu.io home"><img src={logo} alt="" /></a>
      {(!providerArea || isInstallation) && <WorkspaceRailLink to={activeWorkspacePath} end onActivate={() => {}} className={`rail-item${destination === 'Workspace' && !providerArea ? ' selected' : ''}`} aria-label="Workspace" title="Workspace">{hasSidebar ? <FolderOpenDot size={21} /> : <FolderDot size={21} />}</WorkspaceRailLink>}
      {(!providerArea || isInstallation) && <><NavLink to="/chat" className={`rail-item${destination === 'Global' ? ' selected' : ''}`} aria-label="Chat · compare model responses" title="Chat · compare model responses"><MessagesSquare size={21} /></NavLink>
      <NavLink to={`${activeWorkspacePath}/models`} className={`rail-item${destination === 'Models' ? ' selected' : ''}`} aria-label="Models" title="Models"><Boxes size={21} /></NavLink></>}
      <div className="rail-bottom">{isInstallation || session?.provider_memberships?.length ? <NavLink to={isInstallation ? '/providers' : `/providers/${session!.provider_memberships![0].id}`} className={`rail-item${providerArea ? ' selected' : ''}`} aria-label="Suppliers" title="Suppliers"><ServerCog size={21} aria-hidden="true" /></NavLink> : null}<NavLink className={`rail-item${helpArea ? ' selected' : ''}`} to="/help/" aria-label="Documentation" title="Documentation"><CircleHelp size={21} /></NavLink><AccountMenu context={context} workspacePath={activeWorkspacePath} providerArea={providerArea}/></div>
    </nav>
    <div className="app-rail-spacer" aria-hidden="true" />
    {hasSidebar && <Sidebar
      ref={sidebarRef}
      id={providerArea ? "provider-navigation" : "workspace-navigation"}
      side="left"
      variant="sidebar"
      collapsible="offcanvas"
      className="niu-workspace-sidebar"
      mobileClassName="niu-workspace-sidebar-mobile"
      mobileStyle={{ left: 'var(--rail)', top: 0, right: 0, bottom: 0, width: 'min(var(--context), calc(100vw - var(--rail)))', height: 'auto' }}
    >
      {providerArea ? <SupplierNav context={context} /> : <WorkspaceNav context={context} activeWorkspacePath={activeWorkspacePath} models={models} activePath={activePath} scopeLabel={scopeLabel} onCreateWorkspace={() => setWorkspaceCreateOpen(true)} />}
    </Sidebar>}
    <SidebarInset className="main-panel">
      {phoneNavigation && !hasSidebar && !isGlobalChat && (destination !== 'Models' || activePath.startsWith('models/')) && <nav className="mobile-product-navigation" aria-label="Product navigation"><a href={import.meta.env.BASE_URL} aria-label="niu.io home"><img src={logo} alt="" /></a><AccountMenu context={context} workspacePath={activeWorkspacePath} providerArea={providerArea} mobile /></nav>}
      {!isGlobalChat && !helpArea && <header className="console-page-header">
        {(hasSidebar || (destination === 'Models' && !activePath.startsWith('models/'))) && <WorkspaceSidebarToggle buttonRef={toggleRef} providerArea={providerArea} modelsArea={destination === 'Models'} />}
        <div className="breadcrumbs"><span>{providerArea ? 'Suppliers' : platform ? 'Platform' : destination === 'Global' ? 'Niu' : destination === 'Organization' ? 'Organization' : 'Workspace'}</span><span className="crumb-divider" aria-hidden="true">/</span><h1 className="console-route-title">{destination === 'Models' && activePath.startsWith('models/') ? <NavLink to={`${activeWorkspacePath}/models`}>Models</NavLink> : title}</h1></div>
      </header>}
      <div className={`page-content${helpArea ? ' help-content' : ''}`} id="console-content" tabIndex={-1}>{helpArea ? <Outlet context={context} /> : gatewayStatus === 'offline' ? <section className="gateway-recovery" role="alert"><h2>Restore your gateway connection</h2><p>The console cannot reach the gateway. Restore the service before continuing.</p><p>For local development, start the stack with <code>pnpm dev</code>. For a hosted installation, ask your administrator to check the service.</p><Button onClick={() => { void refreshWorkspace(); }}>Retry connection</Button></section> : token && !providerArea && workspaceError ? <WorkspaceRecovery problem={workspaceError} onRetry={() => setWorkspaceLoadRevision(value => value + 1)} /> : token && !providerArea && (workspaceLoading || workspacesLoadedFor !== token) ? <p role="status">Loading workspace…</p> : <Outlet context={context} />}</div>
    </SidebarInset>
  </SidebarProvider>;
}
