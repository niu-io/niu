import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardContext } from '@/shell/dashboard-context';
import { keyRequest, workspaceKeyPath, type ProjectKey } from '@/features/keys/api';
import { NiuAPIError } from '@niu-io/sdk';
import { type MediaAssetGroup, type MediaAsset, type MediaAssetOperation } from '@niu-io/sdk/media-assets';
import { NiuAdminClient, type NativeProviderModule } from '@niu-io/sdk/admin';
import type { MediaVerificationSession } from '@niu-io/sdk/media-verification';
import type { WorkspaceAsset, WorkspaceAssetKind } from '@niu-io/sdk/workspace-assets';

const REFERENCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isKeyIpRestrictedError(error: unknown): boolean {
  if (error instanceof NiuAPIError) {
    if (error.gatewayCode === 'key_ip_not_allowed') return true;
    const type = (error.responseBody as { error?: { type?: unknown } } | null)?.error?.type;
    if (type === 'key_ip_not_allowed') return true;
  }
  return error instanceof Error && /does not allow the request source address/i.test(error.message);
}

async function allPages<T>(read: (after?: string) => Promise<{ data: T[]; next_cursor: string | null }>) {
  const rows: T[] = [];
  const cursors = new Set<string>();
  let after: string | undefined;
  do {
    const page = await read(after);
    rows.push(...page.data);
    after = page.next_cursor ?? undefined;
    if (after && cursors.has(after)) throw new Error('Could not finish loading materials.');
    if (after) cursors.add(after);
  } while (after);
  return { data: rows };
}

export type NativeMaterialsContext = { keyId: string; model: string };

export type NativeContextChoice = { keyId: string; keyName: string; module: NativeProviderModule };

/**
 * The caller may omit or partially specify a context. Discovery resolves one
 * capable default, and only fully explicit key/model pairs are respected as-is.
 */
