import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useLocation, useNavigate, useParams, type Location } from 'react-router';
import { ApiRequestError, request } from '@/lib/api-client';
import { acceptMemberInvitation } from '@/features/operators/api';
import { fetchQuery, isAbortError, peekQuery, primeQuery } from '@/lib/query-cache';
import type {
  AdminSession,
  Organization,
  SessionChatKey,
  Workspace,
  WorkspaceProblem,
} from './dashboard-context';
import { buildSessionAuthorityKey, buildSessionPrincipalKey } from './router-context';
import { formatLocalizedMessage, readLocale, useLocale } from './ui-locale';
import {
  resolveWorkspacePathSegment,
  workspaceModelsHref,
  workspacePathSegment,
} from './workspace-route';

const EMPTY_ORGANIZATIONS: Organization[] = [];
const EMPTY_WORKSPACES: Workspace[] = [];
const EMPTY_CHAT_KEYS: SessionChatKey[] = [];

export type WorkspaceControllerParams = {
  token: string;
  session: AdminSession | null;
  setSession: Dispatch<SetStateAction<AdminSession | null>>;
  principalKey: string;
  authorityKey: string;
  connectionRevision: MutableRefObject<number>;
  latestIdentityRef: MutableRefObject<{ principalKey: string; authorityKey: string; location: Location }>;
  syncAuthorityImmediate: (nextAuthorityKey: string) => void;
  refreshWorkspace: () => Promise<void>;
  resetModels: (loading: boolean) => void;
  abortModels: () => void;
  usesSelectedWorkspace: boolean;
  settingsArea: boolean;
  workspaceDirectoryArea: boolean;
  isGlobalChat: boolean;
};

