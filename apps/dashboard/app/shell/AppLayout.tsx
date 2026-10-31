import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useParams, useRevalidator } from 'react-router';
import { Cpu as RailModels, FolderKey as RailWorkspace, TriangleAlert } from 'lucide-react';
import {
  IconBook as RailDocs,
  IconBookFilled as RailDocsFilled,
  IconChartLine as ChartNoAxesCombined,
  IconLanguage,
  IconLayoutDashboard as LayoutDashboard,
  IconListDetails,
  IconShieldLock,
  IconSparkles as RailChat,
  IconWifiOff as WifiOff,
} from '@tabler/icons-react';
import { WorkspaceShellSkeleton } from '@/components/PageSkeletons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SettingsDialog, settingsHref, SettingsNavigation } from '@/features/account/settings-shell';
import { ApiRequestError, request } from '@/lib/api-client';
import { reconcileActiveRouteLoad } from '@/lib/route-data';
import {
  clearSessionCache,
  fetchQuery,
  isAbortError,
  peekQuery,
  primeQuery,
  subscribeMutations,
  syncCacheAuthority,
  useCachedQuery,
} from '@/lib/query-cache';
import AccountMenu from './AccountMenu';
import { useBranding } from './branding';
import {
  canManagePlatform,
  type AdminSession,
  type DashboardContext,
  type GatewayStatus,
  type Model,
  type Organization,
  type SessionChatKey,
  type Workspace,
  type WorkspaceProblem,
} from './dashboard-context';
import { useLocale, type Locale } from './locale';
import { useMockPayments } from './mock-payments';
import { navigation } from './navigation';
import { usePaymentReadiness } from './payment-readiness';
import { prefetchRouteIntent, scheduleWorkspaceWarmup } from './prefetch';
import ProductRailLink from './ProductRailLink';
import { ProviderNav } from './ProviderNav';
import { resolveProvider, type ProviderIdentity } from './provider-route';
import {
  buildSessionAuthorityKey,
  buildSessionPrincipalKey,
  resetActiveSessionSnapshot,
  setActiveSessionSnapshot,
} from './router-context';
import RouterPending from './RouterPending';
import ShellHeader from './ShellHeader';
import { useAccountAppearance } from './useAccountAppearance';
import { useGatewayConnection } from './useGatewayConnection';
import WorkspaceNav from './WorkspaceNav';
import WorkspaceRecovery from './WorkspaceRecovery';
import { WorkspaceCreateDialog } from './WorkspaceSwitcher';
import { resolveWorkspacePathSegment, workspaceModelsHref, workspacePathSegment } from './workspace-route';

export { ProviderNav, ProviderNav as SupplierNav };

const sidebarBreakpoint = 960;
const EMPTY_MODELS: Model[] = [];
const EMPTY_ORGANIZATIONS: Organization[] = [];
const EMPTY_WORKSPACES: Workspace[] = [];
const EMPTY_CHAT_KEYS: SessionChatKey[] = [];