export function useMaterials(
  preferredModel?: string,
  nativeContext?: NativeMaterialsContext,
  selection?: NativeMaterialsContext,
  options?: { discoveryOnly?: boolean },
) {
  const discoveryOnly = options?.discoveryOnly === true;
  const context = useDashboardContext();
  const workspace = context.workspace;
  const [revision, setRevision] = useState(0);
  const requested = nativeContext ?? selection;
  const requestedKeyId = requested?.keyId ?? '';
  const requestedModel = requested?.model ?? '';
  const discoveryIdentity = JSON.stringify([context.token, workspace?.organization_id, workspace?.id]);
  const [discovery, setDiscovery] = useState<{
    identity: string;
    loading: boolean;
    keys: ProjectKey[];
    choices: NativeContextChoice[];
    ipRestrictedKeyIds: string[];
    errors: string[];
  }>({ identity: '', loading: true, keys: [], choices: [], ipRestrictedKeyIds: [], errors: [] });
  const [nativeIpRestricted, setNativeIpRestricted] = useState(false);
  const discoveryReady = discovery.identity === discoveryIdentity;

  /** Stable list order keeps default selection deterministic across parallel discovery. */
  const orderedChoices = useMemo(() => {
    if (!discoveryReady) return [];
    const order = new Map(discovery.keys.map((key, index) => [key.id, index]));
    return [...discovery.choices].sort(
      (a, b) =>
        (order.get(a.keyId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.keyId) ?? Number.MAX_SAFE_INTEGER) ||
        a.module.model_alias.localeCompare(b.module.model_alias),
    );
  }, [discoveryReady, discovery.keys, discovery.choices]);

  const usableChoices = useMemo(() => {
    if (!discoveryReady) return [];
    const active = new Set(discovery.keys.filter(key => !key.revoked && !key.expired).map(key => key.id));
    return orderedChoices.filter(
      choice => active.has(choice.keyId) && !discovery.ipRestrictedKeyIds.includes(choice.keyId),
    );
  }, [discoveryReady, discovery.keys, discovery.ipRestrictedKeyIds, orderedChoices]);

  const selectedKeyRecord = useMemo(
    () =>
      discoveryReady && requestedKeyId
        ? discovery.keys.find(
            key => key.id === requestedKeyId || (Boolean(key.slug) && key.slug === requestedKeyId),
          )
        : undefined,
    [discoveryReady, discovery.keys, requestedKeyId],
  );

  /** Effective context: an explicit capable pair wins; otherwise fill only what is missing. */
  const resolvedSelection = useMemo<NativeMaterialsContext | null>(() => {
    if (nativeContext) return nativeContext;
    if (!discoveryReady) return { keyId: requestedKeyId, model: requestedModel };
    if (selectedKeyRecord) {
      if (
        requestedModel &&
        orderedChoices.some(
          choice =>
            choice.keyId === selectedKeyRecord.id && choice.module.model_alias === requestedModel,
        )
      ) {
        return { keyId: selectedKeyRecord.id, model: requestedModel };
      }
      if (!requestedModel) {
        const first = orderedChoices.find(choice => choice.keyId === selectedKeyRecord.id);
        if (first) return { keyId: selectedKeyRecord.id, model: first.module.model_alias };
      }
      return { keyId: selectedKeyRecord.id, model: requestedModel };
    }
    if (requestedModel) {
      const matched = usableChoices.find(choice => choice.module.model_alias === requestedModel);
      if (matched) return { keyId: matched.keyId, model: requestedModel };
    }
    const preferred = preferredModel
      ? usableChoices.find(choice => choice.module.model_alias === preferredModel)
      : undefined;
    const fallback = preferred ?? usableChoices[0];
    return fallback
      ? { keyId: fallback.keyId, model: fallback.module.model_alias }
      : { keyId: requestedKeyId, model: requestedModel };
  }, [nativeContext, discoveryReady, requestedKeyId, requestedModel, selectedKeyRecord, orderedChoices, usableChoices, preferredModel]);

  const resolvedKeyId = resolvedSelection?.keyId ?? '';
  const resolvedModel = resolvedSelection?.model ?? '';
  const resolvedKey = discoveryReady
    ? discovery.keys.find(key => key.id === resolvedKeyId)
    : undefined;
  const resolvedKeyRef = resolvedKey?.slug || resolvedKeyId;

  /** A one-time URL hint when discovery filled a context the caller did not specify. */
  const autoSelection = useMemo(() => {
    if (nativeContext || !discoveryReady || !resolvedKeyId) return null;
    if (resolvedKeyRef === (selectedKeyRecord?.slug || requestedKeyId) && resolvedModel === requestedModel)
      return null;
    return { keyId: resolvedKeyRef, model: resolvedModel };
  }, [nativeContext, discoveryReady, resolvedKeyId, resolvedKeyRef, selectedKeyRecord, requestedKeyId, resolvedModel, requestedModel]);

  const identity = JSON.stringify([
    context.token,
    context.session?.operator?.id ?? context.session?.kind,
    workspace?.organization_id,
    workspace?.id,
    preferredModel,
    resolvedKeyId,
    resolvedModel,
  ]);
  const liveIdentity = useRef(identity);
  liveIdentity.current = identity;
  const [binding, setBinding] = useState<{
    identity: string;
    model: string;
    keyId: string;
    module: NativeProviderModule;
  } | null>(null);
  const reloadController = useRef<AbortController | null>(null);
  const [groups, setGroups] = useState<MediaAssetGroup[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [sessions, setSessions] = useState<MediaVerificationSession[]>([]);
  const [group, setGroup] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const admin = useMemo(
    () =>
      new NiuAdminClient({
        adminToken: context.token,
        baseURL: new URL('/api/v1', window.location.origin).href,
      }),
    [context.token],
  );

  useEffect(() => {
    if (nativeContext) return;
    const controller = new AbortController();
    setDiscovery({ identity: discoveryIdentity, loading: true, keys: [], choices: [], ipRestrictedKeyIds: [], errors: [] });
    if (!workspace) {
      setDiscovery({ identity: discoveryIdentity, loading: false, keys: [], choices: [], ipRestrictedKeyIds: [], errors: [] });
      return () => controller.abort();
    }
    void (async () => {
      const page = await allPages(after =>
        keyRequest<{ data: ProjectKey[]; next_cursor: string | null }>(
          context.token,
          workspaceKeyPath(workspace.id) + '?limit=100' + (after ? '&after=' + encodeURIComponent(after) : ''),
          'GET',
          undefined,
          controller.signal,
        ),
      );
      const keys = page.data;
      const queue = [...keys];
      const choices: NativeContextChoice[] = [];
      const ipRestrictedKeyIds: string[] = [];
      const errors: string[] = [];
      await Promise.all(
        Array.from({ length: Math.min(4, queue.length) }, async () => {
          while (queue.length && !controller.signal.aborted) {
            const key = queue.shift()!;
            if (key.revoked || key.expired) continue;
            try {
              const found = await admin
                .dashboardMedia({ organizationId: workspace.organization_id, projectId: workspace.id }, key.id)
                .capabilities(undefined, { signal: controller.signal });
              if (!found.complete) throw new Error('Native tool discovery did not complete.');
              const modules = found.modules.filter(module => module.module === 'volcengine');
              const ambiguous = modules.filter(
                module => modules.filter(candidate => candidate.model_alias === module.model_alias).length !== 1,
              );
              if (ambiguous.length)
                errors.push(`${key.name}: ambiguous model/account contexts cannot be selected by this API.`);
              choices.push(
                ...modules
                  .filter(module => !ambiguous.includes(module))
                  .map(module => ({ keyId: key.id, keyName: key.name, module })),
              );
            } catch (caught) {
              if (!controller.signal.aborted) {
                if (isKeyIpRestrictedError(caught)) ipRestrictedKeyIds.push(key.id);
                else
                  errors.push(
                    `${key.name}: ${caught instanceof Error ? caught.message : 'Discovery failed.'}`,
                  );
              }
            }
          }
        }),
      );
      if (!controller.signal.aborted)
        setDiscovery({ identity: discoveryIdentity, loading: false, keys, choices, ipRestrictedKeyIds, errors });
    })().catch(caught => {
      if (!controller.signal.aborted)
        setDiscovery({
          identity: discoveryIdentity,
          loading: false,
          keys: [],
          choices: [],
          ipRestrictedKeyIds: [],
          errors: [caught instanceof Error ? caught.message : 'Native tool discovery failed.'],
        });
    });
    return () => controller.abort();
  }, [discoveryIdentity, admin, revision, Boolean(nativeContext)]);

  const discoveryPending = !nativeContext && (discovery.identity !== discoveryIdentity || discovery.loading);
  const client = useMemo(
    () =>
      binding?.identity === identity && workspace
        ? admin.dashboardMedia({ organizationId: workspace.organization_id, projectId: workspace.id }, binding.keyId)
        : null,
    [binding, identity, admin, workspace?.organization_id, workspace?.id],
  );

  /** Workspace-scoped operation reads keep status recovery available after key revocation. */
  const historyClient = useMemo(
    () =>
      workspace && resolvedKeyId && resolvedModel && REFERENCE_PATTERN.test(resolvedKeyId)
        ? admin.mediaOperationHistory(
            { organizationId: workspace.organization_id, projectId: workspace.id },
            { keyId: resolvedKeyId, model: resolvedModel },
          )
        : null,
    [admin, workspace?.organization_id, workspace?.id, resolvedKeyId, resolvedModel],
  );

  const workspaceScope = useMemo(
    () =>
      workspace
        ? { organizationId: workspace.organization_id, projectId: workspace.id }
        : null,
    [workspace?.organization_id, workspace?.id],
  );
  const listWorkspaceAssets = useCallback(
    async (kind: WorkspaceAssetKind): Promise<WorkspaceAsset[]> => {
      if (!workspaceScope) return [];
      return (
        await allPages(after =>
          admin.listWorkspaceAssets(workspaceScope, { kind, limit: 100, after }),
        )
      ).data;
    },
    [admin, workspaceScope],
  );
  const uploadWorkspaceAsset = useCallback(
    async (input: { name: string; contentType: string; bytes: Uint8Array }): Promise<WorkspaceAsset> => {
      if (!workspaceScope) throw new Error('Select a workspace before uploading media.');
      return (await admin.uploadWorkspaceAsset(workspaceScope, input)).data;
    },
    [admin, workspaceScope],
  );
  const downloadWorkspaceAsset = useCallback(
    async (id: string): Promise<ArrayBuffer> => {
      if (!workspaceScope) throw new Error('Select a workspace before reading media.');
      return admin.downloadWorkspaceAsset(workspaceScope, id);
    },
    [admin, workspaceScope],
  );

  const retrieveOperation = useCallback(
    async (id: string, keyId = resolvedKeyId, model = resolvedModel): Promise<MediaAssetOperation> => {
      const client =
        workspace && REFERENCE_PATTERN.test(keyId) && model
          ? admin.mediaOperationHistory(
              { organizationId: workspace.organization_id, projectId: workspace.id },
              { keyId, model },
            )
          : historyClient;
      if (!client) throw new Error('Operation status is unavailable for this context.');
      return (await client.retrieve(id)).data;
    },
    [admin, historyClient, resolvedKeyId, resolvedModel, workspace?.organization_id, workspace?.id],
  );

  useEffect(() => () => reloadController.current?.abort(), [client, group]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setBinding(null);
    setGroups([]);
    setAssets([]);
    setSessions([]);
    setGroup('');
    setError('');
    setNativeIpRestricted(false);
    if (!workspace || discoveryOnly) {
      setLoading(false);
      return;
    }
    void (async () => {
      if (!resolvedKeyId || !resolvedModel || discoveryPending) return;
      if (!nativeContext) {
        const selectedKey = discovery.keys.find(key => key.id === resolvedKeyId);
        if (!selectedKey) throw new Error('The selected API key is not in this workspace.');
        if (selectedKey.revoked || selectedKey.expired || discovery.ipRestrictedKeyIds.includes(selectedKey.id))
          return;
        const choices = discovery.choices.filter(
          choice => choice.keyId === resolvedKeyId && choice.module.model_alias === resolvedModel,
        );
        if (choices.length !== 1)
          throw new Error(
            choices.length > 1
              ? 'This model has ambiguous native contexts; no account was selected.'
              : 'The selected model has no discovered native tools. Check discovery errors or choose a supported model.',
          );
      }
      const api = admin.dashboardMedia(
        { organizationId: workspace.organization_id, projectId: workspace.id },
        resolvedKeyId,
      );
      const capabilities = await api.capabilities(resolvedModel, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const modules = capabilities.modules.filter(
        module => module.module === 'volcengine' && module.model_alias === resolvedModel,
      );
      if (!capabilities.complete || modules.length !== 1)
        throw new Error(
          modules.length > 1
            ? 'This model has ambiguous native contexts; no account was selected.'
            : 'This model has no native Provider tools.',
        );
      const page = await allPages(after =>
        api.groups.list({ model: resolvedModel, limit: 100, after }, { signal: controller.signal }),
      );
      if (controller.signal.aborted) return;
      setBinding({ identity, keyId: resolvedKeyId, model: resolvedModel, module: modules[0] });
      setGroups(page.data);
      setGroup(page.data.find(record => record.status !== 'deleted')?.id ?? '');
    })()
      .catch(caught => {
        if (!controller.signal.aborted) {
          if (isKeyIpRestrictedError(caught)) setNativeIpRestricted(true);
          else setError(caught.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [identity, admin, revision, discoveryPending, discovery, resolvedKeyId, resolvedModel, Boolean(nativeContext), discoveryOnly]);

  async function reload() {
    if (!client || !binding || binding.identity !== identity) return;
    reloadController.current?.abort();
    const controller = new AbortController();
    reloadController.current = controller;
    try {
      const [g, s] = await Promise.all([
        allPages(after =>
          client.groups.list({ model: binding.model, limit: 100, after }, { signal: controller.signal }),
        ),
        allPages(after =>
          client.verification.list({ model: binding.model, limit: 100, after }, { signal: controller.signal }),
        ),
      ]);
      if (controller.signal.aborted || liveIdentity.current !== identity) return;
      const activeGroups = g.data.filter(record => record.status !== 'deleted');
      const nextGroup = activeGroups.find(record => record.id === group)?.id ?? activeGroups[0]?.id ?? '';
      setGroups(g.data);
      setSessions(s.data);
      if (nextGroup !== group) setGroup(nextGroup);
      if (nextGroup) {
        const a = await allPages(after =>
          client.assets.list(
            { model: binding.model, group_id: nextGroup, limit: 100, after },
            { signal: controller.signal },
          ),
        );
        if (!controller.signal.aborted && liveIdentity.current === identity) setAssets(a.data);
      } else setAssets([]);
    } finally {
      if (reloadController.current === controller) reloadController.current = null;
    }
  }

  useEffect(() => {
    if (!client || !binding) return;
    const controller = new AbortController();
    setAssets([]);
    void Promise.all([
      allPages(after =>
        client.verification.list({ model: binding.model, limit: 100, after }, { signal: controller.signal }),
      ).then(page => {
        if (!controller.signal.aborted) setSessions(page.data);
      }),
      group
        ? allPages(after =>
            client.assets.list(
              { model: binding.model, group_id: group, limit: 100, after },
              { signal: controller.signal },
            ),
          ).then(page => {
            if (!controller.signal.aborted) setAssets(page.data);
          })
        : Promise.resolve(),
    ]).catch(caught => {
      if (!controller.signal.aborted) setError(caught.message);
    });
    return () => controller.abort();
  }, [client, group]);

  const contextKeys = useMemo(() => {
    if (!discoveryReady) return [];
    const hasActive = discovery.keys.some(key => !key.revoked && !key.expired);
    const visible = discovery.keys.filter(
      key =>
        (!key.revoked && !key.expired) ||
        key.id === resolvedKeyId ||
        (Boolean(key.slug) && key.slug === requestedKeyId) ||
        !hasActive,
    );
    return [...visible].sort((a, b) => {
      const rank = (key: ProjectKey) =>
        key.revoked || key.expired ? 2 : discovery.ipRestrictedKeyIds.includes(key.id) ? 1 : 0;
      return rank(a) - rank(b);
    });
  }, [discoveryReady, discovery.keys, discovery.ipRestrictedKeyIds, resolvedKeyId, requestedKeyId]);

  const ipRestrictedKeyIds = discoveryReady ? discovery.ipRestrictedKeyIds : [];
  const ipRestrictedKeys = useMemo(
    () => (discoveryReady ? discovery.keys.filter(key => discovery.ipRestrictedKeyIds.includes(key.id)) : []),
    [discoveryReady, discovery.keys, discovery.ipRestrictedKeyIds],
  );
  const selectedKeyIpRestricted = nativeContext
    ? nativeIpRestricted
    : Boolean(discoveryReady && resolvedKeyId && discovery.ipRestrictedKeyIds.includes(resolvedKeyId));

  return {
    workspace,
    workspaces: context.workspaces,
    resolvedKeyId,
    ipRestrictedKeyIds,
    ipRestrictedKeys,
    selectedKeyIpRestricted,
    listWorkspaceAssets,
    uploadWorkspaceAsset,
    downloadWorkspaceAsset,
    retrieveOperation,
    autoSelection,
    discoveryLoading: discoveryPending,
    contextKeys,
    contextChoices: discoveryReady ? discovery.choices : [],
    discoveryErrors: discoveryReady ? discovery.errors : [],
    selection: resolvedSelection,
    currentModule: binding?.identity === identity ? binding.module : undefined,
    retry: () => setRevision(value => value + 1),
    client,
    model: binding?.model,
    groups,
    assets,
    sessions,
    group,
    setGroup,
    error,
    setError,
    loading: discoveryOnly ? discoveryPending : loading || discoveryPending,
    reload,
    canWrite: context.session?.permissions.write === true,
  };
}