export function useWorkspaceController({
  token,
  session,
  setSession,
  principalKey,
  authorityKey,
  connectionRevision,
  latestIdentityRef,
  syncAuthorityImmediate,
  refreshWorkspace,
  resetModels,
  abortModels,
  usesSelectedWorkspace,
  settingsArea,
  workspaceDirectoryArea,
  isGlobalChat,
}: WorkspaceControllerParams) {
  const { isZh, t } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const { workspace: routeWorkspaceId } = useParams();

  const [organizationSwitching, setOrganizationSwitching] = useState(false);
  const [organizationSwitchError, setOrganizationSwitchError] = useState('');
  const orgSwitchRequest = useRef(false);
  const crossOrgResolvedRef = useRef('');
  const lastSyncedOrgParamRef = useRef<string | null>(null);

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

  const rememberChatKey = useCallback(
    (key: SessionChatKey) => {
      setChatKeysPrincipal(currentPrincipal => {
        if (currentPrincipal !== principalKey) {
          setChatKeys([key]);
        } else {
          setChatKeys(current => [
            key,
            ...current.filter(item => item.id !== key.id || item.projectId !== key.projectId),
          ]);
        }
        return principalKey;
      });
    },
    [principalKey],
  );

  const forgetChatKey = useCallback((id: string) => {
    setChatKeys(current => current.filter(item => item.id !== id));
  }, []);

  const candidateWorkspaces = selectedOrganizationId
    ? workspaces.filter(item => item.organization_id === selectedOrganizationId)
    : workspaces;
  const routeWorkspace = routeWorkspaceId
    ? resolveWorkspacePathSegment(
        routeWorkspaceId,
        routeWorkspaceId === 'default' ? candidateWorkspaces : workspaces,
      )
    : undefined;
  const requestedWorkspaceId = usesSelectedWorkspace ? new URLSearchParams(location.search).get('workspace') : null;
  const requestedWorkspace = requestedWorkspaceId
    ? resolveWorkspacePathSegment(requestedWorkspaceId, workspaces)
    : undefined;
  const isDefaultRouteAlias = routeWorkspaceId === 'default' && !routeWorkspace;
  const isDefaultWorkspaceAlias = requestedWorkspaceId === 'default' && !requestedWorkspace;
  const isExplicitRouteWorkspace = Boolean(
    !usesSelectedWorkspace && routeWorkspaceId && !isDefaultRouteAlias,
  );
  const isExplicitQueryWorkspace = Boolean(
    usesSelectedWorkspace && requestedWorkspaceId && !isDefaultWorkspaceAlias,
  );

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

  const effectiveActiveWorkspace = isExplicitRouteWorkspace
    ? routeWorkspace ?? null
    : isExplicitQueryWorkspace
      ? requestedWorkspace ?? null
      : workspace ?? defaultPreferredWorkspace;
  const selectedWorkspace = isExplicitQueryWorkspace
    ? requestedWorkspace ?? null
    : workspace ?? defaultPreferredWorkspace;

  const effectiveWorkspaceError: WorkspaceProblem | null =
    requestedWorkspaceId &&
    !isDefaultWorkspaceAlias &&
    !requestedWorkspace &&
    !workspaceLoading &&
    authorityWorkspacesReady
      ? { kind: 'missing', workspace: requestedWorkspaceId }
      : workspaceError?.kind === 'missing' &&
          (routeWorkspace || routeWorkspaceId === 'default' || requestedWorkspace || isDefaultWorkspaceAlias)
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
  const modelsHref = token ? workspaceModelsHref(modelWorkspace ?? effectiveActiveWorkspace, workspaces) : '/models/';
  const modelWorkspaceId =
    modelWorkspace && modelWorkspace.organization_id === modelOrganizationId ? modelWorkspace.id : undefined;

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
  }, [token, authorityKey, workspaceLoadRevision, latestIdentityRef]);

  const reloadWorkspaces = useCallback(() => setWorkspaceLoadRevision(value => value + 1), []);

  const selectWorkspace = useCallback(
    (next: Workspace) => {
      if (!usesSelectedWorkspace && next.id === (routeWorkspace ?? effectiveActiveWorkspace)?.id) return;
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
      effectiveActiveWorkspace?.id,
      setSelectedOrganizationId,
    ],
  );

  const selectOrganization = useCallback(
    (next: Organization) => {
      if (!organizations.some(item => item.id === next.id)) return;
      setOrganizationSwitchError('');
      if (session?.kind === 'operator' && session.operator?.organization_id !== next.id) {
        if (orgSwitchRequest.current) return;
        orgSwitchRequest.current = true;
        setOrganizationSwitching(true);
        const revision = connectionRevision.current;
        void (async () => {
          try {
            const response = await fetch('/api/v1/session/organization', {
              method: 'PUT',
              headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
              body: JSON.stringify({ organization: next.slug || next.id }),
            });
            if (revision !== connectionRevision.current) return;
            if (!response.ok) {
              setOrganizationSwitchError(
                response.status === 404 || response.status === 403
                  ? t('This organization is no longer available to your account.', '您的账户已无法访问该组织。')
                  : t('Could not switch organization. Try again.', '切换组织失败，请重试。'),
              );
              if (response.status === 401 || response.status === 403 || response.status === 404) {
                setWorkspaceLoadRevision(value => value + 1);
                void refreshWorkspace();
              }
              return;
            }
            const nextSession = ((await response.json()) as { data: AdminSession }).data;
            if (revision !== connectionRevision.current) return;
            const nextPrincipalKey = buildSessionPrincipalKey(token, nextSession);
            const nextAuthorityKey = buildSessionAuthorityKey(token, nextSession);
            abortModels();
            syncAuthorityImmediate(nextAuthorityKey);
            lastSyncedOrgParamRef.current = next.slug ?? next.id;
            setSelectedOrgState({ principalKey: nextPrincipalKey, id: next.id });
            setWorkspacesLoadedFor('');
            setWorkspaces([]);
            setWorkspace(null);
            setWorkspaceError(null);
            setWorkspaceLoading(true);
            resetModels(true);
            setSession(nextSession);
            try {
              window.localStorage.removeItem('niu.active-workspace');
              window.localStorage.setItem('niu.auth.org-switch', `${next.id}:${Date.now()}`);
            } catch {
              /* Storage is optional. */
            }
            const curLoc = workspaceNavigation.current.location;
            if (curLoc.pathname.startsWith('/workspaces/')) {
              const parts = curLoc.pathname.split('/').filter(Boolean);
              const currentSection = parts.slice(2).join('/');
              const keyDetail = currentSection.startsWith('keys/') && currentSection !== 'keys/new';
              const nestedPath = keyDetail ? 'keys' : currentSection;
              const nextSearch = new URLSearchParams(curLoc.search);
              nextSearch.delete('keyId');
              nextSearch.delete('workspace');
              if (nextSearch.has('organization') && next.slug) nextSearch.set('organization', next.slug);
              navigate(
                {
                  pathname: `/workspaces/default${nestedPath ? `/${nestedPath}` : '/'}`,
                  search: nextSearch.toString() ? `?${nextSearch.toString()}` : '',
                  hash: '',
                },
                { replace: true },
              );
            } else {
              const nextSearch = new URLSearchParams(curLoc.search);
              nextSearch.delete('workspace');
              if (nextSearch.has('organization') && next.slug) nextSearch.set('organization', next.slug);
              navigate(
                {
                  pathname: curLoc.pathname,
                  search: nextSearch.toString() ? `?${nextSearch.toString()}` : '',
                  hash: curLoc.hash,
                },
                { replace: true },
              );
            }
          } catch {
            if (revision === connectionRevision.current) {
              setOrganizationSwitchError(t('Could not switch organization. Try again.', '切换组织失败，请重试。'));
            }
          } finally {
            orgSwitchRequest.current = false;
            setOrganizationSwitching(false);
          }
        })();
        return;
      }
      setSelectedOrganizationId(next.id);
      const firstWorkspace = workspaces.find(item => item.organization_id === next.id);
      // Settings is a scoped product area, not a workspace destination. Keep
      // the user on the same Settings section and express the organization
      // explicitly instead of navigating into the new organization's first
      // workspace. Member workspace scope remains an explicit query choice.
      const stayOnSettings = () => {
        const nextSearch = new URLSearchParams(location.search);
        nextSearch.delete('workspace');
        nextSearch.set('organization', next.slug || next.id);
        const search = nextSearch.toString();
        navigate(
          { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash },
          { replace: true },
        );
      };
      if (settingsArea) {
        setWorkspace(firstWorkspace ?? null);
        setWorkspaceError(null);
        stayOnSettings();
      } else if (firstWorkspace) {
        selectWorkspace(firstWorkspace);
      } else {
        setWorkspace(null);
        setWorkspaceError(null);
        navigate('/workspaces/default/', { replace: true });
      }
    },
    [
      organizations,
      workspaces,
      selectWorkspace,
      navigate,
      session,
      token,
      isZh,
      t,
      refreshWorkspace,
      setSelectedOrganizationId,
      connectionRevision,
      abortModels,
      syncAuthorityImmediate,
      resetModels,
      setSession,
      settingsArea,
      location.pathname,
      location.search,
      location.hash,
    ],
  );
  const selectOrganizationRef = useRef(selectOrganization);
  selectOrganizationRef.current = selectOrganization;

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
      const body = (await response.json().catch(() => null)) as
        | (Workspace & { error?: { message?: string } })
        | null;
      if (!response.ok || !body) {
        throw new Error(body?.error?.message ?? formatLocalizedMessage('Could not create workspace ({0}).', [response.status], readLocale()));
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

  /**
   * Apply a rename that a route action has already confirmed with the API.
   * Keep the confirmed result application separate from the mutation so the
   * fetcher remains the only network path and stale results can be ignored by
   * workspace id.
   */
  const applyWorkspaceRename = useCallback(
    (workspaceId: string, name: string) => {
      const current = workspaceNavigation.current;
      const target = current.workspaces.find(item => item.id === workspaceId);
      if (!target) return;
      const renamed = { ...target, name };
      const updated = current.workspaces.map(item => (item.id === workspaceId ? renamed : item));
      primeQuery(token, '/api/v1/workspaces', { data: updated }, { persist: true });
      setWorkspaces(previous => previous.map(item => (item.id === workspaceId ? renamed : item)));
      setWorkspace(prev => (prev?.id === workspaceId ? renamed : prev));
      setWorkspaceError(null);
      if (current.routeWorkspace?.id === workspaceId) {
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
    [token, navigate, connectionRevision],
  );

  const createOrganization = useCallback(
    async (
      name: string,
      slug?: string,
      initialWorkspaceName?: string,
      idempotencyKey?: string,
    ): Promise<Organization> => {
      if (!token) throw new Error(t('Sign in before creating an organization.', '请先登录再创建组织。'));
      const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      };
      if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
      const response = await fetch('/api/v1/organizations', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: name.trim(),
          ...(slug ? { slug: slug.trim() } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | (Organization & { error?: { message?: string } })
        | null;
      if (!response.ok || !body || !body.id) {
        throw new Error(
          body?.error?.message ??
            formatLocalizedMessage('Could not create organization ({0}).', [response.status], readLocale()),
        );
      }
      const createdOrg: Organization = {
        id: body.id,
        name: body.name ?? name.trim(),
        ...(body.slug ? { slug: body.slug } : slug ? { slug: slug.trim() } : {}),
      };
      setOrganizations(previous => {
        const next = previous.some(item => item.id === createdOrg.id)
          ? previous.map(item => (item.id === createdOrg.id ? createdOrg : item))
          : [...previous, createdOrg];
        primeQuery(token, '/api/v1/organizations', { data: next }, { persist: true });
        return next;
      });
      if (session?.kind === 'operator') {
        const switchResp = await fetch('/api/v1/session/organization', {
          method: 'PUT',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ organization: createdOrg.slug || createdOrg.id }),
        });
        if (switchResp.ok) {
          const nextSession = ((await switchResp.json()) as { data: AdminSession }).data;
          const nextPrincipalKey = buildSessionPrincipalKey(token, nextSession);
          const nextAuthorityKey = buildSessionAuthorityKey(token, nextSession);
          abortModels();
          syncAuthorityImmediate(nextAuthorityKey);
          lastSyncedOrgParamRef.current = createdOrg.slug ?? createdOrg.id;
          setSelectedOrgState({ principalKey: nextPrincipalKey, id: createdOrg.id });
          setWorkspacesLoadedFor('');
          setWorkspaces([]);
          setWorkspace(null);
          setWorkspaceError(null);
          setWorkspaceLoading(true);
          resetModels(true);
          setSession(nextSession);
          try {
            window.localStorage.removeItem('niu.active-workspace');
            window.localStorage.setItem('niu.auth.org-switch', `${createdOrg.id}:${Date.now()}`);
          } catch {
            /* Storage is optional. */
          }
        } else {
          setSelectedOrganizationId(createdOrg.id);
        }
      } else {
        lastSyncedOrgParamRef.current = createdOrg.slug ?? createdOrg.id;
        setSelectedOrganizationId(createdOrg.id);
      }

      const wsName = initialWorkspaceName?.trim();
      if (wsName) {
        try {
          const wsResp = await fetch('/api/v1/workspaces', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
              ...(idempotencyKey ? { 'idempotency-key': `${idempotencyKey}-ws` } : {}),
            },
            body: JSON.stringify({
              name: wsName,
              organization_id: createdOrg.id,
            }),
          });
          if (wsResp.ok) {
            const wsBody = (await wsResp.json()) as Workspace;
            const createdWs: Workspace = {
              ...wsBody,
              organization_id: createdOrg.id,
              organization_name: createdOrg.name,
            };
            setWorkspaces(previous => {
              const next = [...previous.filter(w => w.id !== createdWs.id), createdWs];
              primeQuery(token, '/api/v1/workspaces', { data: next }, { persist: true });
              return next;
            });
            setWorkspaceLoadRevision(value => value + 1);
            selectWorkspace(createdWs);
            return createdOrg;
          }
        } catch {
          /* Fall back to organization settings when initial workspace creation requires setup. */
        }
      }
      setWorkspace(null);
      setWorkspaceError(null);
      setWorkspaceLoadRevision(value => value + 1);
      navigate(
        {
          pathname: '/settings/organization',
          search: createdOrg.slug ? `?organization=${encodeURIComponent(createdOrg.slug)}` : '',
        },
        { replace: true },
      );
      return createdOrg;
    },
    [
      token,
      isZh,
      t,
      session?.kind,
      setSelectedOrganizationId,
      selectWorkspace,
      navigate,
      abortModels,
      syncAuthorityImmediate,
      resetModels,
      setSession,
    ],
  );

  const renameOrganization = useCallback(
    async (target: Organization, name: string): Promise<Organization> => {
      const result = await request<{ id: string; name: string; slug?: string }>(
        token,
        `/api/v1/organizations/${target.id}`,
        'PATCH',
        { name: name.trim() },
      );
      if (result.id !== target.id || typeof result.name !== 'string' || !result.name.trim()) {
        throw new Error(
          t('Could not confirm the organization name. Reload before retrying.', '无法确认组织名称，请刷新后重试。'),
        );
      }
      const renamed: Organization = {
        ...target,
        name: result.name,
        ...(result.slug ? { slug: result.slug } : {}),
      };
      setOrganizations(previous => {
        const next = previous.map(item => (item.id === target.id ? renamed : item));
        primeQuery(token, '/api/v1/organizations', { data: next }, { persist: true });
        return next;
      });
      setWorkspaces(previous => {
        const next = previous.map(item =>
          item.organization_id === target.id ? { ...item, organization_name: renamed.name } : item,
        );
        primeQuery(token, '/api/v1/workspaces', { data: next }, { persist: true });
        return next;
      });
      setWorkspace(prev =>
        prev?.organization_id === target.id ? { ...prev, organization_name: renamed.name } : prev,
      );
      return renamed;
    },
    [token, isZh, t],
  );

  const joinOrganization = useCallback(
    async (inviteToken: string): Promise<AdminSession> => {
      const response = await fetch('/api/v1/session/memberships', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ token: inviteToken.trim() }),
      });
      const body = (await response.json().catch(() => null)) as
        | { data?: AdminSession; error?: { message?: string } }
        | null;
      if (!response.ok || !body?.data) {
        throw new Error(
          body?.error?.message ??
            t(
              'Could not link this organization access token. Check that the token is active and try again.',
              '无法绑定该组织访问令牌，请确认令牌有效后重试。',
            ),
        );
      }
      const nextSession = body.data;
      const nextPrincipalKey = buildSessionPrincipalKey(token, nextSession);
      const nextAuthorityKey = buildSessionAuthorityKey(token, nextSession);
      abortModels();
      syncAuthorityImmediate(nextAuthorityKey);
      setSelectedOrgState({
        principalKey: nextPrincipalKey,
        id: nextSession.operator?.organization_id ?? null,
      });
      setWorkspacesLoadedFor('');
      setOrganizations([]);
      setWorkspaces([]);
      setWorkspace(null);
      setWorkspaceError(null);
      setWorkspaceLoading(true);
      resetModels(true);
      setSession(nextSession);
      setWorkspaceLoadRevision(value => value + 1);
      try {
        window.localStorage.removeItem('niu.active-workspace');
        window.localStorage.setItem(
          'niu.auth.org-switch',
          `${nextSession.operator?.organization_id ?? ''}:${Date.now()}`,
        );
      } catch {
        /* Storage is optional. */
      }
      navigate('/workspaces/default/', { replace: true });
      return nextSession;
    },
    [token, isZh, t, navigate, abortModels, syncAuthorityImmediate, resetModels, setSession],
  );

  const acceptInvitation = useCallback(
    async (invitationToken: string): Promise<AdminSession> => {
      const accepted = await acceptMemberInvitation(token, invitationToken.trim());
      const nextSession = accepted.data;
      const nextPrincipalKey = buildSessionPrincipalKey(token, nextSession);
      const nextAuthorityKey = buildSessionAuthorityKey(token, nextSession);
      abortModels();
      syncAuthorityImmediate(nextAuthorityKey);
      setSelectedOrgState({
        principalKey: nextPrincipalKey,
        id: nextSession.operator?.organization_id ?? null,
      });
      setWorkspacesLoadedFor('');
      setOrganizations([]);
      setWorkspaces([]);
      setWorkspace(null);
      setWorkspaceError(null);
      setWorkspaceLoading(true);
      resetModels(true);
      setSession(nextSession);
      setWorkspaceLoadRevision(value => value + 1);
      try {
        window.localStorage.removeItem('niu.active-workspace');
        window.localStorage.setItem(
          'niu.auth.org-switch',
          `${nextSession.operator?.organization_id ?? ''}:${Date.now()}`,
        );
      } catch {
        /* Storage is optional. */
      }
      const destination = accepted.invitation.project_slug
        ? `/workspaces/${encodeURIComponent(accepted.invitation.project_slug)}/`
        : '/workspaces/default/';
      navigate(destination, { replace: true });
      return nextSession;
    },
    [token, navigate, abortModels, syncAuthorityImmediate, resetModels, setSession],
  );

  useEffect(() => {
    if (!token || workspaceLoading || !authorityWorkspacesReady) return;
    const requestedOrgParam = new URLSearchParams(location.search).get('organization');
    if (!requestedOrgParam) {
      lastSyncedOrgParamRef.current = null;
    } else if (
      organizations.length > 0 &&
      !organizationSwitching &&
      lastSyncedOrgParamRef.current !== requestedOrgParam
    ) {
      const matchedOrg = organizations.find(
        item => item.slug === requestedOrgParam || item.id === requestedOrgParam,
      );
      lastSyncedOrgParamRef.current = requestedOrgParam;
      const currentOrgId = selectedOrganizationId ?? session?.operator?.organization_id ?? organizations[0]?.id;
      if (matchedOrg && matchedOrg.id !== currentOrgId) {
        selectOrganizationRef.current(matchedOrg);
        return;
      }
    }
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
        navigate(
          { pathname: location.pathname, search: `?${search.toString()}`, hash: location.hash },
          { replace: true },
        );
      }
    } else {
      setWorkspace(null);
      const missingTarget =
        (requestedWorkspaceId && requestedWorkspaceId !== 'default' ? requestedWorkspaceId : null) ||
        (routeWorkspaceId && routeWorkspaceId !== 'default' ? routeWorkspaceId : null);
      if (!missingTarget) {
        setWorkspaceError(prev => (prev?.kind === 'missing' ? null : prev));
      } else {
        const setMissingWorkspace = (target: string) => {
          setWorkspaceError(prev =>
            prev?.kind === 'missing' && prev.workspace === target ? prev : { kind: 'missing', workspace: target },
          );
        };
        const resolutionKey = `${authorityKey}:${missingTarget}`;
        if (
          session?.kind === 'operator' &&
          organizations.length > 1 &&
          crossOrgResolvedRef.current !== resolutionKey &&
          !organizationSwitching
        ) {
          crossOrgResolvedRef.current = resolutionKey;
          void fetch(`/api/v1/workspaces/by-route/${encodeURIComponent(missingTarget)}`, {
            headers: { authorization: `Bearer ${token}` },
          })
            .then(async resp => {
              if (!resp.ok) {
                setMissingWorkspace(missingTarget);
                return;
              }
              const resolved = (await resp.json()) as { id: string; slug: string; organization_id: string };
              const targetOrg = organizations.find(item => item.id === resolved.organization_id);
              if (targetOrg && targetOrg.id !== session.operator?.organization_id) {
                selectOrganizationRef.current(targetOrg);
              } else {
                setMissingWorkspace(missingTarget);
              }
            })
            .catch(() => {
              setMissingWorkspace(missingTarget);
            });
        } else {
          setMissingWorkspace(missingTarget);
        }
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
    session?.kind,
    session?.operator?.organization_id,
    session?.operator?.project_id,
    organizations,
    organizationSwitching,
    authorityKey,
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

  const resetWorkspacesForSignOut = useCallback(() => {
    setChatKeys([]);
    setChatKeysPrincipal('');
    setOrganizations([]);
    setWorkspaces([]);
    setWorkspace(null);
    setSelectedOrgState({ principalKey: '', id: null });
    setWorkspaceError(null);
    setWorkspaceLoading(false);
    setWorkspacesLoadedFor('');
  }, []);

  const resetWorkspacesForAuthorityChange = useCallback(() => {
    setWorkspacesLoadedFor('');
    setOrganizations([]);
    setWorkspaces([]);
    setWorkspace(null);
    setWorkspaceError(null);
    setWorkspaceLoading(true);
  }, []);

  const resetWorkspacesForPrincipalChange = useCallback((nextPrincipalKey: string) => {
    setChatKeys([]);
    setChatKeysPrincipal(nextPrincipalKey);
    setSelectedOrgState({ principalKey: nextPrincipalKey, id: null });
  }, []);

  const bumpWorkspaceRevisionOnRecovery = useCallback(() => {
    setWorkspaceLoadRevision(value => value + 1);
  }, []);

  const getWorkspaceNavigation = useCallback(() => workspaceNavigation.current, []);
  const getWorkspaceError = useCallback(() => workspaceError, [workspaceError]);

  // Global product areas keep the selected workspace as context. Resolve the
  // organization from that workspace when no explicit organization choice was
  // made, so leaving a workspace route for Settings does not silently change
  // the organization being viewed.
  const workspaceOrganizationId = usesSelectedWorkspace ? selectedWorkspace?.organization_id : undefined;
  const activeOrganization =
    organizations.find(
      item =>
        item.id === (
          routeWorkspace?.organization_id ??
          selectedOrganizationId ??
          workspaceOrganizationId ??
          session?.operator?.organization_id
        ),
    ) ??
    organizations[0] ??
    null;

  return {
    organizations,
    organization: activeOrganization,
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
    routeWorkspace,
    selectedOrganizationId,
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
  };
}
