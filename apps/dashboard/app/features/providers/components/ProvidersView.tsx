import { useLocale as useUILocale } from '@/shell/ui-locale';
import IntegrationSettings from './IntegrationSettings';
import { useProviderParams } from '@/shell/provider-route';
import { Link, useSearchParams } from 'react-router';
import { IconX as X } from "@tabler/icons-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ProviderLogo from '@/components/ProviderLogo';
import { connectionIdentity } from '@/lib/providers';
import { useCallback, useEffect, useRef, useState } from 'react';

import { IconPencil as Pencil } from "@tabler/icons-react";
import { IconPlugConnected as Router } from "@tabler/icons-react";
import { IconShieldExclamation as ShieldAlert } from "@tabler/icons-react";
import PageHeader from '@/components/PageHeader';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import type { AdminSession } from '@/shell/dashboard-context';
import { Button } from '@/components/ui/button';
import { cachedGet, peekCachedGet, ProviderRequestError, writeMayHaveCommitted, request, providerAdapterApiLabels, type ModelWrite, type ProviderDiscoveryEvidence, type ProviderCatalogModel, type ProviderModelCheck, type ProviderConnection, type ProviderModel, type ProviderConnectionWrite } from '../api';
import ProviderDirectory from './ProviderDirectory';
import ProviderEditor, { type ProviderConnectionCreate } from './ProviderEditor';
import ModelMappings from './ModelMappings';
import CredentialRequestLimit from './CredentialRequestLimit';
import CredentialCooldown from './CredentialCooldown';

