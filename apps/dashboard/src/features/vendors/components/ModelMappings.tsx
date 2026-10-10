import { Table as ShadcnTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconX as X } from "@tabler/icons-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity } from '@/lib/providers';
import { useMemo, useRef, useState } from 'react';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { IconChevronLeft as ChevronLeft } from "@tabler/icons-react";
import { IconChevronRight as ChevronRight } from "@tabler/icons-react";
import { IconPlus as Plus } from "@tabler/icons-react";
import { IconRoute as Route, IconRefresh as Refresh } from "@tabler/icons-react";
import { IconFilter as Filter } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ModelWrite, ProviderCatalogModel, ProviderModelCheck, VendorModel } from '../api';
import ModelMappingForm from './ModelMappingForm';

function capabilityNames(model: VendorModel) {
  const names: string[] = [];
  if (model.capabilities.video_schema) names.push('Video · configured');
  if (model.capabilities.supports_tool_calls) names.push(model.capabilities.supports_streaming_tool_calls ? 'Tools · streaming' : 'Tools');
  if (model.capabilities.supports_structured_output) names.push('Structured output');
  if (model.capabilities.supports_embeddings) {
    const options = [model.capabilities.supports_embedding_dimensions && 'dimensions', model.capabilities.supports_embedding_base64 && 'base64'].filter(Boolean);
    names.push(options.length ? `Embeddings · ${options.join(', ')}` : 'Embeddings');
  }
  if (model.capabilities.supports_responses) names.push('Responses');
  return names;
}

