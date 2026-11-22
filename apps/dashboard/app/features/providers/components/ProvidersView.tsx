import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useProviderParams } from '@/shell/provider-route';
import { Link, useSearchParams } from 'react-router';
import { IconKey, IconPencil as Pencil, IconPlugConnected as Router, IconPlus, IconPower, IconRefresh, IconShieldExclamation as ShieldAlert, IconX as X } from '@tabler/icons-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ProviderLogo from '@/components/ProviderLogo';
import { connectionIdentity } from '@/lib/providers';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import PageHeader from '@/components/PageHeader';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import { invalidateForMutation } from '@/lib/query-cache';
import type { AdminSession } from '@/shell/dashboard-context';
import { Button } from '@/components/ui/button';
import { cachedGet, peekCachedGet, ProviderRequestError, writeMayHaveCommitted, request, providerAdapterApiLabels, type ProviderConnection, type ProviderConnectionWrite } from '../api';
import ProviderEditor, { type ProviderConnectionCreate } from './ProviderEditor';
import CredentialRequestLimit from './CredentialRequestLimit';
import CredentialCooldown from './CredentialCooldown';

export default function ProvidersView({ token, session, refreshWorkspace, catalogPath: _catalogPath = '/workspaces', providerSlug, fixedConnectionId, organizationId }: {
  catalogPath?: string;
  fixedConnectionId?: string;
  organizationId?: string;
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
  const connectionsPath = '/api/v1/admin/providers/connections' + (providerId ? '?supplier=' + encodeURIComponent(providerId) : '');
  const canManage = Boolean(session.permissions?.platform_admin || (session.kind === 'installation' && session.permissions?.manage_operators !== false));
  const cachedConnections = canManage && token ? peekCachedGet<{ data: ProviderConnection[] }>(token, connectionsPath)?.data ?? null : null;
  const initialConnections = cachedConnections && fixedConnectionId ? cachedConnections.filter(connection => connection.id === fixedConnectionId) : cachedConnections;
  const [connections, setConnections] = useState<ProviderConnection[]>(() => initialConnections ?? []);
  const [activeConnectionId, setActiveConnectionId] = useState(() => initialConnections?.[0]?.id ?? '');
  const [loadingConnections, setLoadingConnections] = useState(() => Boolean(canManage && token && !initialConnections));
  const [busy, setBusy] = useState(false);
  const [addingConnection, setAddingConnection] = useState(false);
  const [editingConnection, setEditingConnection] = useState(false);
  const [reconnectingConnection, setReconnectingConnection] = useState<ProviderConnection | null>(null);
  const [reconnectApiKey, setReconnectApiKey] = useState('');
  const [disableTarget, setDisableTarget] = useState<ProviderConnection | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<ProviderConnection | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const authController = useRef<AbortController | null>(null);
  const authGeneration = useRef(0);
  const busyRef = useRef(false);
  const currentScope = useRef({ activeConnectionId, token, canManage });
  currentScope.current = { activeConnectionId, token, canManage };

  const activeConnection = connections.find(connection => connection.id === activeConnectionId) ?? connections[0] ?? null;

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
    setActiveConnectionId(current => visible.some(connection => connection.id === current) ? current : visible[0]?.id ?? '');
    if (visible.length > 0) setAddingConnection(false);
  }, [canManage, token, connectionsPath, fixedConnectionId]);

  useEffect(() => {
    const generation = ++authGeneration.current;
    authController.current?.abort();
    if (!canManage || !token) {
      setLoadingConnections(false);
      setConnections([]);
      setActiveConnectionId('');
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
      setActiveConnectionId(current => cached.some(connection => connection.id === current) ? current : cached[0]?.id ?? '');
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
        setActiveConnectionId(current => visible.some(connection => connection.id === current) ? current : visible[0]?.id ?? '');
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
    setNotice('');
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
        result = await request<{ data: ProviderConnection }>(token, '/api/v1/admin/providers/connections', 'POST', input, signal);
        if (!result?.data?.id || typeof result.data.id !== 'string') throw new Error('Invalid creation response.');
      } catch (reason) {
        if (signal.aborted || generation !== authGeneration.current) throw reason;
        if (!writeMayHaveCommitted(reason)) throw reason;
        setAddingConnection(false);
        setEditingConnection(false);
        throw new Error('API key creation could not be confirmed. Refresh the Provider list before creating another key; the previous request may have saved it.');
      }
      if (signal.aborted || generation !== authGeneration.current || !currentScope.current.canManage || currentScope.current.token !== token) return;
      setAddingConnection(false);
      setEditingConnection(false);
      setActiveConnectionId(result.data.id);
      invalidateForMutation(token, '/api/v1/admin/providers', 'POST');
      window.dispatchEvent(new Event('niu:provider-profile-updated'));
      try {
        await reloadConnections(signal, true);
      } catch {
        throw new Error('API key saved, but the Provider list could not be refreshed. Refresh the list to view it.');
      }
      if (signal.aborted || generation !== authGeneration.current) return;
      setNotice('API key saved and enabled.');
      void refreshWorkspace().catch(() => { /* Workspace refresh tracks its own catalog/session error state. */ });
    });
  }

  async function updateConnection(connectionId: string, input: ProviderConnectionWrite, successMessage: string) {
    await mutate(async (signal, generation) => {
      const result = await request<{ data: ProviderConnection }>(
        token,
        `/api/v1/admin/providers/connections/${encodeURIComponent(connectionId)}`,
        'PUT',
        input,
        signal,
      );
      if (signal.aborted || generation !== authGeneration.current || currentScope.current.token !== token) return;
      setConnections(previous => previous.map(connection => connection.id === result.data.id ? { ...result.data, provider: connection.provider ?? connection.supplier, supplier: connection.supplier } : connection));
      setEditingConnection(false);
      setDisableTarget(null);
      setReconnectingConnection(null);
      setReconnectApiKey('');
      invalidateForMutation(token, '/api/v1/admin/providers', 'PUT');
      window.dispatchEvent(new Event('niu:provider-profile-updated'));
      setNotice(successMessage);
      void refreshWorkspace().catch(() => { /* Workspace refresh tracks its own catalog/session error state. */ });
    });
  }

  async function enableDirect(connection: ProviderConnection) {
    await updateConnection(
      connection.id,
      {
        name: connection.name,
        api_base: connection.api_base,
        enabled: true,
        expected_revision: connection.revision,
      },
      'API key enabled.',
    ).catch(() => { /* mutate handler records and displays the error. */ });
  }

  async function confirmDisable(connection: ProviderConnection) {
    await updateConnection(
      connection.id,
      {
        name: connection.name,
        api_base: connection.api_base,
        enabled: false,
        expected_revision: connection.revision,
      },
      'API key disabled.',
    ).catch(() => { /* mutate handler records and displays the error. */ });
  }

  async function submitReconnect(event: FormEvent) {
    event.preventDefault();
    if (!reconnectingConnection || !reconnectApiKey.trim()) return;
    await updateConnection(
      reconnectingConnection.id,
      {
        name: reconnectingConnection.name,
        api_base: reconnectingConnection.api_base,
        enabled: true,
        api_key: reconnectApiKey.trim(),
        expected_revision: reconnectingConnection.revision,
      },
      'API key saved and enabled.',
    ).catch(() => { /* mutate handler records and displays the error. */ });
  }

  async function retireConnection() {
    if (!disconnectTarget) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(
        token,
        `/api/v1/admin/providers/connections/${encodeURIComponent(disconnectTarget.id)}/retire`,
        'POST',
        {},
      );
      setDisconnectTarget(null);
      invalidateForMutation(token, '/api/v1/admin/providers/connections', 'POST');
      invalidateForMutation(token, '/api/v1/admin/providers', 'POST');
      window.dispatchEvent(new Event('niu:provider-profile-updated'));
      await reloadConnections(undefined, true);
      setNotice('API key disconnected and credential erased.');
      void refreshWorkspace().catch(() => { /* Workspace refresh tracks its own catalog/session error state. */ });
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

  if (!canManage) {
    return <>
      <PageHeader title={uiT("Providers")} />
      <section className="panel vendor-access-denied" role="status">
        <span className="vendor-access-mark"><ShieldAlert size={18} /></span>
        <div><h2>{uiT("Platform administrator access required")}</h2><p>{uiT("Your account does not have permission to manage Providers. Contact a platform administrator if you need access.")}</p></div>
      </section>
    </>;
  }

  const modelsHref = providerId ? `/admin/providers/${encodeURIComponent(providerSlug ?? providerId)}` : '';

  return <section className="empty-region min-w-0 space-y-5">
    <h2 className="sr-only">{uiT("API keys", "API 密钥")}</h2>
    <PageHeader
      title={uiT("API keys", "API 密钥")}
      action={!fixedConnectionId && canManage && (
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy || loadingConnections} onClick={() => void refreshConnections()}>
            <IconRefresh size={15} aria-hidden="true" />
            <span>{uiT("Refresh")}</span>
          </Button>
          <Button type="button" size="sm" onClick={() => { setError(''); setAddingConnection(true); }}>
            <IconPlus size={15} aria-hidden="true" />
            <span>{providerId ? uiT("Add API key") : uiT("Add provider")}</span>
          </Button>
        </div>
      )}
    />
    <p className="text-sm text-muted-foreground">
      {uiT("Step 1: connect or enable an upstream API key for this Provider, then choose available models and discounts.", "第一步：连接或启用此供应商的上游 API 密钥，然后前往选择可用模型与折扣。")}
    </p>
    {notice && <p role="status" className="text-sm text-foreground">{uiT(notice)}</p>}
    {error && !addingConnection && !editingConnection && !reconnectingConnection && (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>{uiT(error)}</span>
          <Button type="button" size="sm" variant="outline" disabled={busy || loadingConnections} onClick={() => void refreshConnections()}>{uiT("Retry")}</Button>
        </AlertDescription>
      </Alert>
    )}

    {loadingConnections ? (
      <section className="rounded-[var(--radius-panel)] bg-card p-5"><FormSectionSkeleton fields={3} label={uiT("Loading API keys…")} /></section>
    ) : connections.length === 0 ? (
      fixedConnectionId ? (
        <Alert variant="destructive"><AlertDescription>{uiT("This connection is unavailable. Return to incidents and refresh before taking action.")}</AlertDescription></Alert>
      ) : (
        <section className="rounded-[var(--radius-panel)] bg-card p-6 text-center space-y-3">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted"><Router size={18} /></div>
          <h2 className="text-sm font-semibold">{uiT("No API keys")}</h2>
          <p className="text-sm text-muted-foreground">{uiT("Add an API key to connect this Provider.")}</p>
          <div><Button type="button" onClick={() => setAddingConnection(true)}>{uiT("Add API key")}</Button></div>
        </section>
      )
    ) : (
      <ul className="space-y-3" aria-label={uiT("Provider API keys", "供应商 API 密钥")}>
        {connections.map(connection => {
          const needsKey = !connection.has_credential;
          const isReady = connection.enabled && connection.has_credential;
          return (
            <li key={connection.id} className="rounded-[var(--radius-panel)] bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderLogo provider={connectionIdentity(connection)} size="large" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold break-words">{connection.name}</h2>
                      <Badge variant={isReady ? 'secondary' : 'outline'}>
                        {needsKey ? uiT("No API key saved", "未保存密钥") : connection.enabled ? uiT("Enabled") : uiT("Disabled")}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {providerAdapterApiLabels[connection.adapter]} · <span className="font-mono break-all">{connection.api_base}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {needsKey ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setError('');
                        setReconnectApiKey('');
                        setReconnectingConnection(connection);
                      }}
                    >
                      <IconKey size={15} aria-hidden="true" />
                      <span>{uiT("Enter API key & enable", "填写 API 密钥并启用")}</span>
                    </Button>
                  ) : !connection.enabled ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => void enableDirect(connection)}
                    >
                      <IconPower size={15} aria-hidden="true" />
                      <span>{uiT("Enable API key")}</span>
                    </Button>
                  ) : (
                    <>
                      {modelsHref && (
                        <Button asChild size="sm">
                          <Link to={modelsHref}>{uiT("Select models", "选择可用模型")}</Link>
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => { setError(''); setDisableTarget(connection); }}
                      >
                        {uiT("Disable", "停用")}
                      </Button>
                    </>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setError('');
                      setActiveConnectionId(connection.id);
                      setEditingConnection(true);
                    }}
                  >
                    <Pencil size={14} aria-hidden="true" />
                    <span>{uiT("Edit key")}</span>
                  </Button>
                  {connection.enabled && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busy}
                      onClick={() => { setError(''); setDisconnectTarget(connection); }}
                    >
                      {uiT("Disconnect")}
                    </Button>
                  )}
                </div>
              </div>

              {needsKey && (
                <p className="text-sm text-destructive" role="status">
                  {uiT("This connection has no stored API key (it was previously disconnected). Enter a new API key to enable it.", "此连接未保存 API 密钥（之前已被断开清除）。请重新填写 API 密钥以启用。")}
                </p>
              )}

              <details className="border-t pt-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {uiT("Advanced: rate limits & cooldown", "高级：限流与冷却状态")}
                </summary>
                <div className="mt-2 space-y-2">
                  <CredentialRequestLimit key={`${token}:${connection.id}`} token={token} vendorId={connection.id} />
                  <CredentialCooldown key={`${token}:${connection.id}:cooldown`} token={token} vendorId={connection.id} />
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    )}

    {/* Quick reconnect modal for disconnected keys */}
    <Dialog open={Boolean(reconnectingConnection)} onOpenChange={open => { if (!open && !busy) { setReconnectingConnection(null); setReconnectApiKey(''); } }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{uiT("Enter API key & enable", "填写 API 密钥并启用")}</DialogTitle>
          <DialogDescription>
            {reconnectingConnection?.name} · <span className="font-mono">{reconnectingConnection?.api_base}</span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={event => void submitReconnect(event)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reconnect-api-key">{uiT("Provider API key")}</Label>
            <Input
              id="reconnect-api-key"
              type="password"
              autoComplete="new-password"
              required
              autoFocus
              disabled={busy}
              value={reconnectApiKey}
              onChange={event => setReconnectApiKey(event.target.value)}
              placeholder={uiT("Paste a provider key")}
            />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{uiT(error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => { setReconnectingConnection(null); setReconnectApiKey(''); }}>{uiT("Cancel")}</Button>
            <Button type="submit" disabled={busy || !reconnectApiKey.trim()}>{busy ? uiT("Saving…") : uiT("Save & enable", "保存并启用")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    {/* Add / full edit modal */}
    <Dialog open={addingConnection || editingConnection} onOpenChange={open => { if (!open && !busy) { setAddingConnection(false); setEditingConnection(false); } }}>
      <DialogContent className="niu-modal vendor-dialog max-h-[90dvh] overflow-y-auto" showCloseButton={false}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div>
            <DialogTitle>{addingConnection ? uiT("Add Provider API key") : uiF("Edit {0}", [activeConnection?.name ?? uiT("API key")])}</DialogTitle>
            <DialogDescription>{addingConnection ? uiT("Save the upstream API key for this Provider.") : uiT("Update the provider endpoint or replace its stored credential.")}</DialogDescription>
          </div>
          <DialogClose className="niu-modal-close" aria-label={uiT("Close dialog")}><X size={18} /></DialogClose>
        </DialogHeader>
        {error && <p className="error-text" role="alert">{uiT(error)}</p>}
        {addingConnection ? (
          <ProviderEditor
            key="new-vendor"
            token={token}
            initialProviderId={providerId}
            connection={null}
            operatingMode={session.operating_mode}
            organizationId={organizationId}
            disabled={busy}
            onCreate={createConnection}
            onSave={async () => { /* Create mode does not call onSave. */ }}
          />
        ) : editingConnection && activeConnection ? (
          <ProviderEditor
            key={`${activeConnection.id}:${activeConnection.revision}`}
            token={token}
            initialProviderId={providerId}
            connection={activeConnection}
            operatingMode={session.operating_mode}
            organizationId={organizationId}
            disabled={busy}
            onCreate={createConnection}
            onSave={input => updateConnection(activeConnection.id, input, 'API key saved.')}
          />
        ) : null}
      </DialogContent>
    </Dialog>

    {/* Disable confirmation modal */}
    <Dialog open={Boolean(disableTarget)} onOpenChange={open => { if (!open && !busy) setDisableTarget(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{uiT("Disable this API key?")}</DialogTitle>
          <DialogDescription>{uiT("Models using this key will stop receiving new requests. The stored API key is kept and can be re-enabled anytime.")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setDisableTarget(null)}>{uiT("Cancel")}</Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => disableTarget && void confirmDisable(disableTarget)}>{busy ? uiT("Saving…") : uiT("Disable", "停用")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Disconnect & erase confirmation modal */}
    <Dialog open={Boolean(disconnectTarget)} onOpenChange={open => { if (!open && !busy) setDisconnectTarget(null); }}>
      <DialogContent className="niu-modal max-h-[90dvh] overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{uiT("Disconnect this Provider connection?")}</DialogTitle>
          <DialogDescription>{uiT("New requests stop immediately, all model bindings are disabled and the stored credential is erased. In-flight requests may finish. Requests, billing, incidents and audit history are retained.")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setDisconnectTarget(null)}>{uiT("Cancel")}</Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void retireConnection()}>{busy ? uiT("Disconnecting…") : uiT("Disconnect")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
