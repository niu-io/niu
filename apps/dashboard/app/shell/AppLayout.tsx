import ShellSectionTabs from './ShellSectionTabs';
import { ShellNavigationContext, SidebarRouteDismiss } from './ShellNavigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
} from 'react';
import { Navigate, Outlet, useNavigate, useRevalidator } from 'react-router';
import { WorkspaceShellSkeleton } from '@/components/PageSkeletons';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { legacySettingsTarget } from '@/features/account/settings-routes';
import { reconcileActiveRouteLoad } from '@/lib/route-data';
import { subscribeMutations } from '@/lib/query-cache';
import AccountMenu from './AccountMenu';
import { useBranding } from './branding';
import type { DashboardContext, GatewayStatus } from './dashboard-context';
import { prefetchRouteIntent, scheduleWorkspaceWarmup } from './prefetch';
import { resolveProvider } from './provider-route';
import { ProviderNav } from './ProviderNav';
import AppError from './route-error';
import {
  notifySessionSnapshotReady,
  resetActiveSessionSnapshot,
  setActiveSessionSnapshot,
  subscribeSessionSnapshot,
} from './router-context';
import RouterPending from './RouterPending';
import ShellHeader from './ShellHeader';
import {
  AdminProviderTabs,
  GatewayOutageDialog,
  ShellSidebar,
  SignOutFailureDialog,
} from './ShellSections';
import { useAccountAppearance } from './useAccountAppearance';
import { useCatalogModels } from './useCatalogModels';
import { useGatewayConnection } from './useGatewayConnection';
import { useProviderDirectory } from './useProviderDirectory';
import { useRouteMetadata } from './useRouteMetadata';
import { useSessionController } from './useSessionController';
import { useLocale } from './ui-locale';
import { useWorkspaceController } from './useWorkspaceController';
import { workspacePathSegment } from './workspace-route';
import WorkspaceRecovery from './WorkspaceRecovery';
import { OrganizationCreateDialog, WorkspaceCreateDialog } from './WorkspaceSwitcher';

export { ProviderNav, ProviderNav as SupplierNav };
export const ErrorBoundary = AppError;

const sidebarBreakpoint = 960;

