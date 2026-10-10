import { Link, useSearchParams, useParams } from 'react-router';
import { IconX as X } from "@tabler/icons-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ProviderLogo from '@/components/ProviderLogo';
import { connectionIdentity } from '@/lib/providers';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconArrowUpRight as ArrowUpRight } from "@tabler/icons-react";

import { IconPencil as Pencil } from "@tabler/icons-react";
import { IconPlugConnected as Router } from "@tabler/icons-react";
import { IconShieldExclamation as ShieldAlert } from "@tabler/icons-react";
import PageHeader from '@/components/PageHeader';
import type { AdminSession, Workspace } from '@/app/dashboard-context';
import { Button } from '@/components/ui/button';
import { VendorRequestError, request, type ModelWrite, type ProviderCatalogModel, type ProviderModelCheck, type Vendor, type VendorModel, type VendorWrite } from '../api';
import SupplierDirectory from './SupplierDirectory';
import SupplierEditor, { type VendorCreate } from './SupplierEditor';
import ModelMappings from './ModelMappings';
import CodexSubscriptions from './CodexSubscriptions';

export default function SuppliersView({ token, session, refreshWorkspace, workspaces = [], catalogPath = '/workspaces/default/models' }: {
  workspaces?: Workspace[];
  catalogPath?: string;
  token: string;
  session: AdminSession;
  refreshWorkspace: () => Promise<void>;
}) {
  const [search] = useSearchParams();
  const { supplierId: routeSupplierId } = useParams();
  const supplierId = routeSupplierId ?? search.get('supplier');
  const vendorsPath = '/admin/v1/vendors' + (supplierId ? '?supplier=' + encodeURIComponent(supplierId) : '');
  const canManage = (session.kind === 'installation' || session.permissions.platform_admin) && session.permissions.manage_operators;
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
  const [managingModels, setManagingModels] = useState(false);
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
    const result = await request<{ data: Vendor[] }>(token, vendorsPath, 'GET', undefined, requestSignal);
    if (requestSignal.aborted || generation !== authGeneration.current || !currentScope.current.canManage || currentScope.current.token !== token) return;
    setVendors(result.data);
    setSelectedVendorId(current => result.data.some(vendor => vendor.id === current) ? current : result.data[0]?.id ?? '');
    if (result.data.length > 0) setAddingVendor(false);
  }, [canManage, token, vendorsPath]);

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
      setManagingModels(false);
      busyRef.current = false;
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    authController.current = controller;
    setLoadingVendors(true);
    setError('');
    void request<{ data: Vendor[] }>(token, vendorsPath, 'GET', undefined, controller.signal)
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
  }, [canManage, token, explainError, vendorsPath]);

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
      // Creation committed: close before discovery so a failed refresh cannot
      // invite a duplicate key creation.
      setAddingVendor(false);
      setEditingVendor(false);
      setSelectedVendorId(result.data.id);
      try {
        await reloadVendors(signal);
      } catch {
        throw new Error('API key saved, but the Supplier list could not be refreshed. Refresh the list to view it.');
      }
      if (signal.aborted || generation !== authGeneration.current) return;
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
      setVendors(previous => previous.map(vendor => vendor.id === result.data.id ? { ...result.data, supplier: vendor.supplier } : vendor));
      setEditingVendor(false);
      void refreshWorkspace().catch(() => {});
    });
  }

  async function saveModel(input: ModelWrite) {
    const vendorId = selectedVendorId;
    if (!vendorId) return;
    await mutate(async (signal, generation) => {
      await request<{ data?: VendorModel }>(
        token,
        `/admin/v1/vendors/${encodeURIComponent(vendorId)}/models`,
        'POST',
        input,
        signal,
      );
      if (signal.aborted || generation !== authGeneration.current || currentScope.current.token !== token || currentScope.current.selectedVendorId !== vendorId) return;
      // Configuration writes do not return dispatch eligibility. Read it again
      // after saving rather than retaining a stale availability badge.
      await reloadModels(vendorId);
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
        setCatalogError(reason instanceof Error ? reason.message : 'Supplier models could not be loaded.');
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
    return <>
      <PageHeader title="Suppliers" />
      <section className="panel vendor-access-denied" role="status">
        <span className="vendor-access-mark"><ShieldAlert size={18} /></span>
        <div><h2>Platform administrator access required</h2><p>Your account does not have permission to manage Suppliers. Contact a platform administrator if you need access.</p></div>
      </section>
    </>;
  }

  return <>
    {supplierId && <div className="supplier-section-heading"><h2>API keys &amp; routes</h2><p>Configure API keys and the model routes they serve.</p></div>}
    <PageHeader title="Suppliers" action={canManage && <>{<Button type="button" className="header-icon-action" aria-label={supplierId ? 'Add API key' : 'Add supplier'} title={supplierId ? 'Add API key' : 'Add supplier'} onClick={() => { setError(''); setAddingVendor(true); }}><Router size={16} aria-hidden="true" /><span>{supplierId ? 'Add API key' : 'Add supplier'}</span></Button>}</>} />
    {error && !addingVendor && !editingVendor && <div className="vendor-error" role="alert"><span>{error}</span><Button type="button" size="xs" variant="ghost" disabled={busy || loadingVendors || loadingModels} onClick={() => void retryData()}>Retry</Button></div>}
    <div className="supplier-detail-layout">
      {vendors.length > 1 && <SupplierDirectory
        vendors={vendors}
        selectedId={addingVendor ? '' : selectedVendorId}
        loading={loadingVendors}
        disabled={busy || loadingVendors}
        onSelect={id => { setError(''); setAddingVendor(false); setSelectedVendorId(id); }}
        onRefresh={() => void refreshVendors()}
      />}
      {!loadingVendors && selectedVendor ? <section className="supplier-detail-header" aria-labelledby="vendor-detail-title">
        <div className="supplier-detail-identity"><ProviderLogo provider={connectionIdentity(selectedVendor)} size="large" /><div><h2 id="vendor-detail-title">{selectedVendor.name}</h2><p>{selectedVendor.adapter === 'openrouter' ? 'OpenRouter API' : 'OpenAI-compatible API'}</p></div><span className={'vendor-status-badge' + (selectedVendor.enabled ? ' is-enabled' : '')}>{selectedVendor.enabled ? 'Enabled' : 'Disabled'}</span></div>
        <div className="supplier-detail-bottom"><p className="supplier-endpoint">{selectedVendor.api_base}</p><div className="vendor-detail-actions"><Button type="button" size="sm" onClick={() => setManagingModels(true)} disabled={loadingModels}>Model routes{!loadingModels && ` (${models.length})`}</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setError(''); setEditingVendor(true); }}><Pencil size={15} />Edit API key</Button><Button asChild size="sm" variant="ghost"><Link to={catalogPath}>Model catalog<ArrowUpRight size={14} /></Link></Button></div></div>
        {!selectedVendor.has_credential && <p className="error-text" role="status">No credential stored. Edit this API key to configure access.</p>}
      </section> : loadingVendors ? <section className="panel vendor-detail-panel vendor-editor-loading" role="status">Loading API keys…</section> : <section className="panel vendor-detail-panel"><div className="vendor-empty"><span className="vendor-empty-mark"><Router size={17} /></span><strong>No API keys</strong><p>Add an API key to configure the models supplied by this Supplier.</p><Button type="button" onClick={() => setAddingVendor(true)}>Add API key</Button></div></section>}
    </div>
    {!supplierId && <CodexSubscriptions token={token} workspaces={workspaces} />}
    <Dialog open={managingModels && !!selectedVendor && !addingVendor} onOpenChange={setManagingModels}>
      <DialogContent className="supplier-models-dialog" showCloseButton={false}>
        <DialogHeader className="flex-row items-start justify-between gap-4 text-left">
          <div><DialogTitle>{selectedVendor?.supplier?.name ?? selectedVendor?.name ?? 'Supplier'} routes</DialogTitle><DialogDescription>Model routes served by {selectedVendor?.name ?? 'this API key'}.</DialogDescription></div>
          <DialogClose asChild><Button variant="ghost" size="icon-sm" aria-label="Close model management"><X /></Button></DialogClose>
        </DialogHeader>
        {selectedVendor && <ModelMappings
      key={selectedVendor.id}
      credentialRevision={selectedVendor.revision}
      ownerFunded={selectedVendor.owner_funded === true}
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
      </DialogContent>
    </Dialog>
    <Dialog open={addingVendor || editingVendor} onOpenChange={open => { if (!open && !busy) { setAddingVendor(false); setEditingVendor(false); } }}>
      <DialogContent className="niu-modal vendor-dialog" showCloseButton={false}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>{addingVendor ? 'Add Supplier API key' : `Edit ${selectedVendor?.name ?? 'API key'}`}</DialogTitle><DialogDescription>{addingVendor ? 'Choose a Supplier and configure the API key for its model routes.' : 'Update the supplier endpoint or replace its stored credential.'}</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
        </DialogHeader>
      {error && <p className="error-text" role="alert">{error}</p>}
      {(addingVendor || editingVendor && selectedVendor) && <SupplierEditor
        key={addingVendor ? 'new-vendor' : `${selectedVendor!.id}:${selectedVendor!.revision}`}
        token={token}
        initialSupplierId={supplierId}
        vendor={addingVendor ? null : selectedVendor}
        disabled={busy}
        onCreate={createVendor}
        onSave={saveVendor}
      />}
    </DialogContent>
    </Dialog>
  </>;
}