export default function ProvidersView({ token, session, refreshWorkspace, catalogPath = '/models' }: {
  catalogPath?: string;
  token: string;
  session: AdminSession;
  refreshWorkspace: () => Promise<void>;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const [search] = useSearchParams();
  const { providerId: routeProviderId, supplierId: routeSupplierId } = useProviderParams();
  const routeScopedId = routeProviderId ?? routeSupplierId;
  const providerId = routeScopedId ?? search.get('provider') ?? search.get('supplier');
  const connectionsPath = '/api/v1/vendors' + (providerId ? '?supplier=' + encodeURIComponent(providerId) : '');
  const canManage = Boolean(session.permissions?.platform_admin || (session.kind === 'installation' && session.permissions?.manage_operators !== false));
  const initialConnections = canManage && token ? peekCachedGet<{ data: ProviderConnection[] }>(token, connectionsPath)?.data ?? null : null;
  const initialSelectedId = initialConnections?.[0]?.id ?? '';
  const initialModels = canManage && token && initialSelectedId
    ? peekCachedGet<{ data: ProviderModel[] }>(token, `/api/v1/vendors/${encodeURIComponent(initialSelectedId)}/models`)?.data ?? null
    : null;
  const [connections, setConnections] = useState<ProviderConnection[]>(() => initialConnections ?? []);
  const [selectedConnectionId, setSelectedConnectionId] = useState(initialSelectedId);
  const [models, setModels] = useState<ProviderModel[]>(() => initialModels ?? []);
  const [catalog, setCatalog] = useState<ProviderCatalogModel[]>([]);
  const [discovery, setDiscovery] = useState<ProviderDiscoveryEvidence | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [loadingConnections, setLoadingConnections] = useState(() => Boolean(canManage && token && !initialConnections));
  const [loadingModels, setLoadingModels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addingConnection, setAddingConnection] = useState(false);
  const [editingConnection, setEditingConnection] = useState(false);
  const [managingModels, setManagingModels] = useState(false);
  const [error, setError] = useState('');
  const authController = useRef<AbortController | null>(null);
  const authGeneration = useRef(0);
  const modelsController = useRef<AbortController | null>(null);
  const modelsGeneration = useRef(0);
  const catalogController = useRef<AbortController | null>(null);
  const catalogGeneration = useRef(0);
  const busyRef = useRef(false);
  const currentScope = useRef({ selectedConnectionId, token, canManage });
  currentScope.current = { selectedConnectionId, token, canManage };

  const selectedConnection = connections.find(connection => connection.id === selectedConnectionId) ?? null;

  const explainError = useCallback((reason: unknown) => {
    if (reason instanceof ProviderRequestError && reason.status === 401) {
      setError('This installation session is no longer valid. Rechecking permissions…');
      void refreshWorkspace();
      return;
    }
    if (reason instanceof ProviderRequestError && reason.status === 409) {
      setError('This record changed in another session. Refresh the list and try again.');
      return;
    }
    setError(reason instanceof Error ? reason.message : 'The request could not be completed.');
  }, [refreshWorkspace]);

  const reloadConnections = useCallback(async (signal?: AbortSignal, force = false) => {
    if (!canManage || !token) return;
    const controller = authController.current;
    const requestSignal = signal ?? controller?.signal;
    const generation = authGeneration.current;
    if (!requestSignal || requestSignal.aborted) return;
    const result = await cachedGet<{ data: ProviderConnection[] }>(token, connectionsPath, { signal: requestSignal, force });
    if (requestSignal.aborted || generation !== authGeneration.current || !currentScope.current.canManage || currentScope.current.token !== token) return;
    setConnections(result.data);
    setSelectedConnectionId(current => result.data.some(connection => connection.id === current) ? current : result.data[0]?.id ?? '');
    if (result.data.length > 0) setAddingConnection(false);
  }, [canManage, token, connectionsPath]);

  const reloadModels = useCallback(async (connectionId: string, signal?: AbortSignal, force = false) => {
    const generation = modelsGeneration.current;
    const controller = modelsController.current;
    const requestSignal = signal ?? controller?.signal;
    if (!canManage || !token || !requestSignal || requestSignal.aborted) return;
    const result = await cachedGet<{ data: ProviderModel[] }>(
      token,
      `/api/v1/vendors/${encodeURIComponent(connectionId)}/models`,
      { signal: requestSignal, force },
    );
    const scope = currentScope.current;
    if (requestSignal.aborted || generation !== modelsGeneration.current || !scope.canManage || scope.token !== token || scope.selectedConnectionId !== connectionId) return;
    setModels(result.data);
  }, [canManage, token]);

  useEffect(() => {
    const generation = ++authGeneration.current;
    authController.current?.abort();
    modelsController.current?.abort();
    modelsGeneration.current += 1;
    if (!canManage || !token) {
      setLoadingConnections(false);
      setLoadingModels(false);
      setConnections([]);
      setModels([]);
      setSelectedConnectionId('');
      setAddingConnection(false);
      setEditingConnection(false);
      setManagingModels(false);
      busyRef.current = false;
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    authController.current = controller;
    const cached = peekCachedGet<{ data: ProviderConnection[] }>(token, connectionsPath)?.data ?? null;
    if (cached) {
      setConnections(cached);
      setSelectedConnectionId(current => cached.some(connection => connection.id === current) ? current : cached[0]?.id ?? '');
      setLoadingConnections(false);
    } else {
      setLoadingConnections(true);
    }
    setError('');
    void cachedGet<{ data: ProviderConnection[] }>(token, connectionsPath, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted || generation !== authGeneration.current) return;
        setConnections(result.data);
        setSelectedConnectionId(current => result.data.some(connection => connection.id === current) ? current : result.data[0]?.id ?? '');
      })
      .catch(reason => {
        if (controller.signal.aborted || generation !== authGeneration.current) return;
        explainError(reason);
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === authGeneration.current) setLoadingConnections(false);
      });
    return () => {
      controller.abort();
      if (authController.current === controller) authController.current = null;
      authGeneration.current += 1;
      modelsController.current?.abort();
      modelsController.current = null;
      modelsGeneration.current += 1;
      busyRef.current = false;
      setBusy(false);
    };
  }, [canManage, token, explainError, connectionsPath]);

  useEffect(() => {
    modelsController.current?.abort();
    modelsController.current = null;
    const generation = ++modelsGeneration.current;
    if (!canManage || !token || !selectedConnectionId || addingConnection) {
      setModels([]);
      setLoadingModels(false);
      return;
    }
    const controller = new AbortController();
    modelsController.current = controller;
    const modelsPath = `/api/v1/vendors/${encodeURIComponent(selectedConnectionId)}/models`;
    const cached = peekCachedGet<{ data: ProviderModel[] }>(token, modelsPath)?.data ?? null;
    if (cached) {
      setModels(cached);
      setLoadingModels(false);
    } else {
      setModels([]);
      setLoadingModels(true);
    }
    void cachedGet<{ data: ProviderModel[] }>(
      token,
      modelsPath,
      { signal: controller.signal },
    )
      .then(result => {
        if (controller.signal.aborted || generation !== modelsGeneration.current) return;
        const scope = currentScope.current;
        if (scope.token !== token || scope.selectedConnectionId !== selectedConnectionId || !scope.canManage) return;
        setModels(result.data);
      })
      .catch(reason => {
        if (controller.signal.aborted || generation !== modelsGeneration.current) return;
        const scope = currentScope.current;
        if (scope.token !== token || scope.selectedConnectionId !== selectedConnectionId || !scope.canManage) return;
        explainError(reason);
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === modelsGeneration.current) setLoadingModels(false);
      });
    return () => {
      controller.abort();
      if (modelsController.current === controller) modelsController.current = null;
      modelsGeneration.current += 1;
    };
  }, [addingConnection, canManage, explainError, selectedConnectionId, token]);

  useEffect(() => {
    catalogController.current?.abort();
    catalogController.current = null;
    catalogGeneration.current += 1;
    setCatalog([]); setDiscovery(null);
    setCatalogError('');
    setCatalogLoading(false);
    return () => {
      catalogController.current?.abort();
      catalogController.current = null;
      catalogGeneration.current += 1;
    };
  }, [addingConnection, selectedConnectionId, selectedConnection?.revision, token]);

  const mutate = useCallback(async (action: (signal: AbortSignal, generation: number) => Promise<void>) => {
    const controller = authController.current;
    if (!canManage || !controller || controller.signal.aborted) return;
    if (busyRef.current) throw new Error('Another change is already in progress.');
    busyRef.current = true;
    setBusy(true);
    setError('');
    const generation = authGeneration.current;
    try {
      await action(controller.signal, generation);
    } catch (reason) {
      if (!controller.signal.aborted && generation === authGeneration.current) explainError(reason);
      throw reason;
    } finally {
      if (!controller.signal.aborted && generation === authGeneration.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, [canManage, explainError]);

  async function createConnection(input: ProviderConnectionCreate) {
    await mutate(async (signal, generation) => {
      let result: { data: ProviderConnection };
      try {
        result = await request<{ data: ProviderConnection }>(token, '/api/v1/vendors', 'POST', input, signal);
        if (!result?.data?.id || typeof result.data.id !== 'string') throw new Error('Invalid creation response.');
      } catch (reason) {
        if (signal.aborted || generation !== authGeneration.current) throw reason;
        if (!writeMayHaveCommitted(reason)) throw reason;
        // A transport/server failure does not prove creation failed. Remove the
        // secret-bearing form and reconcile through reads instead of reposting.
        setAddingConnection(false);
        setEditingConnection(false);
        throw new Error('API key creation could not be confirmed. Refresh the Provider list before creating another key; the previous request may have saved it.');
      }
      if (signal.aborted || generation !== authGeneration.current || !currentScope.current.canManage || currentScope.current.token !== token) return;
      // Creation committed: close before discovery so a failed refresh cannot
      // invite a duplicate key creation.
      setAddingConnection(false);
      setEditingConnection(false);
      setSelectedConnectionId(result.data.id);
      setManagingModels(true);
      try {
        await reloadConnections(signal, true);
      } catch {
        throw new Error('API key saved, but the Provider list could not be refreshed. Refresh the list to view it.');
      }
      if (signal.aborted || generation !== authGeneration.current) return;
      void refreshWorkspace().catch(() => { /* Workspace refresh updates its own catalog/session error state. */ });
    });
  }

  async function saveConnection(input: ProviderConnectionWrite) {
    if (!selectedConnectionId) return;
    await mutate(async (signal, generation) => {
      const result = await request<{ data: ProviderConnection }>(
        token,
        `/api/v1/vendors/${encodeURIComponent(selectedConnectionId)}`,
        'PUT',
        input,
        signal,
      );
      if (signal.aborted || generation !== authGeneration.current || currentScope.current.token !== token) return;
      setConnections(previous => previous.map(connection => connection.id === result.data.id ? { ...result.data, provider: connection.provider ?? connection.supplier, supplier: connection.supplier } : connection));
      setEditingConnection(false);
      void refreshWorkspace().catch(() => { /* Workspace refresh updates its own catalog/session error state. */ });
    });
  }

  async function saveModel(input: ModelWrite) {
    const connectionId = selectedConnectionId;
    if (!connectionId) return;
    await mutate(async (signal, generation) => {
      await request<{ data?: ProviderModel }>(
        token,
        `/api/v1/vendors/${encodeURIComponent(connectionId)}/models`,
        'POST',
        input,
        signal,
      );
      if (signal.aborted || generation !== authGeneration.current || currentScope.current.token !== token || currentScope.current.selectedConnectionId !== connectionId) return;
      // Configuration writes do not return dispatch eligibility. Read it again
      // after saving rather than retaining a stale availability badge.
      await reloadModels(connectionId, undefined, true);
      void refreshWorkspace().catch(() => { /* Workspace refresh updates its own catalog/session error state. */ });
    });
  }

  async function checkModel(connectionId: string, alias: string): Promise<ProviderModelCheck> {
    const result = await request<{ data: ProviderModelCheck }>(
      token,
      `/api/v1/vendors/${encodeURIComponent(connectionId)}/check`,
      'POST',
      { alias },
    );
    return result.data;
  }

  async function loadProviderCatalog() {
    const connectionId = selectedConnectionId;
    if (!canManage || !token || !connectionId || catalogLoading) return;
    catalogController.current?.abort();
    const controller = new AbortController();
    catalogController.current = controller;
    const generation = ++catalogGeneration.current;
    setCatalogLoading(true);
    setCatalog([]); setDiscovery(null);
    setCatalogError('');
    try {
      const result = await request<{ data: ProviderCatalogModel[]; discovery: ProviderDiscoveryEvidence }>(
        token,
        `/api/v1/vendors/${encodeURIComponent(connectionId)}/catalog`,
        'GET',
        undefined,
        controller.signal,
      );
      const scope = currentScope.current;
      if (!controller.signal.aborted && generation === catalogGeneration.current && scope.canManage && scope.token === token && scope.selectedConnectionId === connectionId) {
        setCatalog(result.data); setDiscovery(result.discovery);
      }
    } catch (reason) {
      const scope = currentScope.current;
      if (!controller.signal.aborted && generation === catalogGeneration.current && scope.canManage && scope.token === token && scope.selectedConnectionId === connectionId) {
        setCatalogError(reason instanceof Error ? reason.message : 'Provider models could not be loaded.');
      }
    } finally {
      if (!controller.signal.aborted && generation === catalogGeneration.current) setCatalogLoading(false);
    }
  }

  async function refreshConnections() {
    setError('');
    const generation = authGeneration.current;
    const signal = authController.current?.signal;
    setLoadingConnections(true);
    try { await reloadConnections(undefined, true); } catch (reason) {
      if (!signal?.aborted && generation === authGeneration.current) explainError(reason);
    } finally {
      if (!signal?.aborted && generation === authGeneration.current) setLoadingConnections(false);
    }
  }

  async function refreshSelectedModels() {
    if (!selectedConnectionId) return;
    setError('');
    const connectionId = selectedConnectionId;
    modelsController.current?.abort();
    const controller = new AbortController();
    modelsController.current = controller;
    const generation = ++modelsGeneration.current;
    setLoadingModels(true);
    try {
      const result = await cachedGet<{ data: ProviderModel[] }>(
        token,
        `/api/v1/vendors/${encodeURIComponent(connectionId)}/models`,
        { signal: controller.signal, force: true },
      );
      const scope = currentScope.current;
      if (!controller.signal.aborted && generation === modelsGeneration.current && scope.canManage && scope.token === token && scope.selectedConnectionId === connectionId) {
        setModels(result.data);
      }
    } catch (reason) {
      const scope = currentScope.current;
      if (!controller.signal.aborted && generation === modelsGeneration.current && scope.canManage && scope.token === token && scope.selectedConnectionId === connectionId) explainError(reason);
    } finally {
      if (!controller.signal.aborted && generation === modelsGeneration.current) setLoadingModels(false);
    }
  }

  async function retryData() {
    await refreshConnections();
    if (selectedConnectionId) await refreshSelectedModels();
  }

  if (!canManage) {
    return <>
      <PageHeader title={uiT("Providers")} />
      <section className="panel vendor-access-denied" role="status">
        <span className="vendor-access-mark"><ShieldAlert size={18} /></span>
        <div><h2>{uiT("Platform administrator access required")}</h2><p>{uiT("Your account does not have permission to manage Providers. Contact a platform administrator if you need access.")}</p></div>
      </section>
    </>;
  }

  const selectedOwnerName = selectedConnection?.provider?.name ?? selectedConnection?.supplier?.name;

  return <>
    {providerId && <div className="supplier-section-heading">{!routeScopedId && <h2>{uiT("API keys")}</h2>}<p>{uiT("Configure API keys and the model routes they serve.")}</p></div>}
    <PageHeader title={uiT("Providers")} action={canManage && <>{<Button type="button" className="header-icon-action" aria-label={providerId ? uiT("Add API key") : uiT("Add provider")} title={providerId ? uiT("Add API key") : uiT("Add provider")} onClick={() => { setError(''); setAddingConnection(true); }}><Router size={16} aria-hidden="true" /><span>{providerId ? uiT("Add API key") : uiT("Add provider")}</span></Button>}</>} />
    {error && !addingConnection && !editingConnection && <div className="vendor-error" role="alert"><span>{error}</span><Button type="button" size="xs" variant="ghost" disabled={busy || loadingConnections || loadingModels} onClick={() => void retryData()}>{uiT("Retry")}</Button></div>}
    <div className="supplier-detail-layout">
      {connections.length > 1 && <ProviderDirectory
        connections={connections}
        selectedId={addingConnection ? '' : selectedConnectionId}
        loading={loadingConnections}
        disabled={busy || loadingConnections}
        onSelect={id => { setError(''); setAddingConnection(false); setSelectedConnectionId(id); }}
        onRefresh={() => void refreshConnections()}
      />}
      {!loadingConnections && selectedConnection ? <section className="supplier-detail-header" aria-labelledby="vendor-detail-title">
        <div className="supplier-detail-identity"><ProviderLogo provider={connectionIdentity(selectedConnection)} size="large" /><div><h2 id="vendor-detail-title">{selectedConnection.name}</h2><p>{providerAdapterApiLabels[selectedConnection.adapter]}</p></div><span className={'vendor-status-badge' + (selectedConnection.enabled ? ' is-enabled' : '')}>{selectedConnection.enabled ? uiT("Enabled") : uiT("Disabled")}</span></div>
        <div className="supplier-detail-bottom"><p className="supplier-endpoint">{selectedConnection.api_base}</p><div className="vendor-detail-actions"><Button type="button" size="sm" onClick={() => setManagingModels(true)} disabled={loadingModels}>{uiT("Model routes")}{!loadingModels && ` (${models.length})`}</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setError(''); setEditingConnection(true); }}><Pencil size={15} />{uiT("Edit API key")}</Button><Button asChild size="sm" variant="ghost"><Link to="/admin/pools">{uiT("Model pools")}</Link></Button><Button asChild size="sm" variant="ghost"><Link to={catalogPath}>{uiT("Model catalog")}</Link></Button></div></div>
        {!selectedConnection.has_credential && <p className="error-text" role="status">{uiT("No credential stored. Edit this API key to configure access.")}</p>}
        {canManage && <CredentialRequestLimit key={`${token}:${selectedConnection.id}`} token={token} vendorId={selectedConnection.id} />}
        {canManage && <CredentialCooldown key={`${token}:${selectedConnection.id}:cooldown`} token={token} vendorId={selectedConnection.id} />}
        {canManage && <IntegrationSettings key={`${token}:${selectedConnection.id}:integration`} token={token} resource="vendors" id={selectedConnection.id} onSaved={() => { catalogController.current?.abort(); catalogGeneration.current += 1; setCatalog([]); setDiscovery(null); setCatalogError(''); setCatalogLoading(false); }} />}
      </section> : loadingConnections ? <section className="panel vendor-detail-panel vendor-editor-loading"><FormSectionSkeleton fields={3} label={uiT("Loading API keys…")} /></section> : <section className="panel vendor-detail-panel"><div className="vendor-empty"><span className="vendor-empty-mark"><Router size={17} /></span><strong>{uiT("No API keys")}</strong><p>{uiT("Add an API key to configure the models supplied by this Provider.")}</p><Button type="button" onClick={() => setAddingConnection(true)}>{uiT("Add API key")}</Button></div></section>}
    </div>
    <Dialog open={managingModels && !!selectedConnection && !addingConnection} onOpenChange={setManagingModels}>
      <DialogContent className="supplier-models-dialog" showCloseButton={false}>
        <DialogHeader className="flex-row items-start justify-between gap-4 text-left">
          <div><DialogTitle>{selectedOwnerName ?? selectedConnection?.name ?? 'Provider'}{" "}{uiT("routes")}</DialogTitle><DialogDescription>{uiT("Model routes served by")}{" "}{selectedConnection?.name ?? uiT("this API key")}.</DialogDescription></div>
          <DialogClose asChild><Button variant="ghost" size="icon-sm" aria-label={uiT("Close model management")}><X /></Button></DialogClose>
        </DialogHeader>
        {selectedConnection && <ModelMappings
      key={selectedConnection.id}
      credentialRevision={selectedConnection.revision}
      ownerFunded={selectedConnection.owner_funded === true}
      models={models}
      catalog={catalog}
      discovery={discovery}
      catalogLoading={catalogLoading}
      catalogError={catalogError}
      loading={loadingModels}
      disabled={busy || loadingModels}
      onRefresh={() => void refreshSelectedModels()}
      onLoadCatalog={loadProviderCatalog}
      onSave={saveModel}
      onCheck={alias => checkModel(selectedConnection.id, alias)}
    />}
      </DialogContent>
    </Dialog>
    <Dialog open={addingConnection || editingConnection} onOpenChange={open => { if (!open && !busy) { setAddingConnection(false); setEditingConnection(false); } }}>
      <DialogContent className="niu-modal vendor-dialog" showCloseButton={false}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>{addingConnection ? uiT("Add Provider API key") : uiF("Edit {0}", [selectedConnection?.name ?? uiT("API key")])}</DialogTitle><DialogDescription>{addingConnection ? uiT("Choose a Provider and configure the API key for its model routes.") : uiT("Update the provider endpoint or replace its stored credential.")}</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label={uiT("Close dialog")}><X size={18} /></DialogClose>
        </DialogHeader>
      {error && <p className="error-text" role="alert">{error}</p>}
      {(addingConnection || editingConnection && selectedConnection) && <ProviderEditor
        key={addingConnection ? 'new-vendor' : `${selectedConnection!.id}:${selectedConnection!.revision}`}
        token={token}
        initialProviderId={providerId}
        connection={addingConnection ? null : selectedConnection}
        disabled={busy}
        onCreate={createConnection}
        onSave={saveConnection}
      />}
    </DialogContent>
    </Dialog>
  </>;
}
