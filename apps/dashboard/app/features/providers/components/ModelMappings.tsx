import { formatLocalizedMessage, readLocale } from '@/shell/ui-locale';
import { translateUI } from '@/shell/ui-locale';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
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
import { TableSkeleton } from '@/components/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProviderDiscoveryEvidence, ModelWrite, ProviderCatalogModel, ProviderModelCheck, VendorModel } from '../api';
import { integrationLabels } from '../api';
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

export default function ModelMappings({ credentialRevision = 0, ownerFunded = false, models, catalog, discovery, catalogLoading, catalogError, loading, disabled, onRefresh, onLoadCatalog, onSave, onCheck }: {
  credentialRevision?: number;
  ownerFunded?: boolean;
  models: VendorModel[];
  catalog: ProviderCatalogModel[];
  discovery: ProviderDiscoveryEvidence | null;
  catalogLoading: boolean;
  catalogError: string;
  loading: boolean;
  disabled: boolean;
  onRefresh: () => void;
  onLoadCatalog: () => Promise<void>;
  onSave: (input: ModelWrite) => Promise<void>;
  onCheck: (alias: string) => Promise<ProviderModelCheck>;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const [editing, setEditing] = useState<VendorModel | null | 'new'>(null);
  const [query, setQuery] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);
  const editorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [page, setPage] = useState(0);
  const checkSequence = useRef(0);
  const [checks, setChecks] = useState<Record<string, { identity: string; sequence: number; pending: boolean; result?: ProviderModelCheck; error?: string }>>({});
  const checkIdentity = (model: VendorModel) => JSON.stringify([model.vendor_id, credentialRevision, model.revision, model.upstream_model, model.enabled]);
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

  async function checkModelRow(model: VendorModel) {
    const alias = model.alias;
    const identity = checkIdentity(model);
    const sequence = ++checkSequence.current;
    setChecks(current => ({ ...current, [alias]: { identity, sequence, pending: true } }));
    try {
      const result = await onCheck(alias);
      setChecks(current => current[alias]?.sequence === sequence
        ? { ...current, [alias]: { identity, sequence, pending: false, result } } : current);
    } catch (reason) {
      setChecks(current => current[alias]?.sequence === sequence
        ? { ...current, [alias]: { identity, sequence, pending: false, error: reason instanceof Error ? reason.message : 'Check failed.' } } : current);
    }
  }

  function checkLabel(result: ProviderModelCheck, model: VendorModel) {
    if (result.status === 'connected' && result.model === 'listed') return model.capabilities.video_schema ? translateUI('Reachable · model listed. Video generation is not verified by this check.') : translateUI('Reachable · model listed. Try Chat to verify access.');
    if (result.status === 'connected' && result.model === 'not_listed') return translateUI('Reachable · model not listed. Check the upstream ID.');
    if (result.status === 'credentials_rejected') return translateUI('Key rejected. Check the saved provider key.');
    if (result.status === 'account_chat_banned') return translateUI('The Qiniu account is not permitted to use chat services (account_chat_banned). Contact Qiniu to restore account access.');
    if (result.status === 'private_endpoint_blocked') return translateUI('Private endpoint blocked.');
    if (result.status === 'endpoint_unavailable') return translateUI('Could not reach provider endpoint.');
    if (result.status === 'invalid_endpoint') return translateUI('Provider endpoint URL is invalid.');
    if (result.status === 'redirect_blocked') return translateUI('Provider redirected; Niu did not follow it.');
    if (result.status === 'provider_rate_limited') return translateUI('Provider rate limited the check.');
    if (result.status === 'model_catalog_unavailable') return translateUI('Provider has no compatible model list.');
    if (result.status === 'model_catalog_too_large') return translateUI('Provider model list exceeded the 2 MiB check limit.');
    if (result.status === 'invalid_model_catalog') return translateUI('Provider returned an unreadable model list.');
    return formatLocalizedMessage('Provider returned an error{0}.', [result.http_status ? ` (${result.http_status})` : ''], readLocale());
  }

  return <section className="vendor-models" aria-label={uiT("Model routes")}>
    <div className="vendor-panel-heading flex-wrap gap-3"><div className="flex min-w-0 w-full max-w-sm items-center gap-2"><Filter size={17} className="shrink-0"/><Input aria-label={uiT("Filter model routes")} ref={filterRef} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder={uiT("Filter by alias or upstream model")} /></div>
      <div className="vendor-heading-actions">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={uiT("Refresh model mappings")} disabled={disabled || loading} onClick={onRefresh}><span className="sr-only">{uiT("Refresh")}</span><Refresh size={15} aria-hidden="true" /></Button>
        <Button type="button" size="sm" disabled={disabled} onClick={event => { editorTriggerRef.current = event.currentTarget; addModel(); }}><Plus />{uiT("Add model")}</Button>
      </div>
    </div>
    {loading
      ? <div className="vendor-loading"><TableSkeleton columns={6} rows={4} label={uiT("Loading model mappings…")} /></div>
      : models.length === 0
        ? <div className="vendor-empty vendor-model-empty">
          <span className="vendor-empty-mark"><Route size={17} /></span>
          <strong>{uiT("No model mappings yet")}</strong>
          <p>{uiT("Add the first alias to route requests to this provider.")}</p>
          <Button type="button" variant="outline" disabled={disabled} onClick={event => { editorTriggerRef.current = event.currentTarget; addModel(); }}><Plus />{uiT("Add model mapping")}</Button>
        </div>
        : <><div className="vendor-model-toolbar"><span>{filteredModels.length.toLocaleString(readUILocale())}{" "}{uiT("route")}{filteredModels.length === 1 ? '' : 's'}</span></div>{filteredModels.length === 0 ? <Empty className="min-h-60"><EmptyHeader><EmptyTitle role="heading" aria-level={3}>{uiT("No matching routes")}</EmptyTitle><EmptyDescription>{uiT("Try another alias or upstream model.")}</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" variant="outline" onClick={() => { setQuery(''); setPage(0); filterRef.current?.focus(); }}>{uiT("Clear filter")}</Button></EmptyContent></Empty> : <div className="table-wrap vendor-model-table-wrap">
          <ShadcnTable className="vendor-model-table">
            <TableHeader><TableRow><TableHead scope="col">{uiT("Niu alias")}</TableHead><TableHead scope="col">{uiT("Upstream model")}</TableHead><TableHead scope="col">{uiT("Optional features")}</TableHead><TableHead scope="col">{uiT("Catalog")}</TableHead><TableHead scope="col">{uiT("Status")}</TableHead><TableHead scope="col"><span className="sr-only">{uiT("Actions")}</span></TableHead></TableRow></TableHeader>
            <TableBody>{visibleModels.map(model => {
              const features = capabilityNames(model);
              const check = checks[model.alias]?.identity === checkIdentity(model) ? checks[model.alias] : undefined;
              return <TableRow key={model.alias}>
                <TableCell><span className="provider-model-cell"><ProviderLogo provider={modelIdentity({ id: model.alias, upstream_model: model.upstream_model })} size="small" /><strong className="vendor-model-alias">{model.alias}</strong></span></TableCell>
                <TableCell><span className="vendor-upstream-model">{model.upstream_model}</span></TableCell>
                <TableCell><span className="vendor-feature-list">{features.length ? features.join(', ') : uiT("None declared")}</span></TableCell>
                <TableCell><span className={'vendor-catalog-state' + (model.public_catalog && !model.owner_funded ? ' is-public' : '')}>{model.public_catalog && !model.owner_funded ? uiT("Public") : uiT("Private")}</span></TableCell>
                <TableCell><span className={'vendor-state' + (model.available === true ? ' is-enabled' : '')}>{!model.enabled ? uiT("Disabled") : model.available === true ? uiT('Available') : model.available === false ? uiT("Unavailable") : uiT("Not checked")}</span></TableCell>
                <TableCell className="vendor-model-actions">
                  <div className="vendor-model-action-buttons">
                    <Button type="button" size="xs" variant="outline" disabled={disabled || check?.pending} onClick={() => void checkModelRow(model)}>{check?.pending ? uiT("Checking…") : uiT("Check")}</Button>
                    <Button type="button" size="xs" variant="ghost" disabled={disabled} onClick={event => { editorTriggerRef.current = event.currentTarget; setEditing(model); }}>{uiT("Edit")}</Button>
                  </div>
                  {check?.error
                    ? <span className="vendor-check-result is-error" role="alert">{check?.error}</span>
                    : check?.result
                      ? <span className="vendor-check-result" aria-live="polite">{checkLabel(check?.result, model)}</span>
                      : null}
                </TableCell>
              </TableRow>;
            })}</TableBody>
          </ShadcnTable>
        </div>}{filteredModels.length > pageSize && <div className="model-pagination"><span>{(currentPage * pageSize + 1).toLocaleString(readUILocale())}–{Math.min((currentPage + 1) * pageSize, filteredModels.length).toLocaleString(readUILocale())}{" "}{uiT("of")}{" "}{filteredModels.length.toLocaleString(readUILocale())}</span><div><Button variant="outline" size="icon" aria-label={uiT("Previous page")} disabled={currentPage === 0} onClick={() => setPage(Math.max(0, currentPage - 1))}><ChevronLeft size={16} /></Button><Button variant="outline" size="icon" aria-label={uiT("Next page")} disabled={currentPage + 1 >= pageCount} onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}><ChevronRight size={16} /></Button></div></div>}</>}
    <Dialog open={editing !== null} onOpenChange={open => { if (!open && !disabled) setEditing(null); }}>
      <DialogContent className="niu-modal model-route-dialog" showCloseButton={false} onCloseAutoFocus={event => { if (editorTriggerRef.current?.isConnected) { event.preventDefault(); editorTriggerRef.current.focus(); } }}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>{editing === 'new' ? uiT("Add model") : uiF("Edit {0}", [editing?.alias ?? uiT("model route")])}</DialogTitle><DialogDescription>{uiT("Choose the name clients will send and map it to the upstream provider model.")}</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label={uiT("Close dialog")}><X size={18} /></DialogClose>
        </DialogHeader>
      {editing !== null &&
      <>
      {discovery && !catalogLoading && !catalogError && <div className="space-y-1 text-sm text-muted-foreground" role="status">
        <p>{integrationLabels[discovery.integration.effective_type]} · {discovery.inventory_scope === 'credential_filtered' ? uiT("Credential-filtered inventory") : uiT("Instance-reported inventory")}</p>
        <p>{uiT("Catalog read succeeded. Inference and management access have not been verified. Review the selected model and its route settings before saving. Advertised prices do not set purchase rates or customer prices.")}</p>
      </div>}
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
      </>
      }
    </DialogContent>
    </Dialog>
  </section>;
}
