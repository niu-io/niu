import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useProviderParams } from '@/shell/provider-route';
import { Link, useSearchParams } from 'react-router';
import { IconX as X } from "@tabler/icons-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { cachedGet, peekCachedGet, ProviderRequestError, writeMayHaveCommitted, request, providerAdapterApiLabels, type ProviderConnection, type ProviderConnectionWrite } from '../api';
import ProviderDirectory from './ProviderDirectory';
import ProviderEditor, { type ProviderConnectionCreate } from './ProviderEditor';
import CredentialRequestLimit from './CredentialRequestLimit';
import CredentialCooldown from './CredentialCooldown';

export default function ProvidersView({ token, session, refreshWorkspace, catalogPath = '/models', providerSlug, fixedConnectionId }: {
  catalogPath?: string;
  fixedConnectionId?: string;
  providerSlug?: string;
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
  const cachedConnections = canManage && token ? peekCachedGet<{ data: ProviderConnection[] }>(token, connectionsPath)?.data ?? null : null;
  const initialConnections = cachedConnections && fixedConnectionId ? cachedConnections.filter(connection => connection.id === fixedConnectionId) : cachedConnections;
  const initialSelectedId = initialConnections?.[0]?.id ?? '';
  const [connections, setConnections] = useState<ProviderConnection[]>(() => initialConnections ?? []);
  const [selectedConnectionId, setSelectedConnectionId] = useState(initialSelectedId);
  const [loadingConnections, setLoadingConnections] = useState(() => Boolean(canManage && token && !initialConnections));
  const [busy, setBusy] = useState(false);
  const [addingConnection, setAddingConnection] = useState(false);
  const [editingConnection, setEditingConnection] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [error, setError] = useState('');
  const authController = useRef<AbortController | null>(null);
  const authGeneration = useRef(0);
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
    const visible = fixedConnectionId ? result.data.filter(connection => connection.id === fixedConnectionId) : result.data;
    setConnections(visible);
    setSelectedConnectionId(current => visible.some(connection => connection.id === current) ? current : visible[0]?.id ?? '');
    if (visible.length > 0) setAddingConnection(false);
  }, [canManage, token, connectionsPath, fixedConnectionId]);

  useEffect(() => {
    const generation = ++authGeneration.current;
    authController.current?.abort();
    if (!canManage || !token) {
      setLoadingConnections(false);
      setConnections([]);
      setSelectedConnectionId('');
      setAddingConnection(false);
      setEditingConnection(false);
      busyRef.current = false;
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    authController.current = controller;
    const cachedAll = peekCachedGet<{ data: ProviderConnection[] }>(token, connectionsPath)?.data ?? null;
    const cached = cachedAll && fixedConnectionId ? cachedAll.filter(connection => connection.id === fixedConnectionId) : cachedAll;
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
        const visible = fixedConnectionId ? result.data.filter(connection => connection.id === fixedConnectionId) : result.data;
        setConnections(visible);
        setSelectedConnectionId(current => visible.some(connection => connection.id === current) ? current : visible[0]?.id ?? '');
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
      busyRef.current = false;
      setBusy(false);
    };
  }, [canManage, token, explainError, connectionsPath, fixedConnectionId]);

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

  async function retireConnection() {
    if (!selectedConnection) return;
    setBusy(true);
    setError('');
    try {
      await request(
        token,
        `/api/v1/vendors/${encodeURIComponent(selectedConnection.id)}/retire`,
        'POST',
        {},
      );
      setDisconnectOpen(false);
      window.location.reload();
    } catch (reason) {
      explainError(reason);
      setError(reason instanceof Error && !(reason instanceof TypeError) ? reason.message : 'Could not disconnect this Provider. Nothing was changed. Retry.');
    } finally {
      setBusy(false);
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

  async function retryData() {
    await refreshConnections();
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

  const modelsHref = providerId ? `/admin/providers/${encodeURIComponent(providerSlug ?? providerId)}/models` : '';

  return <>
    {providerId && <div className="supplier-section-heading"><h2>{uiT("API keys")}</h2><p>{uiT("Manage upstream API keys, request limits and cooldowns for this Provider.")}</p></div>}
    <PageHeader title={uiT("API keys")} action={!fixedConnectionId && canManage && <>{<Button type="button" className="header-icon-action" aria-label={providerId ? uiT("Add API key") : uiT("Add provider")} title={providerId ? uiT("Add API key") : uiT("Add provider")} onClick={() => { setError(''); setAddingConnection(true); }}><Router size={16} aria-hidden="true" /><span>{providerId ? uiT("Add API key") : uiT("Add provider")}</span></Button>}</>} />
    {error && !addingConnection && !editingConnection && <div className="vendor-error" role="alert"><span>{uiT(error)}</span><Button type="button" size="xs" variant="ghost" disabled={busy || loadingConnections} onClick={() => void retryData()}>{uiT("Retry")}</Button></div>}
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
        <div className="supplier-detail-bottom"><p className="supplier-endpoint">{selectedConnection.api_base}</p><div className="vendor-detail-actions">{modelsHref && <Button asChild size="sm" variant="outline"><Link to={modelsHref}>{uiT("Models")}</Link></Button>}<Button type="button" size="sm" disabled={busy} onClick={() => { setError(''); setEditingConnection(true); }}><Pencil size={15} />{uiT("Edit API key")}</Button><Button asChild size="sm" variant="ghost"><Link to="/admin/routing">{uiT("Routing")}</Link></Button><Button asChild size="sm" variant="ghost"><Link to={catalogPath}>{uiT("Model catalog")}</Link></Button>{selectedConnection.enabled && <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => { setError(''); setDisconnectOpen(true); }}>{uiT("Disconnect")}</Button>}</div></div>
        {!selectedConnection.has_credential && <p className="error-text" role="status">{uiT("No credential stored. Edit this API key to configure access.")}</p>}
        {canManage && <CredentialRequestLimit key={`${token}:${selectedConnection.id}`} token={token} vendorId={selectedConnection.id} />}
        {canManage && <CredentialCooldown key={`${token}:${selectedConnection.id}:cooldown`} token={token} vendorId={selectedConnection.id} />}
      </section> : loadingConnections ? <section className="panel vendor-detail-panel vendor-editor-loading"><FormSectionSkeleton fields={3} label={uiT("Loading API keys…")} /></section> : fixedConnectionId ? <section role="alert" className="panel vendor-detail-panel"><p>{uiT("This connection is unavailable. Return to incidents and refresh before taking action.")}</p></section> : <section className="panel vendor-detail-panel"><div className="vendor-empty"><span className="vendor-empty-mark"><Router size={17} /></span><strong>{uiT("No API keys")}</strong><p>{uiT("Add an API key to connect this Provider. Model routes are managed in Models.")}</p><Button type="button" onClick={() => setAddingConnection(true)}>{uiT("Add API key")}</Button></div></section>}
    </div>
    <Dialog open={addingConnection || editingConnection} onOpenChange={open => { if (!open && !busy) { setAddingConnection(false); setEditingConnection(false); } }}>
      <DialogContent className="niu-modal vendor-dialog" showCloseButton={false}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>{addingConnection ? uiT("Add Provider API key") : uiF("Edit {0}", [selectedConnection?.name ?? uiT("API key")])}</DialogTitle><DialogDescription>{addingConnection ? uiT("Choose a Provider and save its API key. Add model routes in Models.") : uiT("Update the provider endpoint or replace its stored credential.")}</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label={uiT("Close dialog")}><X size={18} /></DialogClose>
        </DialogHeader>
      {error && <p className="error-text" role="alert">{uiT(error)}</p>}
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
    <Dialog open={disconnectOpen} onOpenChange={open => { if (!busy) setDisconnectOpen(open); }}>
      <DialogContent className="niu-modal" showCloseButton={false}>
        <DialogHeader><DialogTitle>{uiT("Disconnect this Provider connection?")}</DialogTitle><DialogDescription>{uiT("New requests stop immediately, all model bindings are disabled and the stored credential is erased. In-flight requests may finish. Requests, billing, incidents and audit history are retained. This cannot be undone; reconnect and re-import models to restore access.")}</DialogDescription></DialogHeader>
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setDisconnectOpen(false)}>{uiT("Cancel")}</Button><Button type="button" variant="destructive" disabled={busy} onClick={() => void retireConnection()}>{busy ? uiT("Disconnecting…") : uiT("Disconnect")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

  </>;
}
