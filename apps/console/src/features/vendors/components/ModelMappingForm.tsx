import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { emptyCapabilities, type ModelCapabilities, type ModelWrite, type ProviderCatalogModel, type VendorModel } from '../api';

const capabilityChoices: Array<{ key: keyof ModelCapabilities; label: string; help: string }> = [
  { key: 'supports_tool_calls', label: 'Function tools', help: 'Tool call responses' },
  { key: 'supports_streaming_tool_calls', label: 'Streaming tools', help: 'Tool deltas in streams' },
  { key: 'supports_structured_output', label: 'Structured output', help: 'JSON schema response format' },
  { key: 'supports_embeddings', label: 'Embeddings', help: 'Text embedding requests' },
  { key: 'supports_embedding_dimensions', label: 'Embedding dimensions', help: 'Custom vector size' },
  { key: 'supports_embedding_base64', label: 'Base64 embeddings', help: 'Base64 vector encoding' },
  { key: 'supports_responses', label: 'Responses API', help: 'Text-only Responses subset' },
];

export default function ModelMappingForm({ model, catalog, catalogLoading, catalogError, disabled, onCancel, onSave }: {
  model: VendorModel | null;
  catalog: ProviderCatalogModel[];
  catalogLoading: boolean;
  catalogError: string;
  disabled: boolean;
  onCancel: () => void;
  onSave: (input: ModelWrite) => Promise<void>;
}) {
  const [alias, setAlias] = useState(model?.alias ?? '');
  const [upstreamModel, setUpstreamModel] = useState(model?.upstream_model ?? '');
  const [publicCatalog, setPublicCatalog] = useState(model?.public_catalog ?? false);
  const [enabled, setEnabled] = useState(model?.enabled ?? true);
  const [capabilities, setCapabilities] = useState<ModelCapabilities>(() => ({ ...emptyCapabilities(), ...model?.capabilities }));
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);

  const visibleCatalog = catalog
    .filter(item => !catalogQuery || `${item.name} ${item.id}`.toLowerCase().includes(catalogQuery.toLowerCase()))
    .slice(0, 12);

  useEffect(() => {
    setAlias(model?.alias ?? '');
    setUpstreamModel(model?.upstream_model ?? '');
    setPublicCatalog(model?.public_catalog ?? false);
    setEnabled(model?.enabled ?? true);
    setCapabilities({ ...emptyCapabilities(), ...model?.capabilities });
    setCatalogQuery('');
    setCatalogOpen(false);
  }, [model?.alias, model?.revision]);

  function chooseProviderModel(item: ProviderCatalogModel) {
    setUpstreamModel(item.id);
    setAlias(item.id.replace(/[^A-Za-z0-9._/-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
    setCatalogQuery(item.name);
    setCatalogOpen(false);
  }

  function handleCatalogKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') setCatalogOpen(false);
    if (event.key === 'Enter' && catalogOpen && visibleCatalog.length > 0) {
      event.preventDefault();
      chooseProviderModel(visibleCatalog[0]);
    }
  }

  function updateCapability(key: keyof ModelCapabilities, checked: boolean) {
    setCapabilities(previous => {
      const next = { ...previous, [key]: checked };
      if (key === 'supports_tool_calls' && !checked) next.supports_streaming_tool_calls = false;
      if (key === 'supports_streaming_tool_calls' && checked) next.supports_tool_calls = true;
      if (key === 'supports_embeddings' && !checked) {
        next.supports_embedding_dimensions = false;
        next.supports_embedding_base64 = false;
      }
      if ((key === 'supports_embedding_dimensions' || key === 'supports_embedding_base64') && checked) {
        next.supports_embeddings = true;
      }
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !alias.trim() || !upstreamModel.trim()) return;
    await onSave({
      alias: alias.trim(),
      upstream_model: upstreamModel.trim(),
      public_catalog: publicCatalog,
      enabled,
      capabilities,
      ...(model ? {} : { pricing: null }),
      expected_revision: model?.revision ?? null,
    });
  }

  return <form className="model-mapping-form" onSubmit={event => void submit(event).catch(() => {})}>
    <div className="model-form-heading"><div><h3>{model ? 'Edit model mapping' : 'Add a model mapping'}</h3><p>Map the name clients use to the provider’s upstream model ID.</p></div></div>
    <div className="model-form-fields">
      {!model && <div className="provider-model-picker">
        <Label htmlFor="provider-model-search">Find a provider model
          <Input
            id="provider-model-search"
            value={catalogQuery}
            onChange={event => { setCatalogQuery(event.target.value); setCatalogOpen(true); }}
            onFocus={() => setCatalogOpen(true)}
            onKeyDown={handleCatalogKeyDown}
            maxLength={200}
            autoComplete="off"
            placeholder={catalogLoading ? 'Loading provider models…' : 'Search by model name or ID'}
            disabled={disabled}
            role="combobox"
            aria-expanded={catalogOpen}
            aria-controls="provider-model-options"
            aria-autocomplete="list"
          />
        </Label>
        {catalogLoading
          ? <span className="provider-model-hint" role="status">Loading models…</span>
          : catalogError
            ? <span className="provider-model-hint is-error" role="alert">{catalogError}</span>
            : catalog.length > 0
              ? <span className="provider-model-hint">{catalog.length} models available</span>
              : <span className="provider-model-hint">Provider catalog not loaded · enter an ID below</span>}
        {catalogOpen && !catalogLoading && visibleCatalog.length > 0 && <div id="provider-model-options" className="provider-model-options" role="listbox" aria-label="Provider models">
          {visibleCatalog.map(item => <button
            key={item.id}
            type="button"
            className="provider-model-option"
            role="option"
            aria-selected={item.id === upstreamModel}
            onMouseDown={event => event.preventDefault()}
            onClick={() => chooseProviderModel(item)}
          >
            <span><strong>{item.name}</strong><small>{item.id}</small></span>
            {item.context_length ? <small>{new Intl.NumberFormat().format(item.context_length)} ctx</small> : null}
          </button>)}
        </div>}
        {catalogOpen && !catalogLoading && catalog.length > 0 && visibleCatalog.length === 0 && <div className="provider-model-options-empty">No matching models</div>}
      </div>}
      <Label htmlFor="model-alias">Niu model alias
        <Input id="model-alias" value={alias} onChange={event => setAlias(event.target.value)} maxLength={200} placeholder="e.g. fast or team/model" required disabled={disabled || Boolean(model)} />
      </Label>
      <Label htmlFor="model-upstream">Upstream model ID
        <Input id="model-upstream" value={upstreamModel} onChange={event => setUpstreamModel(event.target.value)} maxLength={200} placeholder="e.g. openai/gpt-4.1-mini" required disabled={disabled} />
      </Label>
    </div>
    <div className="model-route-switches">
      <label className="model-switch"><Checkbox checked={enabled} disabled={disabled} onCheckedChange={value => setEnabled(value === true)} /><span><strong>Enabled for inference</strong><small>Disabled mappings remain in the directory.</small></span></label>
      <label className="model-switch"><Checkbox checked={publicCatalog} disabled={disabled} onCheckedChange={value => setPublicCatalog(value === true)} /><span><strong>Show in public catalog</strong><small>Publish this alias in the unauthenticated model list.</small></span></label>
    </div>
    <fieldset className="model-capabilities" disabled={disabled}>
      <legend>Optional capabilities</legend>
      <p>These declarations are off by default. Enable only after checking the selected upstream model and endpoint.</p>
      <div className="model-capability-grid">
        {capabilityChoices.map(choice => {
          const dependent = choice.key === 'supports_streaming_tool_calls' && !capabilities.supports_tool_calls
            || (choice.key === 'supports_embedding_dimensions' || choice.key === 'supports_embedding_base64') && !capabilities.supports_embeddings;
          return <label className={'model-capability' + (dependent ? ' is-dependent' : '')} key={choice.key}>
            <Checkbox checked={capabilities[choice.key]} disabled={disabled || dependent} onCheckedChange={value => updateCapability(choice.key, value === true)} />
            <span><strong>{choice.label}</strong><small>{choice.help}</small></span>
          </label>;
        })}
      </div>
    </fieldset>
    <div className="model-form-footer">
      <span>{model ? `Revision ${model.revision} · alias remains stable for existing clients` : 'Pricing remains unset until it is configured separately.'}</span>
      <div>
        {model && <Button type="button" variant="ghost" disabled={disabled} onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={disabled || !alias.trim() || !upstreamModel.trim()}>{disabled ? 'Saving…' : model ? 'Save mapping' : 'Add mapping'}</Button>
      </div>
    </div>
  </form>;
}
