import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MutableRefObject,
} from 'react';
import { useLocation, useNavigate, type Location } from 'react-router';
import { clearSessionCache, syncCacheAuthority } from '@/lib/query-cache';
import { canManagePlatform, type AdminSession, type Workspace, type WorkspaceProblem } from './dashboard-context';
import {
  buildSessionAuthorityKey,
  buildSessionPrincipalKey,
  resetActiveSessionSnapshot,
} from './router-context';
import { useLocale } from './ui-locale';
import type { useGatewayConnection } from './useGatewayConnection';
import { workspacePathSegment } from './workspace-route';

export type SessionControllerCallbacks = {
  resetModels: (loading: boolean) => void;
  abortModels: () => void;
  refreshModels: (force?: boolean) => Promise<void>;
  resetWorkspacesForSignOut: () => void;
  resetWorkspacesForAuthorityChange: () => void;
  resetWorkspacesForPrincipalChange: (nextPrincipalKey: string) => void;
  bumpWorkspaceRevisionOnRecovery: () => void;
  getWorkspaceNavigation: () => {
    routeWorkspace: Workspace | undefined;
    workspace: Workspace | null;
    workspaces: Workspace[];
    location: Location;
  };
  getWorkspaceError: () => WorkspaceProblem | null;
};

export function useSessionController(gateway: ReturnType<typeof useGatewayConnection>) {
  const { t } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const { health, checked: healthChecked } = gateway;

  const [token, setToken] = useState('');
  const [draftToken, setDraftToken] = useState('');
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [error, setError] = useState('');
  const [modeSaving, setModeSaving] = useState(false);
  const [modeError, setModeError] = useState('');

  const signOutPending = useRef(false);
  const modeRequest = useRef(false);
  const modeRevision = useRef(0);
  const connectionRevision = useRef(0);
  const connectionController = useRef<AbortController | null>(null);
  const callbacksRef = useRef<SessionControllerCallbacks | null>(null);

  const principalKey = useMemo(() => buildSessionPrincipalKey(token, session), [token, session]);
  const authorityKey = useMemo(() => buildSessionAuthorityKey(token, session), [token, session]);

  const syncedAuthorityRef = useRef<string | undefined>(undefined);
  if (syncedAuthorityRef.current !== authorityKey) {
    syncedAuthorityRef.current = authorityKey;
    syncCacheAuthority(authorityKey || null);
  }

  const syncAuthorityImmediate = useCallback((nextAuthorityKey: string) => {
    syncCacheAuthority(nextAuthorityKey || null);
    syncedAuthorityRef.current = nextAuthorityKey;
  }, []);

  const latestIdentityRef = useRef({ principalKey, authorityKey, location });
  latestIdentityRef.current = { principalKey, authorityKey, location };

  const authenticationPath = useRef(location.pathname);
  authenticationPath.current = location.pathname;

  const authenticate = useCallback(
    async (credential: string, restoring = false) => {
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
        syncAuthorityImmediate(nextAuthorityKey);
        callbacksRef.current?.resetModels(true);
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
    },
    [syncAuthorityImmediate],
  );

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
    callbacksRef.current?.abortModels();
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
    callbacksRef.current?.resetModels(false);
    callbacksRef.current?.resetWorkspacesForSignOut();
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
      if (configured.ok) {
        const authConfig = (await configured.json()) as {
          password_login?: boolean;
          browser_token_login?: boolean;
          demo_login?: boolean;
        };
        if (
          authConfig.password_login === true ||
          authConfig.browser_token_login === true ||
          authConfig.demo_login === true
        ) {
          if (controller.signal.aborted || revision !== connectionRevision.current) return;
          await authenticate('niu-browser-member-session', true);
          return null;
        }
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
        if (
          revision !== connectionRevision.current ||
          controller.signal.aborted ||
          currentModeRevision !== modeRevision.current
        ) {
          return;
        }
        if (response.status === 401) {
          controller.abort();
          if (connectionController.current === controller) connectionController.current = null;
          callbacksRef.current?.abortModels();
          connectionRevision.current += 1;
          clearSessionCache();
          syncedAuthorityRef.current = '';
          resetActiveSessionSnapshot();
          setToken('');
          setDraftToken('');
          callbacksRef.current?.resetModels(false);
          callbacksRef.current?.resetWorkspacesForSignOut();
          setSession(null);
          setError('Your session has expired or been revoked. Sign in again.');
          return;
        }
        if (response.ok) {
          const currentSession = ((await response.json()) as { data: AdminSession }).data;
          if (
            revision !== connectionRevision.current ||
            controller.signal.aborted ||
            currentModeRevision !== modeRevision.current
          ) {
            return;
          }
          const nextEffectiveSession = currentSession;
          const nextPrincipalKey = buildSessionPrincipalKey(token, nextEffectiveSession);
          const nextAuthorityKey = buildSessionAuthorityKey(token, nextEffectiveSession);
          const prev = latestIdentityRef.current;
          const principalChanged = Boolean(prev.principalKey && prev.principalKey !== nextPrincipalKey);
          authorityChanged = Boolean(prev.authorityKey && prev.authorityKey !== nextAuthorityKey);

          if (authorityChanged) {
            callbacksRef.current?.abortModels();
            syncAuthorityImmediate(nextAuthorityKey);
            callbacksRef.current?.resetWorkspacesForAuthorityChange();
            callbacksRef.current?.resetModels(true);
          }

          if (principalChanged) {
            callbacksRef.current?.resetWorkspacesForPrincipalChange(nextPrincipalKey);
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
    if (
      !authorityChanged &&
      revision === connectionRevision.current &&
      token &&
      controller &&
      !controller.signal.aborted
    ) {
      await callbacksRef.current?.refreshModels(true);
    }
  }, [token, gateway, navigate, syncAuthorityImmediate]);

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
    if (!token) return;
    const syncAcrossTabs = (event: StorageEvent) => {
      if (event.key === 'niu.auth.org-switch' && event.newValue) {
        void refreshWorkspace();
        return;
      }
      if (token !== 'niu-browser-member-session') return;
      if (event.key !== 'niu.auth.signout' || !event.newValue) return;
      connectionController.current?.abort();
      connectionController.current = null;
      callbacksRef.current?.abortModels();
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
      callbacksRef.current?.resetModels(false);
      callbacksRef.current?.resetWorkspacesForSignOut();
    };
    window.addEventListener('storage', syncAcrossTabs);
    return () => window.removeEventListener('storage', syncAcrossTabs);
  }, [token, refreshWorkspace]);

  const previousHealth = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (health?.status === 'ok' && previousHealth.current === 'offline') {
      const wsErr = callbacksRef.current?.getWorkspaceError();
      if (wsErr && wsErr.kind !== 'missing') {
        callbacksRef.current?.bumpWorkspaceRevisionOnRecovery();
      }
      void refreshWorkspace();
    }
    previousHealth.current = health?.status === 'ok' ? 'online' : healthChecked ? 'offline' : undefined;
  }, [health?.status, healthChecked, refreshWorkspace]);

  const profileConnectionRevision = connectionRevision.current;
  const updateProfile = useCallback(
    (profile: NonNullable<AdminSession['profile']>) => {
      if (connectionRevision.current !== profileConnectionRevision) return;
      setSession(current =>
        current?.kind === 'operator' &&
        current.operator?.id === session?.operator?.id &&
        (!current.profile || profile.revision >= current.profile.revision)
          ? { ...current, profile }
          : current,
      );
    },
    [profileConnectionRevision, session?.operator?.id],
  );

  const setAccountRole = useCallback(
    async (role: 'user' | 'admin') => {
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
          const identity = await fetch('/api/v1/session', {
            headers: { authorization: 'Bearer ' + token },
          });
          if (identity.ok) {
            const current = ((await identity.json()) as { data: AdminSession }).data;
            if (revision === connectionRevision.current) setSession(current);
          }
          if (revision === connectionRevision.current) {
            setModeError(
              t(
                'This role is unavailable for your session. Contact your installation administrator.',
                '当前会话无法切换到该角色，请联系实例管理员。',
              ),
            );
          }
          return false;
        }
        if (!response.ok) throw new Error('mode');
        const next = ((await response.json()) as { data: AdminSession }).data;
        if (revision !== connectionRevision.current) return false;
        setSession(next);
        if (role !== 'admin' && /^\/(admin|providers|suppliers)(\/|$)/.test(location.pathname)) {
          const current = callbacksRef.current?.getWorkspaceNavigation();
          navigate(
            current?.workspace
              ? `/workspaces/${workspacePathSegment(current.workspace, current.workspaces)}`
              : '/workspaces/default',
            { replace: true },
          );
        }
        return true;
      } catch {
        if (revision === connectionRevision.current) {
          setModeError(t('Could not switch role. Try again.', '切换角色失败，请重试。'));
        }
        return false;
      } finally {
        modeRequest.current = false;
        setModeSaving(false);
      }
    },
    [token, location.pathname, navigate, t],
  );

  const roleSwitch = useMemo(
    () => ({
      available: session?.roles?.switchable ? session.roles.available : [],
      active: session?.roles?.active ?? (canManagePlatform(session) ? 'admin' : 'user'),
      saving: modeSaving,
      error: modeError,
      setRole: setAccountRole,
    }),
    [session, modeSaving, modeError, setAccountRole],
  );

  const bindCallbacks = useCallback((callbacks: SessionControllerCallbacks) => {
    callbacksRef.current = callbacks;
  }, []);

  return {
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
    connectionRevision: connectionRevision as MutableRefObject<number>,
    connectionController: connectionController as MutableRefObject<AbortController | null>,
    latestIdentityRef,
    syncAuthorityImmediate,
    authenticate,
    connect,
    signOut,
    refreshWorkspace,
    updateProfile,
    roleSwitch,
    bindCallbacks,
  };
}
