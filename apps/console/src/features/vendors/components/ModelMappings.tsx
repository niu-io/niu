import { useState } from 'react';
import { Plus, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ModelWrite, VendorModel } from '../api';
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

export default function ModelMappings({ models, loading, disabled, onRefresh, onSave }: {
  models: VendorModel[];
  loading: boolean;
  disabled: boolean;
  onRefresh: () => void;
  onSave: (input: ModelWrite) => Promise<void>;
}) {
  const [editing, setEditing] = useState<VendorModel | null | 'new'>(null);

  async function save(input: ModelWrite) {
    await onSave(input);
    setEditing(null);
  }

  return <section className="panel vendor-models" aria-labelledby="vendor-models-title">
    <div className="vendor-panel-heading">
      <div><h2 id="vendor-models-title">Model mappings</h2><p>Client aliases routed through this provider</p></div>
      <div className="vendor-heading-actions">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Refresh model mappings" disabled={disabled || loading} onClick={onRefresh}><span className="sr-only">Refresh</span><Route size={15} /></Button>
        <Button type="button" size="sm" disabled={disabled} onClick={() => setEditing('new')}><Plus />Add model</Button>
      </div>
    </div>
    {loading
      ? <div className="vendor-loading" role="status">Loading model mappings…</div>
      : models.length === 0
        ? <div className="vendor-empty vendor-model-empty">
          <span className="vendor-empty-mark"><Route size={17} /></span>
          <strong>No model mappings yet</strong>
          <p>Add the first alias to route requests to this provider.</p>
          <Button type="button" variant="outline" disabled={disabled} onClick={() => setEditing('new')}><Plus />Add model mapping</Button>
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
                <td className="vendor-model-action"><Button type="button" size="xs" variant="outline" disabled={disabled} onClick={() => setEditing(model)}>Edit</Button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
    {editing !== null && <div className="vendor-model-form-wrap">
      <ModelMappingForm
        key={editing === 'new' ? 'new' : `${editing.alias}:${editing.revision}`}
        model={editing === 'new' ? null : editing}
        disabled={disabled}
        onCancel={() => setEditing(null)}
        onSave={save}
      />
    </div>}
  </section>;
}
