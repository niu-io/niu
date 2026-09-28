import ProviderLogo from '@/components/ProviderLogo';
import { connectionIdentity } from '@/lib/providers';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, KeyRound, Pencil, Router, ShieldAlert, ShieldCheck } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ModalFrame from '@/components/ModalFrame';
import type { AdminSession } from '@/app/console-context';
import { Button } from '@/components/ui/button';
import { VendorRequestError, request, type ModelWrite, type ProviderCatalogModel, type ProviderModelCheck, type Vendor, type VendorModel, type VendorWrite } from '../api';
import VendorDirectory from './VendorDirectory';
import VendorEditor, { type VendorCreate } from './VendorEditor';
import ModelMappings from './ModelMappings';

export default function VendorsView({ token, session, refreshWorkspace }: {
  token: string;
  session: AdminSession;
  refreshWorkspace: () => Promise<void>;
}) {
  const canManage = session.kind === 'installation' && session.permissions.manage_operators;
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [models, setModels] = useState<VendorModel[]>([]);
  const [catalog, setCatalog] = useState<ProviderCatalogModel[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addingVendor, setAddingVendor] = useState(false);
  const [editingVendor, setEditingVendor] = useState(false);
  const [error, setError] = useState('');
  const authController = useRef<AbortController | null>(null);
  const authGeneration = useRef(0);
  const modelsController = useRef<AbortController | null>(null);
  const modelsGeneration = useRef(0);
  const catalogController = useRef<AbortController | null>(null);
  const catalogGeneration = useRef(0);
  const busyRef = useRef(false);
  const currentScope = useRef({ selectedVendorId, token, canManage });
  currentScope.current = { selectedVendorId, token, canManage };

  const selectedVendor = vendors.find(vendor => vendor.id === selectedVendorId) ?? null;

  const explainError = useCallback((reason: unknown) => {
    if (reason instanceof VendorRequestError && reason.status === 401) {
      setError('This installation session is no longer valid. Rechecking permissions…');
      void refreshWorkspace();
      return;
    }
    if (reason instanceof VendorRequestError && reason.status === 409) {
      setError('This record changed in another session. Refresh the list and try again.');
      return;
    }
    setError(reason instanceof Error ? reason.message : 'The request could not be completed.');
  }, [refreshWorkspace]);

  const reloadVendors = useCallback(async (signal?: AbortSignal) => {
    if (!canManage || !token) return;
    const controller = authController.current;
    const requestSignal = signal ?? controller?.signal;
    const generation = authGeneration.current;
    if (!requestSignal || requestSignal.aborted) return;
    const result = await request<{ data: Vendor[] }>(token, '/admin/v1/vendors', 'GET', undefined, requestSignal);
    if (requestSignal.aborted || generation !== authGeneration.current || !currentScope.current.canManage || currentScope.current.token !== token) return;
    setVendors(result.data);
    setSelectedVendorId(current => result.data.some(vendor => vendor.id === current) ? current : result.data[0]?.id ?? '');
    if (result.data.length > 0) setAddingVendor(false);
  }, [canManage, token]);

  const reloadModels = useCallback(async (vendorId: string, signal?: AbortSignal) => {
    const generation = modelsGeneration.current;
    const controller = modelsController.current;
    const requestSignal = signal ?? controller?.signal;
    if (!canManage || !token || !requestSignal || requestSignal.aborted) return;
    const result = await request<{ data: VendorModel[] }>(
      token,
      `/admin/v1/vendors/${encodeURIComponent(vendorId)}/models`,
      'GET',
      undefined,
      requestSignal,
    );
    const scope = currentScope.current;
    if (requestSignal.aborted || generation !== modelsGeneration.current || !scope.canManage || scope.token !== token || scope.selectedVendorId !== vendorId) return;
    setModels(result.data);
  }, [canManage, token]);

  useEffect(() => {
    const generation = ++authGeneration.current;
    authController.current?.abort();
    modelsController.current?.abort();
    modelsGeneration.current += 1;
    if (!canManage || !token) {
      setLoadingVendors(false);
      setLoadingModels(false);
      setVendors([]);
      setModels([]);
      setSelectedVendorId('');
      setAddingVendor(false);
      setEditingVendor(false);
      busyRef.current = false;
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    authController.current = controller;
    setLoadingVendors(true);
    setError('');
    void request<{ data: Vendor[] }>(token, '/admin/v1/vendors', 'GET', undefined, controller.signal)
      .then(result => {
        if (controller.signal.aborted || generation !== authGeneration.current) return;
        setVendors(result.data);
        setSelectedVendorId(current => result.data.some(vendor => vendor.id === current) ? current : result.data[0]?.id ?? '');
      })
      .catch(reason => {
        if (controller.signal.aborted || generation !== authGeneration.current) return;
        explainError(reason);
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === authGeneration.current) setLoadingVendors(false);
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
  }, [canManage, token, explainError]);

  useEffect(() => {
    modelsController.current?.abort();
    modelsController.current = null;
    const generation = ++modelsGeneration.current;
    if (!canManage || !token || !selectedVendorId || addingVendor) {
      setModels([]);
      setLoadingModels(false);
      return;
    }
    const controller = new AbortController();
    modelsController.current = controller;
    setModels([]);
    setLoadingModels(true);
    setError('');
    void request<{ data: VendorModel[] }>(
      token,
      `/admin/v1/vendors/${encodeURIComponent(selectedVendorId)}/models`,
      'GET',
      undefined,
      controller.signal,
    )
      .then(result => {
        if (controller.signal.aborted || generation !== modelsGeneration.current) return;
        const scope = currentScope.current;
        if (scope.token !== token || scope.selectedVendorId !== selectedVendorId || !scope.canManage) return;
        setModels(result.data);
      })
      .catch(reason => {
        if (controller.signal.aborted || generation !== modelsGeneration.current) return;
        const scope = currentScope.current;
        if (scope.token !== token || scope.selectedVendorId !== selectedVendorId || !scope.canManage) return;
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
  }, [addingVendor, canManage, explainError, selectedVendorId, token]);

  useEffect(() => {
    catalogController.current?.abort();
    catalogController.current = null;
    catalogGeneration.current += 1;
    setCatalog([]);
    setCatalogError('');
    setCatalogLoading(false);
    return () => {
      catalogController.current?.abort();
      catalogController.current = null;
      catalogGeneration.current += 1;
    };
  }, [addingVendor, selectedVendorId, token]);

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

  async function createVendor(input: VendorCreate) {
    await mutate(async (signal, generation) => {
      const result = await request<{ data: Vendor }>(token, '/admin/v1/vendors', 'POST', input, signal);
      if (signal.aborted || generation !== authGeneration.current || !currentScope.current.canManage || currentScope.current.token !== token) return;
      setVendors(previous => [...previous.filter(vendor => vendor.id !== result.data.id), result.data]);
      setAddingVendor(false);
      setEditingVendor(false);
      setSelectedVendorId(result.data.id);
      void refreshWorkspace().catch(() => {});
    });
  }

  async function saveVendor(input: VendorWrite) {
    if (!selectedVendorId) return;
    await mutate(async (signal, generation) => {
      const result = await request<{ data: Vendor }>(
        token,
        `/admin/v1/vendors/${encodeURIComponent(selectedVendorId)}`,
        'PUT',
        input,
        signal,
      );
      if (signal.aborted || generation !== authGeneration.current || currentScope.current.token !== token) return;
      setVendors(previous => previous.map(vendor => vendor.id === result.data.id ? result.data : vendor));
      setEditingVendor(false);
      void refreshWorkspace().catch(() => {});
    });
  }

  async function saveModel(input: ModelWrite) {
    const vendorId = selectedVendorId;
    if (!vendorId) return;
    await mutate(async (signal, generation) => {
      const result = await request<{ data?: VendorModel }>(
        token,
        `/admin/v1/vendors/${encodeURIComponent(vendorId)}/models`,
        'POST',
        input,
        signal,
      );
      if (signal.aborted || generation !== authGeneration.current || currentScope.current.token !== token || currentScope.current.selectedVendorId !== vendorId) return;
      if (result?.data) {
        setModels(previous => [...previous.filter(model => model.alias !== result.data?.alias), result.data!]);
      } else {
        await reloadModels(vendorId);
      }
      void refreshWorkspace().catch(() => {});
    });
  }

  async function checkModel(vendorId: string, alias: string): Promise<ProviderModelCheck> {
    const result = await request<{ data: ProviderModelCheck }>(
      token,
      `/admin/v1/vendors/${encodeURIComponent(vendorId)}/check`,
      'POST',
      { alias },
    );
    return result.data;
  }

  async function loadProviderCatalog() {
    const vendorId = selectedVendorId;
    if (!canManage || !token || !vendorId || catalogLoading || catalog.length > 0) return;
    catalogController.current?.abort();
    const controller = new AbortController();
    catalogController.current = controller;
    const generation = ++catalogGeneration.current;
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const result = await request<{ data: ProviderCatalogModel[] }>(
        token,
        `/admin/v1/vendors/${encodeURIComponent(vendorId)}/catalog`,
        'GET',
        undefined,
        controller.signal,
      );
      const scope = currentScope.current;
      if (!controller.signal.aborted && generation === catalogGeneration.current && scope.canManage && scope.token === token && scope.selectedVendorId === vendorId) {
        setCatalog(result.data);
      }
    } catch (reason) {
      const scope = currentScope.current;
      if (!controller.signal.aborted && generation === catalogGeneration.current && scope.canManage && scope.token === token && scope.selectedVendorId === vendorId) {
        setCatalogError(reason instanceof Error ? reason.message : 'Provider models could not be loaded.');
      }
    } finally {
      if (!controller.signal.aborted && generation === catalogGeneration.current) setCatalogLoading(false);
    }
  }

  async function refreshVendors() {
    setError('');
    const generation = authGeneration.current;
    const signal = authController.current?.signal;
    setLoadingVendors(true);
    try { await reloadVendors(); } catch (reason) {
      if (!signal?.aborted && generation === authGeneration.current) explainError(reason);
    } finally {
      if (!signal?.aborted && generation === authGeneration.current) setLoadingVendors(false);
    }
  }

  async function refreshSelectedModels() {
    if (!selectedVendorId) return;
    setError('');
    const vendorId = selectedVendorId;
    modelsController.current?.abort();
    const controller = new AbortController();
    modelsController.current = controller;
    const generation = ++modelsGeneration.current;
    setLoadingModels(true);
    try {
      const result = await request<{ data: VendorModel[] }>(
        token,
        `/admin/v1/vendors/${encodeURIComponent(vendorId)}/models`,
        'GET',
        undefined,
        controller.signal,
      );
      const scope = currentScope.current;
      if (!controller.signal.aborted && generation === modelsGeneration.current && scope.canManage && scope.token === token && scope.selectedVendorId === vendorId) {
        setModels(result.data);
      }
    } catch (reason) {
      const scope = currentScope.current;
      if (!controller.signal.aborted && generation === modelsGeneration.current && scope.canManage && scope.token === token && scope.selectedVendorId === vendorId) explainError(reason);
    } finally {
      if (!controller.signal.aborted && generation === modelsGeneration.current) setLoadingModels(false);
    }
  }

  async function retryData() {
    await refreshVendors();
    if (selectedVendorId) await refreshSelectedModels();
  }

  if (!canManage) {
    const role = session.kind === 'operator' ? session.operator?.role : null;
    return <>
      <PageHeader title="Provider configuration" />
      <section className="panel vendor-access-denied" role="status">
        <span className="vendor-access-mark"><ShieldAlert size={18} /></span>
        <div><h2>Installation access required</h2><p>Only an installation admin can view or change providers. {role ? `Your ${role} session is scoped to its organization and workspace.` : 'Connect with an installation admin session to continue.'}</p></div>
      </section>
    </>;
  }

  return <>
    <PageHeader title="Provider configuration" action={canManage && <Button type="button" onClick={() => { setError(''); setAddingVendor(true); }}><Router size={16} />Add provider</Button>} />
    {error && !addingVendor && !editingVendor && <div className="vendor-error" role="alert"><span>{error}</span><Button type="button" size="xs" variant="ghost" disabled={busy || loadingVendors || loadingModels} onClick={() => void retryData()}>Retry</Button></div>}
    <div className="vendor-workspace">
      <VendorDirectory
        vendors={vendors}
        selectedId={addingVendor ? '' : selectedVendorId}
        loading={loadingVendors}
        disabled={busy || loadingVendors}
        onSelect={id => { setError(''); setAddingVendor(false); setSelectedVendorId(id); }}
        onRefresh={() => void refreshVendors()}
      />
      {!loadingVendors && selectedVendor ? <section className="panel vendor-detail-panel" aria-labelledby="vendor-detail-title">
        <div className="vendor-detail-heading"><ProviderLogo provider={connectionIdentity(selectedVendor)} size="large" /><div><h2 id="vendor-detail-title">{selectedVendor.name}</h2><p>{selectedVendor.adapter === 'openrouter' ? 'OpenRouter API' : 'OpenAI-compatible API'}</p></div><span className={'vendor-status-badge' + (selectedVendor.enabled ? ' is-enabled' : '')}>{selectedVendor.enabled ? 'Enabled' : 'Disabled'}</span></div>
        <dl className="vendor-detail-facts"><div><dt>API endpoint</dt><dd title={selectedVendor.api_base}>{selectedVendor.api_base}</dd></div><div><dt>Provider credential</dt><dd>{selectedVendor.has_credential ? <><ShieldCheck size={15} />Stored securely</> : <><KeyRound size={15} />Not configured</>}</dd></div><div><dt>Model routes</dt><dd>{loadingModels ? 'Loading…' : `${models.length} configured`}</dd></div></dl>
        <div className="vendor-detail-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => { setError(''); setEditingVendor(true); }}><Pencil size={15} />Edit provider</Button><a href={`${import.meta.env.BASE_URL}models/`}>Browse model catalog<ArrowUpRight size={14} /></a></div>
      </section> : loadingVendors ? <section className="panel vendor-detail-panel vendor-editor-loading" role="status">Loading providers…</section> : <section className="panel vendor-detail-panel"><div className="vendor-empty"><span className="vendor-empty-mark"><Router size={17} /></span><strong>Select a provider</strong><p>Provider credentials stay in the gateway. Add a provider to make upstream models available.</p><Button type="button" onClick={() => setAddingVendor(true)}>Add provider</Button></div></section>}
    </div>
    {selectedVendor && !addingVendor && <ModelMappings
      key={selectedVendor.id}
      models={models}
      catalog={catalog}
      catalogLoading={catalogLoading}
      catalogError={catalogError}
      loading={loadingModels}
      disabled={busy || loadingModels}
      onRefresh={() => void refreshSelectedModels()}
      onLoadCatalog={loadProviderCatalog}
      onSave={saveModel}
      onCheck={alias => checkModel(selectedVendor.id, alias)}
    />}
    <ModalFrame open={addingVendor || editingVendor} onOpenChange={open => { if (!open && !busy) { setAddingVendor(false); setEditingVendor(false); } }} title={addingVendor ? 'Add a provider' : `Edit ${selectedVendor?.name ?? 'provider'}`} description={addingVendor ? 'Niu stores the upstream credential and routes client requests through this endpoint.' : 'Update the provider endpoint or replace its stored credential.'} className="vendor-dialog">
      {error && <p className="error-text" role="alert">{error}</p>}
      {(addingVendor || editingVendor && selectedVendor) && <VendorEditor
        key={addingVendor ? 'new-vendor' : `${selectedVendor!.id}:${selectedVendor!.revision}`}
        vendor={addingVendor ? null : selectedVendor}
        disabled={busy}
        onCreate={createVendor}
        onSave={saveVendor}
      />}
    </ModalFrame>
  </>;
}
