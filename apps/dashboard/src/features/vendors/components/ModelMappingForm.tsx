import { useEffect, useState, type FormEvent } from 'react';
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import VideoSchemaEditor from './VideoSchemaEditor';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { emptyCapabilities, type ModelCapabilities, type ModelWrite, type ProviderCatalogModel, type VendorModel } from '../api';

const capabilityChoices: Array<{ key: Exclude<keyof ModelCapabilities, 'catalog' | 'video_schema'>; label: string; help: string }> = [
  { key: 'supports_tool_calls', label: 'Function tools', help: 'Tool call responses' },
  { key: 'supports_streaming_tool_calls', label: 'Streaming tools', help: 'Tool deltas in streams' },
  { key: 'supports_structured_output', label: 'Structured output', help: 'JSON schema response format' },
  { key: 'supports_embeddings', label: 'Embeddings', help: 'Text embedding requests' },
  { key: 'supports_embedding_dimensions', label: 'Embedding dimensions', help: 'Custom vector size' },
  { key: 'supports_embedding_base64', label: 'Base64 embeddings', help: 'Base64 vector encoding' },
  { key: 'supports_responses', label: 'Responses API', help: 'Text-only Responses subset' },
];

export default function ModelMappingForm({ ownerFunded = false, model, catalog, catalogLoading, catalogError, disabled, onCancel, onSave, onRetryCatalog }: {
  ownerFunded?: boolean;
  model: VendorModel | null;
  catalog: ProviderCatalogModel[];
  catalogLoading: boolean;
  catalogError: string;
  disabled: boolean;
  onCancel: () => void;
  onRetryCatalog?: () => void;
  onSave: (input: ModelWrite) => Promise<void>;
}) {
  const personal = ownerFunded || model?.owner_funded === true;
  const [alias, setAlias] = useState(model?.alias ?? '');
  const [upstreamModel, setUpstreamModel] = useState(model?.upstream_model ?? '');
  const [publicCatalog, setPublicCatalog] = useState(model?.public_catalog ?? false);
  const [enabled, setEnabled] = useState(model?.enabled ?? true);
  const [capabilities, setCapabilities] = useState<ModelCapabilities>(() => ({ ...emptyCapabilities(), ...model?.capabilities }));
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [videoEditing, setVideoEditing] = useState(false);

  const [saveError, setSaveError] = useState('');
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
    setCapabilities(current => ({ ...current, catalog: item.catalog }));
    setAlias(item.id.replace(/[^A-Za-z0-9._/-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
    setCatalogQuery(item.name);
    setCatalogOpen(false);
  }

  function updateCapability(key: Exclude<keyof ModelCapabilities, 'catalog' | 'video_schema'>, checked: boolean) {
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
    setSaveError('');
    await onSave({
      alias: alias.trim(),
      upstream_model: upstreamModel.trim(),
      public_catalog: personal ? false : publicCatalog,
      enabled,
      capabilities: capabilities.video_schema ? { ...capabilities, video_schema: { ...capabilities.video_schema, ...(capabilities.video_schema.model_alias !== alias.trim() || capabilities.video_schema.upstream_model !== upstreamModel.trim() ? {revision:crypto.randomUUID()} : {}), model_alias: alias.trim(), upstream_model: upstreamModel.trim() } } : capabilities,
      ...(model ? {} : { pricing: null }),
      expected_revision: model?.revision ?? null,
    });
  }

  return <form className="model-mapping-form" onSubmit={event => void submit(event).catch(reason => setSaveError(reason instanceof Error ? reason.message : 'Unable to save this model route.'))}>
    {saveError && <p role="alert" className="error-text">{saveError}</p>}
    <div className="model-form-heading"><div><h3>{model ? 'Edit model mapping' : 'Add a model mapping'}</h3><p>Map the name clients use to the provider’s upstream model ID.</p></div></div>
    <div className="model-form-fields">
      {!model && <div className="supplier-model-picker">
        <Label htmlFor="supplier-model-search-trigger">Find a provider model</Label>
        <DropdownMenu open={catalogOpen} onOpenChange={open => { setCatalogOpen(open); if (open) setCatalogQuery(''); }}>
          <DropdownMenuTrigger asChild>
            <Button id="supplier-model-search-trigger" type="button" variant="outline" disabled={disabled} className="supplier-model-trigger w-full justify-between font-normal">
              <span>{catalog.find(item => item.id === upstreamModel)?.name ?? 'Search supplier models'}</span><ChevronDown size={16} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" collisionPadding={12} className="w-[min(420px,calc(100vw-24px))]">
            <Input aria-label="Search supplier models" autoFocus maxLength={200} value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} onKeyDown={event => { if (event.key.length === 1 || ['Home', 'End', 'Backspace', 'Delete'].includes(event.key)) event.stopPropagation(); }} placeholder={catalogLoading ? 'Loading supplier models…' : 'Search by model name or ID'} />
            <DropdownMenuRadioGroup value={upstreamModel} onValueChange={id => { const item = catalog.find(item => item.id === id); if (item) chooseProviderModel(item); }}>
              {visibleCatalog.map(item => <DropdownMenuRadioItem key={item.id} value={item.id}>
                <span><strong className="block">{item.name}</strong><small className="block text-muted-foreground">{item.id}</small></span>
              </DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
            {visibleCatalog.length === 0 && <p role="status" className="p-2 text-sm text-muted-foreground">{catalogLoading ? 'Loading supplier models…' : catalogError ? 'Supplier model catalog is unavailable' : 'No matching models'}</p>}
          </DropdownMenuContent>
        </DropdownMenu>
        {catalogLoading
          ? <span className="supplier-model-hint" role="status">Loading models…</span>
          : catalogError
            ? <span className="supplier-model-hint is-error grid justify-items-start gap-2" role="alert">{catalogError}{onRetryCatalog && <Button type="button" variant="outline" size="sm" disabled={disabled || catalogLoading} onClick={onRetryCatalog}>Retry model catalog</Button>}</span>
            : catalog.length > 0
              ? <span className="supplier-model-hint">{catalog.length} {catalog.length === 1 ? 'model' : 'models'} available</span>
              : <span className="supplier-model-hint">Provider catalog not loaded · enter an ID below</span>}
      </div>}
      <Label htmlFor="model-alias">Niu model alias
        <Input id="model-alias" value={alias} onChange={event => setAlias(event.target.value)} maxLength={200} placeholder="e.g. fast or team/model" required disabled={disabled || Boolean(model)} />
      </Label>
      <Label htmlFor="model-upstream">Upstream model ID
        <Input id="model-upstream" value={upstreamModel} onChange={event => { setUpstreamModel(event.target.value); setCapabilities(current => ({...current, catalog: undefined})); }} maxLength={200} placeholder="e.g. openai/gpt-4.1-mini" required disabled={disabled} />
      </Label>
    </div>
    <div className="model-route-switches">
      <Label className="model-switch"><Checkbox checked={enabled} disabled={disabled} onCheckedChange={value => setEnabled(value === true)} /><span><strong>Enabled for inference</strong><small>Disabled mappings remain in the directory.</small></span></Label>
      {personal ? <p className="text-sm text-muted-foreground">Private model. Available only to the account that owns this API key.</p> : <Label className="model-switch"><Checkbox checked={publicCatalog} disabled={disabled} onCheckedChange={value => setPublicCatalog(value === true)} /><span><strong>Show in public catalog</strong><small>Publish this alias in the unauthenticated model list.</small></span></Label>}
    </div>
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Video configuration</h3><p className="text-sm text-muted-foreground">{capabilities.video_schema ? `Configured · ${capabilities.video_schema.channel}` : 'No video schema configured'}</p></div><Button type="button" variant="outline" disabled={disabled || !alias.trim() || !upstreamModel.trim()} onClick={() => setVideoEditing(true)}>{capabilities.video_schema ? 'Edit video configuration' : 'Configure video'}</Button></div>
      {capabilities.video_schema && <p className="text-sm text-muted-foreground">Saving changes invalidates affected offer qualification. Rates and live capability reviews remain separate.</p>}
    </div>
    {videoEditing && <VideoSchemaEditor modelAlias={alias.trim()} upstreamModel={upstreamModel.trim()} schema={capabilities.video_schema} onClose={() => setVideoEditing(false)} onApply={schema => { setCapabilities(current => { const next = {...current}; if (schema) next.video_schema = schema; else delete next.video_schema; return next; }); setVideoEditing(false); }} />}
    <fieldset className="model-capabilities" disabled={disabled}>
      <legend>Optional capabilities</legend>
      <p>These declarations are off by default. Enable only after checking the selected upstream model and endpoint.</p>
      <div className="model-capability-grid">
        {capabilityChoices.map(choice => {
          const dependent = choice.key === 'supports_streaming_tool_calls' && !capabilities.supports_tool_calls
            || (choice.key === 'supports_embedding_dimensions' || choice.key === 'supports_embedding_base64') && !capabilities.supports_embeddings;
          return <Label className={'model-capability' + (dependent ? ' is-dependent' : '')} key={choice.key}>
            <Checkbox checked={capabilities[choice.key]} disabled={disabled || dependent} onCheckedChange={value => updateCapability(choice.key, value === true)} />
            <span><strong>{choice.label}</strong><small>{choice.help}</small></span>
          </Label>;
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