export default function AppLayout() {
  const { t, format: uiF } = useLocale();
  const uiT = (en: string) => t(en);
  const { settings: branding, logo } = useBranding();
  const revalidator = useRevalidator();
  const revalidatorRef = useRef(revalidator);
  revalidatorRef.current = revalidator;

  const [workspaceCreateOpen, setWorkspaceCreateOpen] = useState(false);
  const [organizationCreateOpen, setOrganizationCreateOpen] = useState(false);
  const openCreateOrganization = useCallback(() => setOrganizationCreateOpen(true), []);

  const navigate = useNavigate();
  const gateway = useGatewayConnection();
  const { health, checked: healthChecked } = gateway;

  const sessionCtrl = useSessionController(gateway);
  const {
    token,
    draftToken,
    setDraftToken,
    session,
    setSession,
    sessionChecked,
    signOutFailed,
    setSignOutFailed,
    error,
    principalKey,
    authorityKey,
    connectionRevision,
    connectionController,
    latestIdentityRef,
    syncAuthorityImmediate,
    authenticate,
    connect,
    signOut,
    refreshWorkspace,
    updateProfile,
    roleSwitch,
    bindCallbacks,
  } = sessionCtrl;

  const appearance = useAccountAppearance(
    token,
    JSON.stringify([token, session?.kind, session?.operator?.id]),
    session?.kind === 'operator',
    session?.operator?.id ?? '',
    branding.default_appearance,
  );

  const routeMeta = useRouteMetadata(session, branding.display_name);
  const {
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
    inviteArea,
    activityArea,
    activePath,
    scopedNavigation,
    activeNavigation,
    title,
    destination,
    platform,
  } = routeMeta;

  const {
    authorizedProviders,
    providerDirectoryLoading,
    providerDirectoryError,
    reloadProviderDirectory,
    adminSupplierName,
  } = useProviderDirectory(token, session, supplierArea, adminSupplierId);

  const modelResetBridgeRef = useRef<{
    resetModels: (loading: boolean) => void;
    abortModels: () => void;
  }>({
    resetModels: () => {},
    abortModels: () => {},
  });

  const workspaceCtrl = useWorkspaceController({
    token,
    session,
    setSession,
    principalKey,
    authorityKey,
    connectionRevision,
    latestIdentityRef,
    syncAuthorityImmediate,
    refreshWorkspace,
    resetModels: useCallback((loading: boolean) => modelResetBridgeRef.current.resetModels(loading), []),
    abortModels: useCallback(() => modelResetBridgeRef.current.abortModels(), []),
    usesSelectedWorkspace,
    settingsArea,
    workspaceDirectoryArea,
    isGlobalChat,
  });

  const {
    organizations,
    organization,
    selectOrganization,
    organizationSwitching,
    organizationSwitchError,
    createOrganization,
    renameOrganization,
    joinOrganization,
    acceptInvitation,
    workspaces,
    workspace: activeContextWorkspace,
    effectiveActiveWorkspace,
    workspaceLoading,
    authorityWorkspacesReady,
    reloadWorkspaces,
    workspaceError: effectiveWorkspaceError,
    selectWorkspace,
    createWorkspace,
    applyWorkspaceRename,
    deleteWorkspace,
    chatKeys,
    rememberChatKey,
    forgetChatKey,
    modelOrganizationId,
    modelWorkspaceId,
    modelsHref,
    activeWorkspacePath,
    resetWorkspacesForSignOut,
    resetWorkspacesForAuthorityChange,
    resetWorkspacesForPrincipalChange,
    bumpWorkspaceRevisionOnRecovery,
    getWorkspaceNavigation,
    getWorkspaceError,
  } = workspaceCtrl;

  const catalogModels = useCatalogModels({
    token,
    authorityKey,
    modelOrganizationId,
    modelWorkspaceId,
    connectionRevision,
    connectionController,
    latestAuthorityRef: latestIdentityRef,
  });

  const { models, modelsLoading, modelsError, refreshModels, resetModels, abortModels } = catalogModels;
  modelResetBridgeRef.current = { resetModels, abortModels };

  bindCallbacks({
    resetModels,
    abortModels,
    refreshModels,
    resetWorkspacesForSignOut,
    resetWorkspacesForAuthorityChange,
    resetWorkspacesForPrincipalChange,
    bumpWorkspaceRevisionOnRecovery,
    getWorkspaceNavigation,
    getWorkspaceError,
  });


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
    return () => {
      resetActiveSessionSnapshot();
    };
  }, []);

  useEffect(() => {
    reconcileActiveRouteLoad(location.pathname, authorityKey);
  }, [location.pathname, authorityKey]);

  useEffect(() => {
    if (loginArea || !authorityKey) return;
    const hasDeferredMatch = matches.some(match => {
      const matchRecord = match as { loaderData?: unknown; data?: unknown };
      const data = (matchRecord.loaderData ?? matchRecord.data) as
        | { status?: string; reason?: string }
        | null
        | undefined;
      if (!data || data.status !== 'deferred') return false;
      if (data.reason === 'workspace-pending' || location.pathname.startsWith('/workspaces/')) {
        return authorityWorkspacesReady;
      }
      return data.reason === 'unauthenticated';
    });
    if (!hasDeferredMatch) return;
    if (supplierArea && authorizedProviders.length > 0) {
      const parts = location.pathname.split('/');
      const index = parts[1] === 'admin' ? 3 : 2;
      if (parts[index - 1] === 'providers' || parts[index - 1] === 'suppliers') {
        const provider = resolveProvider(decodeURIComponent(parts[index] ?? ''), authorizedProviders);
        if (provider?.slug && parts[index] !== provider.slug) {
          return;
        }
      }
    }
    if (authorityWorkspacesReady && effectiveActiveWorkspace) {
      const preferredSegment = workspacePathSegment(effectiveActiveWorkspace, workspaces);
      if (!usesSelectedWorkspace && location.pathname.startsWith('/workspaces/')) {
        const currentSegment = location.pathname.split('/').filter(Boolean)[1];
        if (currentSegment && currentSegment !== preferredSegment) {
          return;
        }
      } else if (usesSelectedWorkspace) {
        const requested = new URLSearchParams(location.search).get('workspace');
        if (requested && requested !== preferredSegment) {
          return;
        }
      }
    }
    notifySessionSnapshotReady();
  }, [
    authorityKey,
    authorityWorkspacesReady,
    authorizedProviders,
    effectiveActiveWorkspace,
    location.pathname,
    location.search,
    loginArea,
    matches,
    supplierArea,
    usesSelectedWorkspace,
    workspaces,
  ]);

  useEffect(() => {
    const triggerRevalidate = () => {
      if (revalidatorRef.current.state === 'idle') {
        void revalidatorRef.current.revalidate();
      }
    };
    const unsubMutations = subscribeMutations(triggerRevalidate);
    const unsubSession = subscribeSessionSnapshot(triggerRevalidate);
    return () => {
      unsubMutations();
      unsubSession();
    };
  }, []);

  useEffect(() => {
    if (!token || !authorityKey) return;
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
  ]);

  const gatewayStatus: GatewayStatus =
    health?.status === 'ok' ? 'online' : healthChecked ? 'offline' : 'checking';

  const context = useMemo<DashboardContext>(
    () => ({
      appearance,
      sessionChecked,
      token,
      session,
      roleSwitch,
      updateProfile,
      providerDirectory: authorizedProviders,
      providerDirectoryLoading,
      providerDirectoryError,
      reloadProviderDirectory,
      organizations,
      organization,
      selectOrganization,
      organizationSwitching,
      organizationSwitchError,
      createOrganization,
      renameOrganization,
      joinOrganization,
      acceptInvitation,
      openCreateOrganization,
      workspaces,
      workspace: activeContextWorkspace,
      workspaceLoading,
      reloadWorkspaces,
      workspaceError: effectiveWorkspaceError,
      selectWorkspace,
      createWorkspace,
      applyWorkspaceRename,
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
      appearance,
      sessionChecked,
      token,
      session,
      roleSwitch,
      updateProfile,
      authorizedProviders,
      providerDirectoryLoading,
      providerDirectoryError,
      reloadProviderDirectory,
      organizations,
      organization,
      selectOrganization,
      organizationSwitching,
      organizationSwitchError,
      createOrganization,
      renameOrganization,
      joinOrganization,
      acceptInvitation,
      openCreateOrganization,
      workspaces,
      activeContextWorkspace,
      workspaceLoading,
      reloadWorkspaces,
      effectiveWorkspaceError,
      selectWorkspace,
      createWorkspace,
      applyWorkspaceRename,
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
      authenticate,
      signOut,
      modelsLoading,
      modelsError,
      refreshModels,
      refreshWorkspace,
    ],
  );

  const sidebarViewportWidth = useRef(typeof window !== 'undefined' ? window.innerWidth : sidebarBreakpoint);
  const [phoneNavigation, setPhoneNavigation] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 580,
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= sidebarBreakpoint,
  );
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const hasSidebar = true;
  const modelFiltersAvailable = false;
  const legacySettings = useMemo(
    () =>
      settingsArea
        ? null
        : legacySettingsTarget(location.pathname, location.search, location.hash, session),
    [settingsArea, location.pathname, location.search, location.hash, session?.kind],
  );
  // Navigate compares its state prop by identity. Keep it stable so a render
  // that happens before the redirect commits cannot enqueue the same
  // navigation repeatedly.
  const legacySettingsState = useMemo(() => {
    if (!legacySettings) return null;
    return location.state && typeof location.state === 'object'
      ? { ...location.state, settingsReturnTo: legacySettings.returnTo }
      : { settingsReturnTo: legacySettings.returnTo };
  }, [legacySettings?.returnTo, location.state]);

  const [lastGenerationsHref, setLastGenerationsHref] = useState('/generations');
  useEffect(() => {
    setLastGenerationsHref('/generations');
  }, [token]);
  useEffect(() => {
    if (location.pathname !== '/generations' && !location.pathname.startsWith('/generations/')) return;
    const params = new URLSearchParams(location.search);
    if (
      (location.pathname.startsWith('/generations/') && location.pathname !== '/generations/') ||
      params.get('session') ||
      params.get('video-session') ||
      params.get('job') ||
      params.get('intent')
    ) {
      setLastGenerationsHref(`${location.pathname}${location.search}`);
    } else {
      setLastGenerationsHref('/generations');
    }
  }, [location.pathname, location.search]);
  const generationsHref = lastGenerationsHref;

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

  const previousPathnameRef = useRef(location.pathname);
  useEffect(() => {
    if (previousPathnameRef.current === location.pathname) return;
    previousPathnameRef.current = location.pathname;
    if (document.querySelector('[role="dialog"], [role="menu"]')) return;
    const active = document.activeElement;
    const contentEl = document.getElementById('dashboard-content');
    if (contentEl && active instanceof HTMLElement && active.closest('a[href]') && !contentEl.contains(active)) {
      contentEl.focus({ preventScroll: true });
    }
  }, [location.pathname]);

  const handleLinkIntentPrefetch = useCallback((event: PointerEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (anchor.target && anchor.target !== '_self') return;
    if (anchor.hasAttribute('download')) return;
    const rawHref = anchor.getAttribute('href');
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) return;
    try {
      const url = new URL(rawHref, window.location.origin);
      if (url.origin !== window.location.origin) return;
      prefetchRouteIntent({ pathname: url.pathname, search: url.search });
    } catch {
      /* Ignore malformed hrefs. */
    }
  }, []);

  const signOutFailure = (
    <SignOutFailureDialog open={signOutFailed} onOpenChange={setSignOutFailed} onRetry={() => void signOut()} />
  );
  const gatewayOutage = (
    <GatewayOutageDialog
      open={gatewayStatus === 'offline'}
      checking={gateway.checking}
      onRetry={() => void gateway.check()}
    />
  );

  if (!loginArea && !token) {
    return (
      <>
        {gatewayOutage}
        {signOutFailure}
        <RouterPending />
      </>
    );
  }
  if (location.pathname === '/connect' && token) return <Outlet context={context} />;
  if (loginArea || (inviteArea && token)) return <div className="dashboard-login-shell"><Outlet context={context} /></div>;

  if (legacySettings) {
    return <Navigate replace state={legacySettingsState ?? undefined} to={legacySettings.to} />;
  }

  return (
    <ShellNavigationContext.Provider value={{context: {...context, workspace: activeContextWorkspace ?? effectiveActiveWorkspace}, workspacePath: activeWorkspacePath, modelsHref, generationsHref, onCreateWorkspace: () => setWorkspaceCreateOpen(true)}}><SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="app-shell"
      onPointerOver={handleLinkIntentPrefetch}
      onFocusCapture={handleLinkIntentPrefetch}
      style={
        {
          '--sidebar-width': 'var(--context)',
          '--sidebar-width-icon': 'var(--workspace-sidebar-icon-width)',
          '--sidebar-width-mobile': 'var(--context)',
        } as CSSProperties
      }
    >
      <SidebarRouteDismiss />
      <a className="dashboard-skip" href="#dashboard-content">
        {t('Skip to content', '跳转到主内容')}
      </a>
      <WorkspaceCreateDialog
        context={context}
        open={workspaceCreateOpen}
        onOpenChange={setWorkspaceCreateOpen}
      />
      <OrganizationCreateDialog
        context={context}
        open={organizationCreateOpen}
        onOpenChange={setOrganizationCreateOpen}
      />
      {hasSidebar && (
        <ShellSidebar
          sidebarRef={sidebarRef}
          toggleRef={toggleRef}
          adminArea={adminArea}
          activityArea={activityArea}
          settingsArea={settingsArea}
          supplierArea={supplierArea}
          contextual={activityArea || settingsArea || supplierManagement || destination === 'Workspace'}
          creationAvailable
          context={context}
          activeWorkspacePath={activeWorkspacePath}
          models={models}
          activePath={activePath}
          onCreateWorkspace={() => setWorkspaceCreateOpen(true)}
        />
      )}
      <SidebarInset className="main-panel">
        {phoneNavigation && !hasSidebar && !isGlobalChat && (
          <nav className="mobile-product-navigation" aria-label={uiT('Product navigation')}>
            <a href={import.meta.env.BASE_URL} aria-label={uiF('{0} home', [branding.display_name])}>
              <img src={logo} alt="" />
            </a>
            <AccountMenu context={context} workspacePath={activeWorkspacePath} supplierArea={supplierArea} mobile />
          </nav>
        )}
        {!isGlobalChat && (
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
            workspace={effectiveActiveWorkspace}
            workspaces={workspaces}
            selectWorkspace={selectWorkspace}
            activeNavigation={activeNavigation}
            scopedNavigation={scopedNavigation}
            adminSupplierId={adminSupplierId}
            adminSupplierName={adminSupplierName}
            platform={platform}
            modelsHref={modelsHref}
            title={title}
          />
        )}
        <div className="page-content" id="dashboard-content" tabIndex={-1}>
          {gatewayStatus === 'checking' && (
            <WorkspaceShellSkeleton label={t('Connecting to your workspace…', '正在连接工作空间…')} />
          )}
          {gatewayOutage}
          {signOutFailure}
          {gateway.everConnected && (
            <div className="gateway-route-content" hidden={gatewayStatus !== 'online'}>
              <ShellSectionTabs context={context} />
              {adminSupplierId && (
                <AdminProviderTabs
                  adminSupplierId={adminSupplierId}
                  operatingMode={session?.operating_mode}
                  gatewayStatus={gatewayStatus}
                />
              )}
                <div>
                  {token && !supplierArea && !settingsArea && effectiveWorkspaceError ? (
                    <WorkspaceRecovery problem={effectiveWorkspaceError} onRetry={reloadWorkspaces} />
                  ) : token && !supplierArea && !settingsArea && (workspaceLoading || !authorityWorkspacesReady) ? (
                    <WorkspaceShellSkeleton label={t('Loading workspace…', '正在加载工作空间…')} />
                  ) : (
                    <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">{t('Loading page…', '正在加载页面…')}</p>}>
                      <Outlet key={principalKey || 'anonymous'} context={context} />
                    </Suspense>
                  )}
                </div>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider></ShellNavigationContext.Provider>
  );
}
