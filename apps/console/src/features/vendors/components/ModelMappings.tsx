import { useState } from 'react';
import { Plus, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ModelWrite, ProviderCatalogModel, ProviderModelCheck, VendorModel } from '../api';
import ModelMappingForm from './ModelMappingForm';

function capabilityNames(model: VendorModel) {
  const names: string[] = [];
  if (model.capabilities.supports_tool_calls) names.push(model.capabilities.supports_streaming_tool_calls ? 'Tools · streaming' : 'Tools');
  if (model.capabilities.supports_structured_output) names.push('Structured output');
  if (model.capabilities.supports_embeddings) {
    const options = [model.capabilities.supports_embedding_dimensions && 'dimensions', model.capabilities.supports_embedding_base64 && 'base64'].filter(Boolean);
    names.push(options.length ? `Embeddings · ${options.join(', ')}` : 'Embeddings');
  }
  if (model.capabilities.supports_responses) names.push('Responses');
  return names;
}

export default function ModelMappings({ models, catalog, catalogLoading, catalogError, loading, disabled, onRefresh, onLoadCatalog, onSave, onCheck }: {
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
  const [checkingAlias, setCheckingAlias] = useState('');
  const [checkResults, setCheckResults] = useState<Record<string, ProviderModelCheck>>({});
  const [checkErrors, setCheckErrors] = useState<Record<string, string>>({});

  async function save(input: ModelWrite) {
    await onSave(input);
    setEditing(null);
  }

  function addModel() {
    setEditing('new');
    void onLoadCatalog();
  }

  async function check(alias: string) {
    setCheckingAlias(alias);
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
      setCheckingAlias(current => current === alias ? '' : current);
    }
  }

  function checkLabel(result: ProviderModelCheck) {
    if (result.status === 'connected' && result.model === 'listed') return 'Reachable · model listed. Try Playground to verify access.';
    if (result.status === 'connected' && result.model === 'not_listed') return 'Reachable · model not listed. Check the upstream ID.';
    if (result.status === 'credentials_rejected') return 'Key rejected. Check the saved provider key.';
    if (result.status === 'private_endpoint_blocked') return 'Private endpoint blocked.';
    if (result.status === 'endpoint_unavailable') return 'Could not reach provider endpoint.';
    if (result.status === 'invalid_endpoint') return 'Provider endpoint URL is invalid.';
    if (result.status === 'redirect_blocked') return 'Provider redirected; Niu did not follow it.';
    if (result.status === 'provider_rate_limited') return 'Provider rate limited the check.';
    if (result.status === 'model_catalog_unavailable') return 'Provider has no compatible model list.';
    if (result.status === 'model_catalog_too_large') return 'Provider model list exceeded the 2 MiB check limit.';
    if (result.status === 'invalid_model_catalog') return 'Provider returned an unreadable model list.';
    return `Provider returned an error${result.http_status ? ` (${result.http_status})` : ''}.`;
  }

  return <section className="panel vendor-models" aria-labelledby="vendor-models-title">
    <div className="vendor-panel-heading">
      <div><h2 id="vendor-models-title">Model mappings</h2><p>Client aliases routed through this provider</p></div>
      <div className="vendor-heading-actions">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Refresh model mappings" disabled={disabled || loading} onClick={onRefresh}><span className="sr-only">Refresh</span><Route size={15} /></Button>
        <Button type="button" size="sm" disabled={disabled} onClick={addModel}><Plus />Add model</Button>
      </div>
    </div>
    {loading
      ? <div className="vendor-loading" role="status">Loading model mappings…</div>
      : models.length === 0
        ? <div className="vendor-empty vendor-model-empty">
          <span className="vendor-empty-mark"><Route size={17} /></span>
          <strong>No model mappings yet</strong>
          <p>Add the first alias to route requests to this provider.</p>
          <Button type="button" variant="outline" disabled={disabled} onClick={addModel}><Plus />Add model mapping</Button>
        </div>
        : <div className="table-wrap vendor-model-table-wrap">
          <table className="vendor-model-table">
            <thead><tr><th scope="col">Niu alias</th><th scope="col">Upstream model</th><th scope="col">Optional features</th><th scope="col">Catalog</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{models.map(model => {
              const features = capabilityNames(model);
              return <tr key={model.alias}>
                <td><strong className="vendor-model-alias">{model.alias}</strong></td>
                <td><span className="vendor-upstream-model">{model.upstream_model}</span></td>
                <td><span className="vendor-feature-list">{features.length ? features.join(', ') : 'None declared'}</span></td>
                <td><span className={'vendor-catalog-state' + (model.public_catalog ? ' is-public' : '')}>{model.public_catalog ? 'Public' : 'Private'}</span></td>
                <td><span className={'vendor-state' + (model.enabled ? ' is-enabled' : '')}>{model.enabled ? 'Enabled' : 'Disabled'}</span></td>
                <td className="vendor-model-actions">
                  <div className="vendor-model-action-buttons">
                    <Button type="button" size="xs" variant="outline" disabled={disabled || checkingAlias === model.alias} onClick={() => void check(model.alias)}>{checkingAlias === model.alias ? 'Checking…' : 'Check'}</Button>
                    <Button type="button" size="xs" variant="ghost" disabled={disabled} onClick={() => setEditing(model)}>Edit</Button>
                  </div>
                  {checkErrors[model.alias]
                    ? <span className="vendor-check-result is-error" role="alert">{checkErrors[model.alias]}</span>
                    : checkResults[model.alias]
                      ? <span className="vendor-check-result" aria-live="polite">{checkLabel(checkResults[model.alias])}</span>
                      : null}
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
    {editing !== null && <div className="vendor-model-form-wrap">
      <ModelMappingForm
        key={editing === 'new' ? 'new' : `${editing.alias}:${editing.revision}`}
        model={editing === 'new' ? null : editing}
        catalog={catalog}
        catalogLoading={catalogLoading}
        catalogError={catalogError}
        disabled={disabled}
        onCancel={() => setEditing(null)}
        onSave={save}
      />
    </div>}
  </section>;
}
