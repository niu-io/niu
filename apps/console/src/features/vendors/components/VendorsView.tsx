import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import type { AdminSession } from '@/app/console-context';
import { Button } from '@/components/ui/button';
import { VendorRequestError, request, type ModelWrite, type Vendor, type VendorModel, type VendorWrite } from '../api';
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
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addingVendor, setAddingVendor] = useState(false);
  const [error, setError] = useState('');
  const authController = useRef<AbortController | null>(null);
  const authGeneration = useRef(0);
  const modelsController = useRef<AbortController | null>(null);
  const modelsGeneration = useRef(0);
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
      <PageHeader title="Vendors" subtitle="Manage provider connections, credentials, and model routes." />
      <section className="panel vendor-access-denied" role="status">
        <span className="vendor-access-mark"><ShieldAlert size={18} /></span>
        <div><h2>Installation access required</h2><p>Only an installation admin can view or change provider connections. {role ? `Your ${role} session is scoped to its organization and project.` : 'Connect with an installation admin session to continue.'}</p></div>
      </section>
    </>;
  }

  return <>
    <PageHeader title="Vendors" subtitle="Manage provider connections, credentials, and model routes." />
    {error && <div className="vendor-error" role="alert"><span>{error}</span><Button type="button" size="xs" variant="ghost" disabled={busy || loadingVendors || loadingModels} onClick={() => void retryData()}>Retry</Button></div>}
    <div className="vendor-workspace">
      <VendorDirectory
        vendors={vendors}
        selectedId={addingVendor ? '' : selectedVendorId}
        loading={loadingVendors}
        disabled={busy || loadingVendors}
        onSelect={id => { setError(''); setAddingVendor(false); setSelectedVendorId(id); }}
        onAdd={() => { setError(''); setAddingVendor(true); setSelectedVendorId(''); }}
        onRefresh={() => void refreshVendors()}
      />
      {(!loadingVendors && (selectedVendor || addingVendor))
        ? <VendorEditor
          key={selectedVendor ? `${selectedVendor.id}:${selectedVendor.revision}` : 'new-vendor'}
          vendor={addingVendor ? null : selectedVendor}
          disabled={busy}
          onCreate={createVendor}
          onSave={saveVendor}
        />
        : <section className="panel vendor-editor vendor-editor-loading" role="status">{loadingVendors ? 'Loading vendor details…' : 'Select a vendor or add a new one.'}</section>}
    </div>
    {selectedVendor && !addingVendor && <ModelMappings
      key={selectedVendor.id}
      models={models}
      loading={loadingModels}
      disabled={busy || loadingModels}
      onRefresh={() => void refreshSelectedModels()}
      onSave={saveModel}
    />}
  </>;
}