export default function ModelMappings({ ownerFunded = false, models, catalog, catalogLoading, catalogError, loading, disabled, onRefresh, onLoadCatalog, onSave, onCheck }: {
  ownerFunded?: boolean;
  models: VendorModel[];
  catalog: ProviderCatalogModel[];
  catalogLoading: boolean;
  catalogError: string;
  loading: boolean;
  disabled: boolean;
  onRefresh: () => void;
  onLoadCatalog: () => Promise<void>;
  onSave: (input: ModelWrite) => Promise<void>;
  onCheck: (alias: string) => Promise<ProviderModelCheck>;
}) {
  const [editing, setEditing] = useState<VendorModel | null | 'new'>(null);
  const [query, setQuery] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);
  const editorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [page, setPage] = useState(0);
  const [checkingAliases, setCheckingAliases] = useState<Set<string>>(() => new Set());
  const [checkResults, setCheckResults] = useState<Record<string, ProviderModelCheck>>({});
  const [checkErrors, setCheckErrors] = useState<Record<string, string>>({});
  const filteredModels = useMemo(() => {
    const value = query.trim().toLowerCase();
    return models.filter(model => !value || `${model.alias} ${model.upstream_model}`.toLowerCase().includes(value)
      || (model.enabled ? 'enabled' : 'disabled') === value
      || (model.available === true ? 'available' : model.available === false ? 'unavailable' : 'not checked') === value
      || (model.public_catalog ? 'public' : 'private') === value);
  }, [models, query]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filteredModels.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleModels = filteredModels.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  async function save(input: ModelWrite) {
    await onSave(input);
    setEditing(null);
  }

  function addModel() {
    setEditing('new');
    void onLoadCatalog();
  }

  async function check(alias: string) {
    setCheckingAliases(current => new Set(current).add(alias));
    setCheckErrors(current => ({ ...current, [alias]: '' }));
    try {
      const result = await onCheck(alias);
      setCheckResults(current => ({ ...current, [alias]: result }));
    } catch (reason) {
      setCheckErrors(current => ({
        ...current,
        [alias]: reason instanceof Error ? reason.message : 'Check failed.',
      }));
    } finally {
      setCheckingAliases(current => {const next = new Set(current);next.delete(alias);return next;});
    }
  }

  function checkLabel(result: ProviderModelCheck, model: VendorModel) {
    if (result.status === 'connected' && result.model === 'listed') return model.capabilities.video_schema ? 'Reachable · model listed. Video generation is not verified by this check.' : 'Reachable · model listed. Try Chat to verify access.';
    if (result.status === 'connected' && result.model === 'not_listed') return 'Reachable · model not listed. Check the upstream ID.';
    if (result.status === 'credentials_rejected') return 'Key rejected. Check the saved supplier key.';
    if (result.status === 'private_endpoint_blocked') return 'Private endpoint blocked.';
    if (result.status === 'endpoint_unavailable') return 'Could not reach supplier endpoint.';
    if (result.status === 'invalid_endpoint') return 'Supplier endpoint URL is invalid.';
    if (result.status === 'redirect_blocked') return 'Supplier redirected; Niu did not follow it.';
    if (result.status === 'provider_rate_limited') return 'Supplier rate limited the check.';
    if (result.status === 'model_catalog_unavailable') return 'Supplier has no compatible model list.';
    if (result.status === 'model_catalog_too_large') return 'Supplier model list exceeded the 2 MiB check limit.';
    if (result.status === 'invalid_model_catalog') return 'Supplier returned an unreadable model list.';
    return `Supplier returned an error${result.http_status ? ` (${result.http_status})` : ''}.`;
  }

  return <section className="vendor-models" aria-label="Model routes">
    <div className="vendor-panel-heading flex-wrap gap-3"><div className="flex min-w-0 w-full max-w-sm items-center gap-2"><Filter size={17} className="shrink-0"/><Input aria-label="Filter model routes" ref={filterRef} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Filter by alias or upstream model" /></div>
      <div className="vendor-heading-actions">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Refresh model mappings" disabled={disabled || loading} onClick={onRefresh}><span className="sr-only">Refresh</span><Refresh size={15} aria-hidden="true" /></Button>
        <Button type="button" size="sm" disabled={disabled} onClick={event => { editorTriggerRef.current = event.currentTarget; addModel(); }}><Plus />Add model</Button>
      </div>
    </div>
    {loading
      ? <div className="vendor-loading" role="status">Loading model mappings…</div>
      : models.length === 0
        ? <div className="vendor-empty vendor-model-empty">
          <span className="vendor-empty-mark"><Route size={17} /></span>
          <strong>No model mappings yet</strong>
          <p>Add the first alias to route requests to this supplier.</p>
          <Button type="button" variant="outline" disabled={disabled} onClick={event => { editorTriggerRef.current = event.currentTarget; addModel(); }}><Plus />Add model mapping</Button>
        </div>
        : <><div className="vendor-model-toolbar"><span>{filteredModels.length.toLocaleString()} route{filteredModels.length === 1 ? '' : 's'}</span></div>{filteredModels.length === 0 ? <Empty className="min-h-60"><EmptyHeader><EmptyTitle role="heading" aria-level={3}>No matching routes</EmptyTitle><EmptyDescription>Try another alias or upstream model.</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" variant="outline" onClick={() => { setQuery(''); setPage(0); filterRef.current?.focus(); }}>Clear filter</Button></EmptyContent></Empty> : <div className="table-wrap vendor-model-table-wrap">
          <ShadcnTable className="vendor-model-table">
            <TableHeader><TableRow><TableHead scope="col">Niu alias</TableHead><TableHead scope="col">Upstream model</TableHead><TableHead scope="col">Optional features</TableHead><TableHead scope="col">Catalog</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>{visibleModels.map(model => {
              const features = capabilityNames(model);
              return <TableRow key={model.alias}>
                <TableCell><span className="provider-model-cell"><ProviderLogo provider={modelIdentity({ id: model.alias, upstream_model: model.upstream_model })} size="small" /><strong className="vendor-model-alias">{model.alias}</strong></span></TableCell>
                <TableCell><span className="vendor-upstream-model">{model.upstream_model}</span></TableCell>
                <TableCell><span className="vendor-feature-list">{features.length ? features.join(', ') : 'None declared'}</span></TableCell>
                <TableCell><span className={'vendor-catalog-state' + (model.public_catalog && !model.owner_funded ? ' is-public' : '')}>{model.public_catalog && !model.owner_funded ? 'Public' : 'Private'}</span></TableCell>
                <TableCell><span className={'vendor-state' + (model.available === true ? ' is-enabled' : '')}>{!model.enabled ? 'Disabled' : model.available === true ? 'Available' : model.available === false ? 'Unavailable' : 'Not checked'}</span></TableCell>
                <TableCell className="vendor-model-actions">
                  <div className="vendor-model-action-buttons">
                    <Button type="button" size="xs" variant="outline" disabled={disabled || checkingAliases.has(model.alias)} onClick={() => void check(model.alias)}>{checkingAliases.has(model.alias) ? 'Checking…' : 'Check'}</Button>
                    <Button type="button" size="xs" variant="ghost" disabled={disabled} onClick={event => { editorTriggerRef.current = event.currentTarget; setEditing(model); }}>Edit</Button>
                  </div>
                  {checkErrors[model.alias]
                    ? <span className="vendor-check-result is-error" role="alert">{checkErrors[model.alias]}</span>
                    : checkResults[model.alias]
                      ? <span className="vendor-check-result" aria-live="polite">{checkLabel(checkResults[model.alias], model)}</span>
                      : null}
                </TableCell>
              </TableRow>;
            })}</TableBody>
          </ShadcnTable>
        </div>}{filteredModels.length > pageSize && <div className="model-pagination"><span>{(currentPage * pageSize + 1).toLocaleString()}–{Math.min((currentPage + 1) * pageSize, filteredModels.length).toLocaleString()} of {filteredModels.length.toLocaleString()}</span><div><Button variant="outline" size="icon" aria-label="Previous page" disabled={currentPage === 0} onClick={() => setPage(Math.max(0, currentPage - 1))}><ChevronLeft size={16} /></Button><Button variant="outline" size="icon" aria-label="Next page" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}><ChevronRight size={16} /></Button></div></div>}</>}
    <Dialog open={editing !== null} onOpenChange={open => { if (!open && !disabled) setEditing(null); }}>
      <DialogContent className="niu-modal model-route-dialog" showCloseButton={false} onCloseAutoFocus={event => { if (editorTriggerRef.current?.isConnected) { event.preventDefault(); editorTriggerRef.current.focus(); } }}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>{editing === 'new' ? 'Add a model route' : `Edit ${editing?.alias ?? 'model route'}`}</DialogTitle><DialogDescription>Choose the name clients will send and map it to the upstream provider model.</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
        </DialogHeader>
      {editing !== null &&
      <ModelMappingForm
        key={editing === 'new' ? 'new' : `${editing.alias}:${editing.revision}`}
        ownerFunded={ownerFunded}
        model={editing === 'new' ? null : editing}
        catalog={catalog}
        catalogLoading={catalogLoading}
        catalogError={catalogError}
        disabled={disabled}
        onCancel={() => setEditing(null)}
        onRetryCatalog={() => void onLoadCatalog()}
        onSave={save}
      />
      }
    </DialogContent>
    </Dialog>
  </section>;
}