export default function AppLayout() {
  const { locale, setLocale, isZh, t } = useLocale();
  const mockPaymentsEnabled = useMockPayments();
  const { settings: branding, logo } = useBranding();
  const revalidator = useRevalidator();
  const revalidatorRef = useRef(revalidator);
  revalidatorRef.current = revalidator;
  const [workspaceCreateOpen, setWorkspaceCreateOpen] = useState(false);
  const [token, setToken] = useState('');
  const [signOutFailed, setSignOutFailed] = useState(false);
  const signOutPending = useRef(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [draftToken, setDraftToken] = useState('');
  const [rawModels, setModels] = useState<Model[]>([]);
  const [modelsLoadedFor, setModelsLoadedFor] = useState('');
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState('');
  const [rawSession, setSession] = useState<AdminSession | null>(null);
  const session = rawSession;
  const [modeSaving, setModeSaving] = useState(false);
  const [modeError, setModeError] = useState('');
  const modeRequest = useRef(false);
  const modeRevision = useRef(0);
  const principalKey = useMemo(() => buildSessionPrincipalKey(token, session), [token, session]);
  const authorityKey = useMemo(() => buildSessionAuthorityKey(token, session), [token, session]);
  const syncedAuthorityRef = useRef<string | undefined>(undefined);
  if (syncedAuthorityRef.current !== authorityKey) {
    syncedAuthorityRef.current = authorityKey;
    syncCacheAuthority(authorityKey || null);
  }

  const appearance = useAccountAppearance(
    token,
    JSON.stringify([token, session?.kind, session?.operator?.id]),
    session?.kind === 'operator',
    session?.operator?.id ?? '',
    branding.default_appearance,
  );
  const [rawChatKeys, setChatKeys] = useState<SessionChatKey[]>([]);
  const [chatKeysPrincipal, setChatKeysPrincipal] = useState('');
  const chatKeys = Boolean(principalKey && chatKeysPrincipal === principalKey) ? rawChatKeys : EMPTY_CHAT_KEYS;
  const [selectedOrgState, setSelectedOrgState] = useState<{ principalKey: string; id: string | null }>({
    principalKey: '',
    id: null,
  });
  const selectedOrganizationId =
    Boolean(principalKey && selectedOrgState.principalKey === principalKey) ? selectedOrgState.id : null;
  const setSelectedOrganizationId = useCallback(
    (id: string | null) => setSelectedOrgState({ principalKey, id }),
    [principalKey],
  );
  const [rawOrganizations, setOrganizations] = useState<Organization[]>([]);
  const [rawWorkspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [rawWorkspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspacesLoadedFor, setWorkspacesLoadedFor] = useState('');
  const [workspaceLoadRevision, setWorkspaceLoadRevision] = useState(0);
  const [workspaceError, setWorkspaceError] = useState<WorkspaceProblem | null>(null);
  const authorityWorkspacesReady = Boolean(authorityKey && workspacesLoadedFor === authorityKey);
  const organizations = authorityWorkspacesReady ? rawOrganizations : EMPTY_ORGANIZATIONS;
  const workspaces = authorityWorkspacesReady ? rawWorkspaces : EMPTY_WORKSPACES;
  const workspace = authorityWorkspacesReady ? rawWorkspace : null;
  const models = Boolean(authorityKey && modelsLoadedFor === authorityKey) ? rawModels : EMPTY_MODELS;
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
  const supplierArea =
    adminArea ||
    location.pathname === '/providers' ||
    location.pathname.startsWith('/providers/') ||
    location.pathname === '/suppliers' ||
    location.pathname.startsWith('/suppliers/');
  const supplierManagement =
    supplierArea && location.pathname !== '/providers' && location.pathname !== '/suppliers';
  const adminSupplierId =
    adminArea && canManagePlatform(session) &&
    (location.pathname.startsWith('/admin/providers/') || location.pathname.startsWith('/admin/suppliers/'))
      ? location.pathname.split('/')[3]
      : '';
  const supplierTabsRef = useRef<HTMLDivElement>(null);

  const platformManager = canManagePlatform(session);
  const {
    data: fetchedProviders,
    loading: providerQueryLoading,
    reload: reloadProviders,
  } = useCachedQuery<{ data: ProviderIdentity[] }>(
    token,
    supplierArea && session && platformManager && token ? '/api/v1/providers' : null,
    signal => request<{ data: ProviderIdentity[] }>(token, '/api/v1/providers', 'GET', undefined, signal),
    {
      enabled: Boolean(supplierArea && session && platformManager && token),
      persist: true,
      keepPreviousData: true,
    },
  );

  useEffect(() => {
    const refresh = () => reloadProviders();
    window.addEventListener('niu:supplier-profile-updated', refresh);
    window.addEventListener('niu:provider-profile-updated', refresh);
    return () => {
      window.removeEventListener('niu:supplier-profile-updated', refresh);
      window.removeEventListener('niu:provider-profile-updated', refresh);
    };
  }, [reloadProviders]);

  const authorizedProviders = useMemo<ProviderIdentity[]>(() => {
    if (!session) return [];
    if (!platformManager) return [];
    return fetchedProviders?.data ?? [];
  }, [session, platformManager, fetchedProviders]);
  const providerDirectoryLoading = Boolean(supplierArea && session && platformManager && providerQueryLoading);
  const adminSupplierName = resolveProvider(adminSupplierId, authorizedProviders)?.name ?? '';

  useEffect(() => {
    const parts = location.pathname.split('/');
    const index = parts[1] === 'admin' ? 3 : 2;
    if (parts[index - 1] !== 'providers' && parts[index - 1] !== 'suppliers') return;
    const provider = resolveProvider(decodeURIComponent(parts[index] ?? ''), authorizedProviders);
    if (!provider?.slug || parts[index] === provider.slug) return;
    parts[index] = encodeURIComponent(provider.slug);
    navigate({ pathname: parts.join('/'), search: location.search, hash: location.hash }, { replace: true });
  }, [location.pathname, location.search, location.hash, authorizedProviders, navigate]);

  const workspaceDirectoryArea = location.pathname === '/workspaces' || location.pathname === '/workspaces/';
  const usesSelectedWorkspace =
    workspaceDirectoryArea ||
    isGlobalChat ||
    location.pathname.startsWith('/activity') ||
    settingsArea ||
    supplierArea ||
    location.pathname === '/models' ||
    location.pathname.startsWith('/models/');
  const loginArea = location.pathname === '/login' || location.pathname === '/installation';
  const gateway = useGatewayConnection();
  const { health, checked: healthChecked } = gateway;

  const latestIdentityRef = useRef({ principalKey, authorityKey, location });
  latestIdentityRef.current = { principalKey, authorityKey, location };

  const rememberChatKey = useCallback(
    (key: SessionChatKey) => {
      setChatKeysPrincipal(currentPrincipal => {
        if (currentPrincipal !== principalKey) {
          setChatKeys([key]);
        } else {
          setChatKeys(current => [key, ...current.filter(item => item.id !== key.id || item.projectId !== key.projectId)]);
        }
        return principalKey;
      });
    },
    [principalKey],
  );
  const forgetChatKey = useCallback((id: string) => {
    setChatKeys(current => current.filter(item => item.id !== id));
  }, []);

  const routeWorkspace =
    routeWorkspaceId && routeWorkspaceId !== 'default'
      ? resolveWorkspacePathSegment(routeWorkspaceId, workspaces)
      : undefined;
  const requestedWorkspaceId = usesSelectedWorkspace ? new URLSearchParams(location.search).get('workspace') : null;
  const requestedWorkspace = requestedWorkspaceId
    ? resolveWorkspacePathSegment(requestedWorkspaceId, workspaces)
    : undefined;
  const isDefaultWorkspaceAlias = requestedWorkspaceId === 'default' && !requestedWorkspace;
  const isExplicitRouteWorkspace = Boolean(!usesSelectedWorkspace && routeWorkspaceId && routeWorkspaceId !== 'default');
  const isExplicitQueryWorkspace = Boolean(usesSelectedWorkspace && requestedWorkspaceId && !isDefaultWorkspaceAlias);

  // Synchronously derive preferred default workspace (reading localStorage fresh so workspace switches never see a stale memo).
  let defaultPreferredWorkspace: Workspace | null = null;
  if (token && authorityWorkspacesReady && workspaces.length > 0) {
    const operatorProjectId = session?.operator?.project_id;
    let storedId: string | null = null;
    try {
      storedId = window.localStorage.getItem('niu.active-workspace');
    } catch {
      /* Storage is optional. */
    }
    const candidates = selectedOrganizationId
      ? workspaces.filter(item => item.organization_id === selectedOrganizationId)
      : workspaces;
    defaultPreferredWorkspace =
      candidates.find(item => item.id === operatorProjectId) ??
      candidates.find(item => item.id === storedId) ??
      candidates[0] ??
      null;
  }

  // Explicit routes must not inherit a different workspace during selection effects.
  const effectiveActiveWorkspace = isExplicitRouteWorkspace
    ? routeWorkspace ?? null
    : isExplicitQueryWorkspace
      ? requestedWorkspace ?? null
      : workspace ?? defaultPreferredWorkspace;
  const selectedWorkspace = isExplicitQueryWorkspace ? requestedWorkspace ?? null : workspace ?? defaultPreferredWorkspace;
  const effectiveWorkspaceError: WorkspaceProblem | null =
    requestedWorkspaceId &&
    !isDefaultWorkspaceAlias &&
    !requestedWorkspace &&
    !workspaceLoading &&
    authorityWorkspacesReady
      ? { kind: 'missing', workspace: requestedWorkspaceId }
      : workspaceError?.kind === 'missing' && (requestedWorkspace || isDefaultWorkspaceAlias)
        ? null
        : workspaceError;

  const workspaceNavigation = useRef({ routeWorkspace, workspace: effectiveActiveWorkspace, workspaces, location });
  useLayoutEffect(() => {
    workspaceNavigation.current = { routeWorkspace, workspace: effectiveActiveWorkspace, workspaces, location };
  }, [routeWorkspace, effectiveActiveWorkspace, workspaces, location]);

  const modelOrganizationId = isExplicitRouteWorkspace
    ? routeWorkspace?.organization_id
    : isExplicitQueryWorkspace
      ? requestedWorkspace?.organization_id
      : selectedOrganizationId ??
        effectiveActiveWorkspace?.organization_id ??
        organizations[0]?.id ??
        session?.operator?.organization_id;
  const modelWorkspace = routeWorkspace ?? selectedWorkspace;
  const paymentReadiness = usePaymentReadiness(token, modelOrganizationId, authorityKey);
  const modelsHref = token ? workspaceModelsHref(modelWorkspace ?? effectiveActiveWorkspace, workspaces) : '/models/';
  const modelWorkspaceId =
    modelWorkspace && modelWorkspace.organization_id === modelOrganizationId ? modelWorkspace.id : undefined;

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
        if (revision === connectionRevision.current && !(restoring && sessionResponse.status === 401)) {
          setError('Could not sign in. Try again.');
        }
        return;
      }
      const sessionValue = (await sessionResponse.json()) as { data: AdminSession };
      if (revision !== connectionRevision.current || controller.signal.aborted) return;
      if (restoring && authenticationPath.current === '/installation') return;
      const nextEffectiveSession = sessionValue.data;
      const nextAuthorityKey = buildSessionAuthorityKey(credential, nextEffectiveSession);
      syncCacheAuthority(nextAuthorityKey || null);
      syncedAuthorityRef.current = nextAuthorityKey;
      setModels([]);
      setModelsLoadedFor('');
      setModelsError('');
      setModelsLoading(true);
      setSession(sessionValue.data);
      setToken(credential);
      try {
        sessionStorage.removeItem('niu.signed-out');
      } catch {
        /* Storage is optional. */
      }
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
          method: 'POST',
          cache: 'no-store',
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
      try {
        localStorage.setItem('niu.auth.signout', crypto.randomUUID());
      } catch {
        /* Focus revalidation remains available. */
      }
    }
    connectionController.current?.abort();
    connectionController.current = null;
    modelController.current?.abort();
    connectionRevision.current += 1;
    clearSessionCache();
    syncedAuthorityRef.current = '';
    resetActiveSessionSnapshot();
    try {
      sessionStorage.setItem('niu.signed-out', '1');
    } catch {
      /* Storage is optional. */
    }
    setToken('');
    setDraftToken('');
    setSession(null);
    setModels([]);
    setModelsLoadedFor('');
    setChatKeys([]);
    setChatKeysPrincipal('');
    setOrganizations([]);
    setWorkspaces([]);
    setWorkspace(null);
    setSelectedOrgState({ principalKey: '', id: null });
    setWorkspaceError(null);
    setWorkspaceLoading(false);
    setWorkspacesLoadedFor('');
    setError('');
    if (import.meta.env.DEV) {
      void fetch(`${import.meta.env.BASE_URL}login/session`, {
        method: 'DELETE',
        headers: { 'x-niu-dev-login': '1' },
      }).catch(() => {
        /* Dev sign-out remains local when the helper is unavailable. */
      });
    }
  }, [token, session]);

  const connect = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await authenticate(draftToken);
    },
    [authenticate, draftToken],
  );

  useEffect(() => {
    if (token || health?.status !== 'ok') return;
    try {
      if (sessionStorage.getItem('niu.signed-out') === '1') {
        setSessionChecked(true);
        return;
      }
    } catch {
      /* Storage is optional. */
    }
    if (location.pathname === '/installation') {
      setSessionChecked(true);
      return;
    }
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
      .catch(() => {
        /* The login page handles unavailable authentication. */
      })
      .finally(() => {
        if (!controller.signal.aborted) setSessionChecked(true);
      });
    return () => controller.abort();
  }, [authenticate, token, health?.status, location.pathname]);

  const modelsQueryPath = useMemo(() => {
    if (!modelOrganizationId) return '';
    return (
      '/api/v1/models?organization_id=' +
      encodeURIComponent(modelOrganizationId) +
      (modelWorkspaceId ? '&project_id=' + encodeURIComponent(modelWorkspaceId) : '')
    );
  }, [modelOrganizationId, modelWorkspaceId]);

  const refreshModels = useCallback(async (force = false) => {
    if (!token || !authorityKey || !modelsQueryPath) return;
    const connection = connectionController.current;
    if (!connection || connection.signal.aborted) return;
    modelController.current?.abort();
    const controller = new AbortController();
    modelController.current = controller;
    const targetAuthority = authorityKey;
    const cached = peekQuery<{ data: Model[] }>(token, modelsQueryPath, { persist: true })?.data;
    if (Array.isArray(cached)) {
      setModels(cached);
      setModelsLoadedFor(targetAuthority);
      setModelsLoading(false);
    } else {
      setModelsLoading(true);
    }
    setModelsError('');
    const revision = connectionRevision.current;
    try {
      const value = await fetchQuery<{ data: Model[] }>(
        token,
        modelsQueryPath,
        async signal => {
          const response = await fetch(modelsQueryPath, {
            headers: { authorization: `Bearer ${token}` },
            signal,
          });
          if (!response.ok) throw new Error('Could not load the model catalog.');
          const parsed = (await response.json()) as { data: Model[] };
          if (!Array.isArray(parsed.data)) throw new Error('Invalid model catalog response.');
          return parsed;
        },
        {
          persist: true,
          force,
          awaitRevalidate: true,
          signal: AbortSignal.any([connection.signal, controller.signal]),
        },
      );
      if (
        revision === connectionRevision.current &&
        !controller.signal.aborted &&
        modelController.current === controller &&
        latestIdentityRef.current.authorityKey === targetAuthority
      ) {
        setModels(value.data);
        setModelsLoadedFor(targetAuthority);
      }
    } catch (reason) {
      if (
        !isAbortError(reason) &&
        revision === connectionRevision.current &&
        !controller.signal.aborted &&
        modelController.current === controller &&
        latestIdentityRef.current.authorityKey === targetAuthority
      ) {
        setModelsError('Could not load the model catalog.');
      }
    } finally {
      if (
        revision === connectionRevision.current &&
        !controller.signal.aborted &&
        modelController.current === controller &&
        latestIdentityRef.current.authorityKey === targetAuthority
      ) {
        setModelsLoading(false);
      }
    }
  }, [token, authorityKey, modelsQueryPath]);

  useEffect(() => {
    setModelsError('');
    if (!token || !authorityKey || !modelsQueryPath) {
      setModels([]);
      setModelsLoadedFor('');
      setModelsLoading(Boolean(token));
      return;
    }
    const cached = peekQuery<{ data: Model[] }>(token, modelsQueryPath, { persist: true })?.data;
    if (Array.isArray(cached)) {
      setModels(cached);
      setModelsLoadedFor(authorityKey);
      setModelsLoading(false);
    } else {
      // Customer selling prices are workspace-specific; clear when switching to an uncached workspace scope.
      setModels([]);
      setModelsLoadedFor('');
      setModelsLoading(true);
    }
    void refreshModels(false);
    return () => modelController.current?.abort();
  }, [token, authorityKey, modelsQueryPath, refreshModels]);

  const refreshWorkspace = useCallback(async () => {
    if (modeRequest.current) return;
    const currentModeRevision = modeRevision.current;
    const revision = connectionRevision.current;
    const controller = token ? connectionController.current : null;
    if (token && (!controller || controller.signal.aborted)) return;
    if (!(await gateway.check())) return;
    let authorityChanged = false;
    if (token && controller && revision === connectionRevision.current && !controller.signal.aborted) {
      try {
        const response = await fetch('/api/v1/session', {
          headers: { authorization: 'Bearer ' + token },
          signal: controller.signal,
        });
        if (revision !== connectionRevision.current || controller.signal.aborted || currentModeRevision !== modeRevision.current) return;
        if (response.status === 401) {
          controller.abort();
          if (connectionController.current === controller) connectionController.current = null;
          modelController.current?.abort();
          connectionRevision.current += 1;
          clearSessionCache();
          syncedAuthorityRef.current = '';
          resetActiveSessionSnapshot();
          setToken('');
          setDraftToken('');
          setModels([]);
          setModelsLoadedFor('');
          setChatKeys([]);
          setChatKeysPrincipal('');
          setOrganizations([]);
          setWorkspaces([]);
          setWorkspace(null);
          setSelectedOrgState({ principalKey: '', id: null });
          setWorkspacesLoadedFor('');
          setWorkspaceError(null);
          setWorkspaceLoading(false);
          setSession(null);
          setError('Your session has expired or been revoked. Sign in again.');
          return;
        }
        if (response.ok) {
          const currentSession = ((await response.json()) as { data: AdminSession }).data;
          if (revision !== connectionRevision.current || controller.signal.aborted || currentModeRevision !== modeRevision.current) return;
          const nextEffectiveSession = currentSession;
          const nextPrincipalKey = buildSessionPrincipalKey(token, nextEffectiveSession);
          const nextAuthorityKey = buildSessionAuthorityKey(token, nextEffectiveSession);
          const prev = latestIdentityRef.current;
          const principalChanged = Boolean(prev.principalKey && prev.principalKey !== nextPrincipalKey);
          authorityChanged = Boolean(prev.authorityKey && prev.authorityKey !== nextAuthorityKey);

          if (authorityChanged) {
            modelController.current?.abort();
            syncCacheAuthority(nextAuthorityKey || null);
            syncedAuthorityRef.current = nextAuthorityKey;
            setWorkspacesLoadedFor('');
            setOrganizations([]);
            setWorkspaces([]);
            setWorkspace(null);
            setWorkspaceError(null);
            setWorkspaceLoading(true);
            setModels([]);
            setModelsLoadedFor('');
            setModelsLoading(true);
            setModelsError('');
          }

          if (principalChanged) {
            setChatKeys([]);
            setChatKeysPrincipal(nextPrincipalKey);
            setSelectedOrgState({ principalKey: nextPrincipalKey, id: null });
            try {
              window.localStorage.removeItem('niu.active-workspace');
              window.localStorage.removeItem('niu.navigation.workspace-path');
            } catch {
              /* Storage is optional. */
            }
            const curLoc = prev.location;
            if (curLoc.pathname.startsWith('/workspaces/')) {
              const parts = curLoc.pathname.split('/').filter(Boolean);
              if (parts[1] && parts[1] !== 'default') {
                const currentSection = parts.slice(2).join('/');
                const keyDetail = currentSection.startsWith('keys/') && currentSection !== 'keys/new';
                const nestedPath = keyDetail ? 'keys' : currentSection;
                const nextSearch = new URLSearchParams(curLoc.search);
                nextSearch.delete('keyId');
                nextSearch.delete('workspace');
                navigate(
                  {
                    pathname: `/workspaces/default${nestedPath ? `/${nestedPath}` : ''}`,
                    search: nextSearch.toString() ? `?${nextSearch.toString()}` : '',
                    hash: '',
                  },
                  { replace: true },
                );
              }
            } else if (curLoc.search.includes('workspace=')) {
              const nextSearch = new URLSearchParams(curLoc.search);
              if (nextSearch.has('workspace')) {
                nextSearch.delete('workspace');
                navigate(
                  {
                    pathname: curLoc.pathname,
                    search: nextSearch.toString() ? `?${nextSearch.toString()}` : '',
                    hash: '',
                  },
                  { replace: true },
                );
              }
            }
          }

          setSession(currentSession);
        }
      } catch {
        // Preserve the last verified identity during a transient network failure.
      }
    }
    if (!authorityChanged && revision === connectionRevision.current && token && controller && !controller.signal.aborted) {
      await refreshModels(true);
    }
  }, [refreshModels, token, gateway.check, navigate]);

  useEffect(() => {
    if (!token) return;
    let pending = false;
    const revalidate = () => {
      if (document.visibilityState === 'hidden' || pending) return;
      pending = true;
      void refreshWorkspace().finally(() => {
        pending = false;
      });
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
      modelController.current?.abort();
      connectionRevision.current += 1;
      clearSessionCache();
      syncedAuthorityRef.current = '';
      resetActiveSessionSnapshot();
      try {
        sessionStorage.setItem('niu.signed-out', '1');
      } catch {
        /* Storage is optional. */
      }
      setToken('');
      setDraftToken('');
      setSession(null);
      setModels([]);
      setModelsLoadedFor('');
      setChatKeys([]);
      setChatKeysPrincipal('');
      setOrganizations([]);
      setWorkspaces([]);
      setWorkspace(null);
      setSelectedOrgState({ principalKey: '', id: null });
      setWorkspacesLoadedFor('');
      setWorkspaceError(null);
      setWorkspaceLoading(false);
    };
    window.addEventListener('storage', signedOutElsewhere);
    return () => window.removeEventListener('storage', signedOutElsewhere);
  }, [token]);

  useEffect(() => {
    if (!token || !authorityKey) {
      setWorkspacesLoadedFor('');
      setOrganizations([]);
      setWorkspaces([]);
      setWorkspace(null);
      setWorkspaceLoading(false);
      setWorkspaceError(null);
      return;
    }
    const targetAuthority = authorityKey;
    const controller = new AbortController();
    const cachedOrgs = peekQuery<{ data: Organization[] }>(token, '/api/v1/organizations', { persist: true })?.data;
    const cachedWorkspaces = peekQuery<{ data: Workspace[] }>(token, '/api/v1/workspaces', { persist: true })?.data;
    if (Array.isArray(cachedOrgs) && Array.isArray(cachedWorkspaces)) {
      setOrganizations(cachedOrgs);
      setWorkspaces(cachedWorkspaces);
      setWorkspacesLoadedFor(targetAuthority);
      setWorkspaceLoading(false);
    } else {
      setWorkspacesLoadedFor('');
      setOrganizations([]);
      setWorkspaces([]);
      setWorkspace(null);
      setWorkspaceLoading(true);
    }
    setWorkspaceError(null);
    const force = workspaceLoadRevision > 0;
    const loadEndpoint = async <T,>(endpoint: string): Promise<{ data: T[] }> => {
      try {
        return await fetchQuery<{ data: T[] }>(
          token,
          endpoint,
          async signal => {
            const response = await fetch(endpoint, {
              headers: { authorization: `Bearer ${token}` },
              signal,
            });
            if (!response.ok) {
              throw new ApiRequestError(`Request failed (${response.status})`, response.status);
            }
            return (await response.json()) as { data: T[] };
          },
          { persist: true, force, awaitRevalidate: true, signal: controller.signal },
        );
      } catch (reason) {
        if (reason instanceof ApiRequestError) {
          throw Object.assign(new Error(reason.message), { endpoint, status: reason.status });
        }
        throw reason;
      }
    };
    void Promise.all([
      loadEndpoint<Organization>('/api/v1/organizations'),
      loadEndpoint<Workspace>('/api/v1/workspaces'),
    ])
      .then(([organizationData, workspaceData]) => {
        if (controller.signal.aborted || latestIdentityRef.current.authorityKey !== targetAuthority) return;
        setOrganizations(organizationData.data);
        setWorkspaces(workspaceData.data);
        setWorkspacesLoadedFor(targetAuthority);
      })
      .catch(reason => {
        if (
          controller.signal.aborted ||
          isAbortError(reason) ||
          latestIdentityRef.current.authorityKey !== targetAuthority
        ) {
          return;
        }
        if (reason && typeof reason === 'object' && 'endpoint' in reason && 'status' in reason) {
          setWorkspaceError({
            kind: 'api',
            endpoint: String((reason as { endpoint: string }).endpoint),
            status: Number((reason as { status: number }).status),
          });
        } else {
          setWorkspaceError({ kind: 'network' });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && latestIdentityRef.current.authorityKey === targetAuthority) {
          setWorkspaceLoading(false);
        }
      });
    return () => controller.abort();
  }, [token, authorityKey, workspaceLoadRevision]);

  const reloadWorkspaces = useCallback(() => setWorkspaceLoadRevision(value => value + 1), []);

  const previousHealth = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (health?.status === 'ok' && previousHealth.current === 'offline') {
      if (workspaceError && workspaceError.kind !== 'missing') setWorkspaceLoadRevision(value => value + 1);
      void refreshWorkspace();
    }
    previousHealth.current = health?.status === 'ok' ? 'online' : healthChecked ? 'offline' : undefined;
  }, [health?.status, healthChecked, refreshWorkspace, workspaceError]);

  const selectWorkspace = useCallback(
    (next: Workspace) => {
      if (!usesSelectedWorkspace && next.id === routeWorkspace?.id) return;
      setSelectedOrganizationId(next.organization_id);
      setWorkspace(next);
      setWorkspaceError(null);
      try {
        window.localStorage.setItem('niu.active-workspace', next.id);
      } catch {
        /* URL remains the source of truth. */
      }
      const knownWorkspaces = workspaces.some(item => item.id === next.id) ? workspaces : [...workspaces, next];
      if (usesSelectedWorkspace && !settingsArea && !workspaceDirectoryArea) {
        const search = new URLSearchParams(location.search);
        search.set('workspace', workspacePathSegment(next, knownWorkspaces));
        navigate(
          { pathname: location.pathname, search: `?${search.toString()}`, hash: location.hash },
          { replace: true },
        );
        return;
      }
      const currentSection = location.pathname.startsWith('/workspaces/')
        ? location.pathname.split('/').filter(Boolean).slice(2).join('/')
        : '';
      const keyDetail = currentSection.startsWith('keys/') && currentSection !== 'keys/new';
      const nestedPath = keyDetail ? 'keys' : currentSection;
      const nextSearch = new URLSearchParams(location.search);
      nextSearch.delete('keyId');
      navigate(
        {
          pathname: `/workspaces/${workspacePathSegment(next, knownWorkspaces)}${nestedPath ? `/${nestedPath}` : ''}`,
          search: nextSearch.toString() ? `?${nextSearch}` : '',
          hash: keyDetail || location.hash.startsWith('#gateway-attempt-') ? '' : location.hash,
        },
        { replace: true },
      );
    },
    [
      location.pathname,
      location.search,
      location.hash,
      navigate,
      workspaces,
      usesSelectedWorkspace,
      settingsArea,
      workspaceDirectoryArea,
      routeWorkspace?.id,
    ],
  );

  const selectOrganization = useCallback(
    (next: Organization) => {
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
    },
    [organizations, workspaces, selectWorkspace, navigate],
  );

  const createWorkspace = useCallback(
    async (
      name: string,
      organizationId?: string,
      slug?: string,
      spendingLimit?: { currency: string; limit_nanos: string },
    ) => {
      if (!token) throw new Error('Sign in before creating a workspace.');
      const response = await fetch('/api/v1/workspaces', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          spending_limit: spendingLimit,
          organization_id: organizationId || null,
        }),
      });
      const body = (await response.json().catch(() => null)) as (Workspace & { error?: { message?: string } }) | null;
      if (!response.ok || !body) {
        throw new Error(body?.error?.message ?? `Could not create workspace (${response.status}).`);
      }
      const created: Workspace = {
        ...body,
        id: body.id,
        name: body.name,
        organization_id: body.organization_id,
        organization_name:
          body.organization_name ??
          organizations.find(item => item.id === body.organization_id)?.name ??
          'Personal workspace',
      };
      setWorkspaces(previous => {
        const next = [...previous, created];
        primeQuery(token, '/api/v1/workspaces', { data: next }, { persist: true });
        return next;
      });
      if (!organizations.some(item => item.id === created.organization_id)) {
        setOrganizations(previous => {
          const next = [...previous, { id: created.organization_id, name: created.organization_name }];
          primeQuery(token, '/api/v1/organizations', { data: next }, { persist: true });
          return next;
        });
      }
      selectWorkspace(created);
      return created;
    },
    [organizations, selectWorkspace, token],
  );

  const renameWorkspace = useCallback(
    async (target: Workspace, name: string) => {
      const revision = connectionRevision.current;
      const result = await request<{ id: string; name: string }>(
        token,
        `/api/v1/organizations/${target.organization_id}/projects/${target.id}`,
        'PATCH',
        { name: name.trim() },
      );
      if (result.id !== target.id || typeof result.name !== 'string' || !result.name.trim()) {
        throw new Error('Could not confirm the workspace name. Reload before retrying.');
      }
      const renamed = { ...target, name: result.name };
      if (revision !== connectionRevision.current) return renamed;
      const current = workspaceNavigation.current;
      const updated = current.workspaces.map(item => (item.id === target.id ? renamed : item));
      primeQuery(token, '/api/v1/workspaces', { data: updated }, { persist: true });
      setWorkspaces(previous => previous.map(item => (item.id === target.id ? renamed : item)));
      setWorkspace(prev => (prev?.id === target.id ? renamed : prev));
      setWorkspaceError(null);
      if (current.routeWorkspace?.id === target.id) {
        const nested = current.location.pathname.split('/').filter(Boolean).slice(2).join('/');
        navigate(
          {
            pathname: `/workspaces/${workspacePathSegment(renamed, updated)}${nested ? '/' + nested : ''}`,
            search: current.location.search,
            hash: current.location.hash,
          },
          { replace: true },
        );
      }
      return renamed;
    },
    [token, navigate],
  );

  const deleteWorkspace = useCallback(
    async (target: Workspace) => {
      const revision = connectionRevision.current;
      await request(token, `/api/v1/organizations/${target.organization_id}/projects/${target.id}`, 'DELETE');
      if (revision !== connectionRevision.current) return;
      const current = workspaceNavigation.current;
      const remaining = current.workspaces.filter(item => item.id !== target.id);
      primeQuery(token, '/api/v1/workspaces', { data: remaining }, { persist: true });
      setWorkspaces(previous => previous.filter(item => item.id !== target.id));
      setChatKeys(prev => prev.filter(item => item.projectId !== target.id));
      if (current.routeWorkspace?.id === target.id || current.workspace?.id === target.id) {
        const next = remaining.find(item => item.organization_id === target.organization_id) ?? null;
        setWorkspace(next);
        setWorkspaceError(null);
        try {
          if (next) window.localStorage.setItem('niu.active-workspace', next.id);
          else window.localStorage.removeItem('niu.active-workspace');
        } catch {
          /* Navigation remains available without cache. */
        }
        navigate(next ? `/workspaces/${workspacePathSegment(next, remaining)}` : '/workspaces/default/', {
          replace: true,
        });
      }
    },
    [token, navigate],
  );

  useEffect(() => {
    if (!token || workspaceLoading || !authorityWorkspacesReady) return;
    let preferred = routeWorkspace;
    if (usesSelectedWorkspace) {
      const requested = new URLSearchParams(location.search).get('workspace');
      preferred = requested ? resolveWorkspacePathSegment(requested, workspaces) : undefined;
    }
    if (
      !preferred &&
      (routeWorkspaceId === 'default' ||
        (usesSelectedWorkspace && (!requestedWorkspaceId || requestedWorkspaceId === 'default')))
    ) {
      const operatorProjectId = session?.operator?.project_id;
      let storedId: string | null = null;
      try {
        storedId = window.localStorage.getItem('niu.active-workspace');
      } catch {
        /* Storage is optional. */
      }
      const candidates = selectedOrganizationId
        ? workspaces.filter(item => item.organization_id === selectedOrganizationId)
        : workspaces;
      preferred =
        candidates.find(item => item.id === operatorProjectId) ??
        candidates.find(item => item.id === storedId) ??
        candidates[0];
    }
    if (preferred) {
      setWorkspace(preferred);
      setWorkspaceError(null);
      try {
        window.localStorage.setItem('niu.active-workspace', preferred.id);
      } catch {
        /* Route remains the source of truth. */
      }
      const preferredSegment = workspacePathSegment(preferred, workspaces);
      if (!usesSelectedWorkspace && routeWorkspaceId !== preferredSegment) {
        const nestedPath = location.pathname.split('/').filter(Boolean).slice(2).join('/');
        navigate(
          {
            pathname: `/workspaces/${preferredSegment}${nestedPath ? `/${nestedPath}` : ''}`,
            search: location.search,
            hash: location.hash,
          },
          { replace: true },
        );
      } else if (usesSelectedWorkspace && requestedWorkspaceId && requestedWorkspaceId !== preferredSegment) {
        const search = new URLSearchParams(location.search);
        search.set('workspace', preferredSegment);
        navigate({ pathname: location.pathname, search: `?${search.toString()}`, hash: location.hash }, { replace: true });
      }
    } else {
      setWorkspace(null);
      if ((requestedWorkspaceId && requestedWorkspaceId !== 'default') || (routeWorkspaceId && routeWorkspaceId !== 'default')) {
        setWorkspaceError({ kind: 'missing', workspace: requestedWorkspaceId || routeWorkspaceId! });
      }
    }
  }, [
    location.pathname,
    location.search,
    location.hash,
    usesSelectedWorkspace,
    requestedWorkspaceId,
    navigate,
    routeWorkspaceId,
    routeWorkspace,
    selectedOrganizationId,
    session?.operator?.project_id,
    token,
    workspaceLoading,
    workspaces,
    authorityWorkspacesReady,
  ]);

  const activeContextWorkspace = usesSelectedWorkspace
    ? selectedWorkspace
    : routeWorkspaceId === 'default'
      ? effectiveActiveWorkspace
      : effectiveActiveWorkspace?.id === routeWorkspace?.id
        ? effectiveActiveWorkspace
        : routeWorkspace ?? null;

  // Synchronously publish the verified session/authority snapshot so React Router v8 Data Mode loaders always read current context.
  setActiveSessionSnapshot({
    token,
    principalKey,
    authorityKey,
    session,
    organizations,
    workspaces,
    activeWorkspace: activeContextWorkspace ?? effectiveActiveWorkspace,
  });

  useEffect(() => {
    reconcileActiveRouteLoad(location.pathname, authorityKey);
  }, [location.pathname, authorityKey]);

  useEffect(() => {
    return subscribeMutations(() => {
      if (revalidatorRef.current.state === 'idle') {
        void revalidatorRef.current.revalidate();
      }
    });
  }, []);

  // Schedule idle warmup once authenticated and payment readiness is verified.
  useEffect(() => {
    if (!token || !authorityKey || paymentReadiness.status !== 'ready') return;
    return scheduleWorkspaceWarmup({
      token,
      principalKey,
      authorityKey,
      session,
      organizations,
      workspaces,
      activeWorkspace: activeContextWorkspace ?? effectiveActiveWorkspace,
    });
  }, [
    token,
    principalKey,
    authorityKey,
    session,
    organizations,
    workspaces,
    activeContextWorkspace,
    effectiveActiveWorkspace,
    paymentReadiness.status,
  ]);

  const gatewayStatus: GatewayStatus =
    health?.status === 'ok' ? 'online' : healthChecked ? 'offline' : 'checking';

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

  const profileConnectionRevision = connectionRevision.current;
  const setAccountRole = useCallback(async (role: 'user' | 'admin') => {
    if (modeRequest.current) return false;
    modeRequest.current = true;
    modeRevision.current += 1;
    setModeSaving(true);
    setModeError('');
    const revision = connectionRevision.current;
    try {
      const response = await fetch('/api/v1/session/role', {
        method: 'PUT',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (revision !== connectionRevision.current) return false;
      if (response.status === 403) {
        const identity = await fetch('/api/v1/session', { headers: { authorization: 'Bearer ' + token } });
        if (identity.ok) {
          const current = ((await identity.json()) as { data: AdminSession }).data;
          if (revision === connectionRevision.current) setSession(current);
        }
        if (revision === connectionRevision.current) setModeError(t('This role is unavailable for your session. Contact your installation administrator.', '当前会话无法切换到该角色，请联系实例管理员。'));
        return false;
      }
      if (!response.ok) throw new Error('mode');
      const next = ((await response.json()) as { data: AdminSession }).data;
      if (revision !== connectionRevision.current) return false;
      setSession(next);
      if (role === 'admin') navigate('/admin/providers');
      else if (/^\/(admin|providers|suppliers)(\/|$)/.test(location.pathname)) {
        const current = workspaceNavigation.current;
        navigate(current.workspace ? `/workspaces/${workspacePathSegment(current.workspace, current.workspaces)}` : '/workspaces/default', { replace: true });
      }
      return true;
    } catch {
      if (revision === connectionRevision.current) setModeError(t('Could not switch role. Try again.', '切换角色失败，请重试。'));
      return false;
    } finally {
      modeRequest.current = false;
      setModeSaving(false);
    }
  }, [token, location.pathname, navigate, t]);

  const context = useMemo<DashboardContext>(
    () => ({
      appearance,
      sessionChecked,
      token,
      session,
      roleSwitch: { available: session?.roles?.switchable ? session.roles.available : [], active: session?.roles?.active ?? (canManagePlatform(session) ? 'admin' : 'user'), saving: modeSaving, error: modeError, setRole: setAccountRole },
      updateProfile: profile => {
        if (connectionRevision.current !== profileConnectionRevision) return;
        setSession(current =>
          current?.kind === 'operator' &&
          current.operator?.id === session?.operator?.id &&
          (!current.profile || profile.revision >= current.profile.revision)
            ? { ...current, profile }
            : current,
        );
      },
      providerDirectory: authorizedProviders,
      providerDirectoryLoading,
      organizations,
      organization:
        organizations.find(item => item.id === (routeWorkspace?.organization_id ?? selectedOrganizationId)) ??
        organizations[0] ??
        null,
      selectOrganization,
      workspaces,
      workspace: activeContextWorkspace,
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
    }),
    [
      authorizedProviders,
      providerDirectoryLoading,
      appearance,
      sessionChecked,
      token,
      session,
      modeSaving,
      modeError,
      setAccountRole,
      profileConnectionRevision,
      organizations,
      routeWorkspace?.organization_id,
      selectedOrganizationId,
      selectOrganization,
      workspaces,
      activeContextWorkspace,
      effectiveWorkspaceError,
      workspaceLoading,
      reloadWorkspaces,
      selectWorkspace,
      createWorkspace,
      renameWorkspace,
      deleteWorkspace,
      chatKeys,
      rememberChatKey,
      forgetChatKey,
      draftToken,
      models,
      modelsLoading,
      modelsError,
      health,
      gatewayStatus,
      error,
      connect,
      authenticate,
      signOut,
      refreshModels,
      refreshWorkspace,
    ],
  );

  const activePath = location.pathname.startsWith('/workspaces/')
    ? location.pathname.split('/').filter(Boolean).slice(2).join('/') || '.'
    : location.pathname.replace(/^\/+|\/+$/g, '');
  const scopedNavigation = navigation.filter(item =>
    location.pathname.startsWith('/workspaces/')
      ? item.destination === 'Workspace' || item.destination === 'Organization'
      : item.destination !== 'Workspace',
  );
  const activeNavigation =
    scopedNavigation.find(item => item.to.replace(/^\/+|\/+$/g, '') === activePath) ??
    scopedNavigation
      .filter(item => activePath.startsWith(`${item.to.replace(/^\/+|\/+$/g, '')}/`))
      .sort((a, b) => b.to.length - a.to.length)[0];
  const helpArea = location.pathname === '/help' || location.pathname.startsWith('/help/');
  const guardrailTitles: Record<string, string> = isZh
    ? {
        policy: '策略',
        input: '输入规则',
        output: '输出规则',
        access: '模型访问',
        detectors: '外部检测',
        history: '变更历史',
        denials: '拦截记录',
      }
    : {
        policy: 'Policy',
        input: 'Input rules',
        output: 'Output rules',
        access: 'Model access',
        detectors: 'External checks',
        history: 'History',
        denials: 'Blocked requests',
      };
  const isGuardrailEditor = ['guardrails/input', 'guardrails/output', 'guardrails/access', 'guardrails/detectors'].includes(
    activePath,
  );
  const title = location.pathname === '/connect'
    ? t('Connect your agent', '连接你的 Agent')
    : workspaceDirectoryArea
    ? t('Workspaces', '工作空间')
    : settingsArea
      ? ({
          account: t('Account', '账户'),
          appearance: t('Appearance', '外观'),
          billing: t('Credits', '额度与充值'),
          payments: t('Credits', '额度与充值'),
          about: t('About', '关于'),
        }[location.pathname.split('/')[2] ?? 'account'] ?? t('Settings', '设置'))
      : loginArea
        ? location.pathname === '/installation'
          ? t('Installation administration', '实例管理')
          : t('Sign in', '登录')
        : helpArea
          ? t('Docs', '文档')
          : supplierArea
            ? ({
                customers: t('Customers', '客户管理'),
                reports: t('Financial reports', '财务报表'),
                balances: t('Account balances', '账户余额'),
                oauth: t('OAuth providers', 'OAuth 服务商'),
                payments: t('Payment gateways', '支付网关'),
                pricing: t('Pricing', '定价配置'),
                branding: t('Branding', '品牌定制'),
                audit: t('Audit logs', '审计日志'),
                pools: t('Model pools', '模型池'),
                overview: t('Overview', '概览'),
                keys: t('API keys', 'API 密钥'),
                models: t('Models', '模型'),
                usage: t('Usage', '调用量'),
                settlements: t('Settlements', '结算账单'),
                members: t('Members', '成员管理'),
                settings: t('Settings', '设置'),
              }[location.pathname.split('/').pop() ?? ''] ??
              (location.pathname === '/admin/providers' || location.pathname === '/admin/suppliers'
                ? t('Providers', '模型供应商')
                : supplierManagement
                  ? t('Overview', '概览')
                  : t('Providers', '模型供应商')))
            : activePath === 'keys/new'
              ? t('New API key', '新建 API 密钥')
              : activePath.startsWith('keys/')
                ? t('API key', 'API 密钥')
                : activePath.startsWith('guardrails/')
                  ? guardrailTitles[activePath.split('/')[1]] ?? t('Guardrails', '安全护栏')
                  : activeNavigation
                    ? isZh
                      ? activeNavigation.labelZh
                      : activeNavigation.label
                    : t('Page not found', '页面未找到');

  useEffect(() => {
    document.title = `${title} · ${branding.display_name}`;
  }, [title, branding.display_name]);

  const sidebarViewportWidth = useRef(typeof window !== 'undefined' ? window.innerWidth : sidebarBreakpoint);
  const [phoneNavigation, setPhoneNavigation] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 580,
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= sidebarBreakpoint,
  );
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const destination = activeNavigation?.destination ?? 'Workspace';
  const platform = destination === 'Administration';
  const activityArea = location.pathname === '/activity' || location.pathname.startsWith('/activity/');
  const isInstallation = canManagePlatform(session);
  const hasSidebar =
    !helpArea &&
    (!adminArea || isInstallation) &&
    !settingsArea &&
    (activityArea || supplierManagement || destination === 'Workspace');
  const setupBlocked = Boolean(
    token && !supplierArea && !settingsArea && !helpArea && paymentReadiness.status !== 'ready',
  );
  const modelFiltersAvailable =
    destination === 'Models' &&
    !activePath.startsWith('models/') &&
    !setupBlocked &&
    !workspaceLoading &&
    authorityWorkspacesReady &&
    !effectiveWorkspaceError &&
    (models.length > 0 || (!modelsLoading && !modelsError));
  const showWorkspaceAreas = !supplierArea || isInstallation || Boolean(session?.operator);
  const activeWorkspacePath =
    !isGlobalChat && routeWorkspaceId
      ? `/workspaces/${routeWorkspaceId}`
      : effectiveActiveWorkspace
        ? `/workspaces/${workspacePathSegment(effectiveActiveWorkspace, workspaces)}`
        : '/workspaces/default';

  useEffect(() => {
    try {
      localStorage.setItem('niu.navigation.workspace-path', activeWorkspacePath);
    } catch {
      /* Storage is optional. */
    }
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

  const signOutFailure = signOutFailed && (
    <Dialog open onOpenChange={setSignOutFailed}>
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
          <Button onClick={() => void signOut()}>{t('Try again', '重试')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const gatewayOutage = !helpArea && gatewayStatus === 'offline' && (
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
          <Button disabled={gateway.checking} onClick={() => void gateway.check()}>
            {gateway.checking ? t('Checking…', '正在检查…') : t('Try again', '重试')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (!loginArea && !helpArea && !token) {
    return (
      <>
        {gatewayOutage}
        {signOutFailure}
        <RouterPending />
      </>
    );
  }
  if (location.pathname === '/connect' && token) return <Outlet context={context} />;
  if (loginArea) return <div className="dashboard-login-shell"><Outlet context={context} /></div>;

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="app-shell"
      style={
        {
          '--sidebar-width': 'var(--context)',
          '--sidebar-width-icon': 'var(--context)',
          '--sidebar-width-mobile': 'var(--context)',
        } as CSSProperties
      }
    >
      <a className="dashboard-skip" href="#dashboard-content">
        {t('Skip to content', '跳转到主内容')}
      </a>
      {!settingsArea &&
        ['account', 'appearance', 'billing', 'payments', 'about'].includes(
          new URLSearchParams(location.search).get('settings') ?? '',
        ) && (
          <SettingsDialog
            context={context}
            section={new URLSearchParams(location.search).get('settings') ?? undefined}
            href={section => settingsHref(location.pathname, location.search, location.hash, section)}
            onClose={() => {
              const query = new URLSearchParams(location.search);
              query.delete('settings');
              navigate(location.pathname + (query.size ? '?' + query.toString() : '') + location.hash, {
                replace: true,
              });
            }}
          />
        )}
      <WorkspaceCreateDialog
        context={context}
        open={workspaceCreateOpen && paymentReadiness.status === 'ready'}
        onOpenChange={setWorkspaceCreateOpen}
      />
      <nav className="app-rail" aria-label="Product navigation">
        <a className="rail-logo" href={import.meta.env.BASE_URL} aria-label={`${branding.display_name} home`}>
          <img src={logo} alt="" />
        </a>
        {showWorkspaceAreas && (
          <Tooltip delayDuration={250}>
            <TooltipTrigger asChild>
              <ProductRailLink
                to={activeWorkspacePath}
                end
                className={`rail-item${
                  destination === 'Workspace' && location.pathname.startsWith('/workspaces/') && !supplierArea
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
                  to="/generations"
                  className={`rail-item${activePath === 'generations' ? ' selected' : ''}`}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rail-item"
                aria-label={t('Switch language', '切换界面语言')}
                title={t(
                  `Language: ${locale === 'zh-CN' ? '简体中文' : 'English'}`,
                  `界面语言：${locale === 'zh-CN' ? '简体中文' : 'English'}`,
                )}
              >
                <IconLanguage size={22} stroke={1.7} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" sideOffset={12} collisionPadding={12} className="w-40">
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <IconLanguage size={14} />
                {t('Language', '界面语言')}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                aria-label="Language"
                value={locale}
                onValueChange={value => setLocale(value as Locale)}
              >
                <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="zh-CN">简体中文</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <AccountMenu context={context} workspacePath={activeWorkspacePath} supplierArea={supplierArea} />
        </div>
      </nav>
      <div className="app-rail-spacer" aria-hidden="true" />
      {hasSidebar && (
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
                <nav aria-label="Activity navigation">
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
              creationAvailable={paymentReadiness.status === 'ready'}
              context={context}
              activeWorkspacePath={activeWorkspacePath}
              models={models}
              activePath={activePath}
              onCreateWorkspace={() => setWorkspaceCreateOpen(true)}
            />
          )}
          {phoneNavigation && (
            <SidebarFooter>
              <AccountMenu context={context} workspacePath={activeWorkspacePath} supplierArea={supplierArea} mobile />
            </SidebarFooter>
          )}
        </Sidebar>
      )}
      <SidebarInset className="main-panel">
        {mockPaymentsEnabled && (
          <Alert className="mock-payment-warning shrink-0 rounded-none" role="status">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle className="line-clamp-none">
              {t('Mock payments enabled · Real model costs', '模拟支付已开启 · 实际产生模型费用')}
            </AlertTitle>
            <AlertDescription>
              {t(
                'Only payments are simulated. LLM requests still incur upstream Provider charges. Do not share this environment’s Niu API keys or upstream Provider keys publicly.',
                '当前仅模拟充值支付流程，模型调用仍会产生真实的上游供应商费用。请勿公开分享此环境的 Niu API 密钥或上游供应商密钥。',
              )}
            </AlertDescription>
          </Alert>
        )}
        {phoneNavigation && !hasSidebar && !isGlobalChat && (
          <nav className="mobile-product-navigation" aria-label="Product navigation">
            <a href={import.meta.env.BASE_URL} aria-label={`${branding.display_name} home`}>
              <img src={logo} alt="" />
            </a>
            <AccountMenu context={context} workspacePath={activeWorkspacePath} supplierArea={supplierArea} mobile />
          </nav>
        )}
        {!settingsArea && !isGlobalChat && !helpArea && (
          <ShellHeader
            toggleRef={toggleRef}
            hasSidebar={hasSidebar}
            modelFiltersAvailable={modelFiltersAvailable}
            supplierArea={supplierArea}
            supplierManagement={supplierManagement}
            destination={destination}
            settingsArea={settingsArea}
            activityArea={activityArea}
            adminArea={adminArea}
            workspaceDirectoryArea={workspaceDirectoryArea}
            phoneNavigation={phoneNavigation}
            brandingName={branding.display_name}
            logo={logo}
            activeWorkspacePath={activeWorkspacePath}
            activePath={activePath}
            isGuardrailEditor={isGuardrailEditor}
            workspace={effectiveActiveWorkspace}
            workspaces={workspaces}
            selectWorkspace={selectWorkspace}
            activeNavigation={activeNavigation}
            scopedNavigation={scopedNavigation}
            adminSupplierId={adminSupplierId}
            adminSupplierName={adminSupplierName}
            platform={platform}
            modelsHref={modelsHref}
            token={token}
            title={title}
            setupBlocked={setupBlocked}
          />
        )}
        <div className={`page-content${helpArea ? ' help-content' : ''}`} id="dashboard-content" tabIndex={-1}>
          {!helpArea && gatewayStatus === 'checking' && (
            <WorkspaceShellSkeleton label={t('Connecting to your workspace…', '正在连接工作空间…')} />
          )}
          {gatewayOutage}
          {signOutFailure}
          {(helpArea || gateway.everConnected) && (
            <div className="gateway-route-content" hidden={!helpArea && gatewayStatus !== 'online'}>
              {adminSupplierId && (
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
                    <TabsList variant="line" aria-label="Provider sections">
                      {[
                        ['overview', t('Overview', '概览')],
                        ['keys', t('API keys', 'API 密钥')],
                        ['models', t('Models', '模型')],
                        ['usage', t('Usage', '调用量')],
                        ['settlements', t('Settlements', '结算账单')],
                        ['settings', t('Settings', '设置')],
                      ].map(([value, label]) => {
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
              )}
              {setupBlocked && (
                <section className="space-y-4 py-6" aria-label="Service setup">
                  <h2 className="text-lg font-semibold">
                    {paymentReadiness.status === 'loading'
                      ? t('Checking service setup…', '正在检查服务配置…')
                      : paymentReadiness.status === 'error'
                        ? t('Could not verify service setup', '无法验证服务配置')
                        : t('Service setup required', '需要完成服务配置')}
                  </h2>
                  <p role="status" className="text-muted-foreground">
                    {paymentReadiness.status === 'loading'
                      ? t('Checking payment setup or funding for this account.', '正在检查当前账户的支付配置或资金状态。')
                      : paymentReadiness.status === 'error'
                        ? t(
                            'We couldn’t check service setup. Your work is preserved. Check your connection and try again.',
                            '无法检查服务配置。您的工作已保留，请检查网络连接后重试。',
                          )
                        : isInstallation
                          ? t(
                              'Configure the platform currency, then connect a payment gateway or fund this company’s account. Funded self-hosted workspaces do not require a merchant.',
                              '请先配置平台结算币种，然后连接支付网关或为该企业账户充值。已充值的私有化部署工作空间无需配置商户网关。',
                            )
                          : t(
                              'Your service administrator needs to configure payments or fund your company’s account before workspace features become available.',
                              '您的服务管理员需要先配置支付网关或为企业账户充值，工作空间功能方可使用。',
                            )}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {isInstallation && paymentReadiness.status === 'blocked' && (
                      <Button asChild>
                        <NavLink to={paymentReadiness.reason === 'currency_required' ? '/admin/settings' : '/admin/payments'}>
                          {paymentReadiness.reason === 'currency_required'
                            ? t('Configure platform currency', '配置平台币种')
                            : t('Configure payment gateways', '配置支付网关')}
                        </NavLink>
                      </Button>
                    )}
                    {isInstallation && paymentReadiness.status === 'blocked' && paymentReadiness.reason !== 'currency_required' && (
                      <Button variant="outline" asChild>
                        <NavLink to="/admin/balances">{t('Manage account funding', '管理账户充值')}</NavLink>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      disabled={paymentReadiness.status === 'loading'}
                      onClick={() => {
                        paymentReadiness.retry();
                        setWorkspaceLoadRevision(value => value + 1);
                      }}
                    >
                      {t('Check again', '重新检查')}
                    </Button>
                  </div>
                </section>
              )}
              {(!setupBlocked || paymentReadiness.retainContent) && (
                <div hidden={setupBlocked}>
                  {helpArea ? (
                    <Outlet key={principalKey || 'anonymous'} context={context} />
                  ) : token && !supplierArea && !settingsArea && effectiveWorkspaceError ? (
                    <WorkspaceRecovery
                      problem={effectiveWorkspaceError}
                      onRetry={() => setWorkspaceLoadRevision(value => value + 1)}
                    />
                  ) : token && !supplierArea && !settingsArea && (workspaceLoading || !authorityWorkspacesReady) ? (
                    <WorkspaceShellSkeleton label={t('Loading workspace…', '正在加载工作空间…')} />
                  ) : (
                    <Outlet key={principalKey || 'anonymous'} context={context} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
