import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
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

export default function ModelMappingForm({ ownerFunded = false, accessScope, initialAlias = "", model, catalog, catalogLoading, catalogError, disabled, onCancel, onSave, onRetryCatalog }: {
  ownerFunded?: boolean;
  accessScope?: 'commercial' | 'personal' | 'internal';
  initialAlias?: string;
  model: VendorModel | null;
  catalog: ProviderCatalogModel[];
  catalogLoading: boolean;
  catalogError: string;
  disabled: boolean;
  onCancel: () => void;
  onRetryCatalog?: () => void;
  onSave: (input: ModelWrite) => Promise<void>;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const personal = accessScope === 'personal'
    || (accessScope === undefined && (ownerFunded || model?.owner_funded === true));
  const internalShared = accessScope === 'internal';
  const [alias, setAlias] = useState(model?.alias ?? initialAlias);
  const [upstreamModel, setUpstreamModel] = useState(model?.upstream_model ?? '');
  const [enabled, setEnabled] = useState(model?.enabled ?? true);
  const [capabilities, setCapabilities] = useState<ModelCapabilities>(() => ({ ...emptyCapabilities(), ...model?.capabilities }));
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const catalogSearch = useRef<HTMLInputElement>(null);
  const [videoEditing, setVideoEditing] = useState(false);

  const [saveError, setSaveError] = useState('');
  const visibleCatalog = catalog
    .filter(item => !catalogQuery || `${item.name} ${item.id}`.toLowerCase().includes(catalogQuery.toLowerCase()))
    .slice(0, 12);

  useEffect(() => {
    setAlias(model?.alias ?? initialAlias);
    setUpstreamModel(model?.upstream_model ?? '');
    setEnabled(model?.enabled ?? true);
    setCapabilities({ ...emptyCapabilities(), ...model?.capabilities });
    setCatalogQuery('');
    setCatalogOpen(false);
  }, [model?.alias, model?.revision]);

  function chooseProviderModel(item: ProviderCatalogModel) {
    setUpstreamModel(item.id);
    setCapabilities(current => ({ ...current, catalog: item.catalog }));
    if (!model && !alias.trim()) setAlias(item.id.replace(/[^A-Za-z0-9._/-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
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
      public_catalog: false,
      enabled,
      capabilities: capabilities.video_schema ? { ...capabilities, video_schema: { ...capabilities.video_schema, ...(capabilities.video_schema.model_alias !== alias.trim() || capabilities.video_schema.upstream_model !== upstreamModel.trim() ? {revision:crypto.randomUUID()} : {}), model_alias: alias.trim(), upstream_model: upstreamModel.trim() } } : capabilities,
      ...(model ? {} : { pricing: null }),
      expected_revision: model?.revision ?? null,
    });
  }

  return <form className="model-mapping-form" onSubmit={event => void submit(event).catch(reason => setSaveError(reason instanceof Error ? reason.message : 'Unable to save this model route.'))}>
    {saveError && <p role="alert" className="error-text">{uiT(saveError)}</p>}
    <div className="model-form-heading"><div><h3>{model ? uiT("Edit model") : uiT("Add model")}</h3><p>{uiT("Map the name clients use to the provider’s upstream model ID.")}</p></div></div>
    <div className="model-form-fields">
      <div className="min-w-0 space-y-2">
        <Label htmlFor="model-upstream">{uiT("Upstream model")}</Label>
        <DropdownMenu open={catalogOpen} onOpenChange={open => {
          setCatalogOpen(open);
          if (open) {
            setCatalogQuery('');
            if (!catalog.length && !catalogLoading && !catalogError) onRetryCatalog?.();
          }
        }}>
          <DropdownMenuTrigger asChild>
            <Button id="model-upstream" type="button" variant="outline" disabled={disabled} className="w-full min-w-0 justify-between font-normal">
              <span className="truncate">{upstreamModel || uiT("Choose model or enter an ID")}</span><ChevronDown size={16} className="shrink-0" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent onFocusCapture={event => { if (event.target === event.currentTarget) catalogSearch.current?.focus(); }} align="start" collisionPadding={12} className="w-[max(300px,var(--radix-dropdown-menu-trigger-width))] max-w-[calc(100vw-24px)]">
            <div className="p-1" onKeyDown={event => { if (!['Escape', 'Tab', 'ArrowDown', 'ArrowUp'].includes(event.key)) event.stopPropagation(); }}>
              <Input ref={catalogSearch} aria-label={uiT("Search provider models")} autoFocus maxLength={200} value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} onKeyDown={event => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  const items = event.currentTarget.closest('[role="menu"]')?.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitem"]');
                  if (items?.length) items[event.key === 'ArrowDown' ? 0 : items.length - 1].focus();
                }
              }} placeholder={catalogLoading ? uiT("Loading provider models…") : uiT("Search models or enter an ID")} />
            </div>
            <DropdownMenuRadioGroup className="max-h-64 overflow-y-auto" value={upstreamModel} onValueChange={id => { const item = catalog.find(item => item.id === id); if (item) chooseProviderModel(item); }}>
              {visibleCatalog.map(item => <DropdownMenuRadioItem key={item.id} value={item.id}>
                <span className="min-w-0"><strong className="block truncate">{item.name}</strong><small className="block truncate text-muted-foreground">{item.id}</small></span>
              </DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
            {catalogQuery.trim() && !catalog.some(item => item.id === catalogQuery.trim()) && <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => {
                setUpstreamModel(catalogQuery.trim());
                setCapabilities(current => ({ ...current, catalog: undefined }));
                setCatalogOpen(false);
              }}><span className="min-w-0 truncate">{uiT("Use model ID “")}{catalogQuery.trim()}”</span></DropdownMenuItem>
            </>}
            {visibleCatalog.length === 0 && <p role="status" className="p-2 text-sm text-muted-foreground">{catalogLoading ? uiT("Loading provider models…") : catalogError ? uiT("Catalog unavailable. Enter a model ID above.") : uiT("No matching models. You can enter a model ID above.")}</p>}
          </DropdownMenuContent>
        </DropdownMenu>
        {!catalogLoading && !catalogError && catalog.length > 0 && <p className="text-xs text-muted-foreground">{catalog.length} {catalog.length === 1 ? uiT("model") : uiT("models")}{" "}{uiT("reported by the upstream catalog")}</p>}
        {catalogError && <div className="grid justify-items-start gap-2 text-sm text-muted-foreground" role="status">{uiT("The Provider catalog could not be loaded:")}{" "}{uiT(catalogError)}{" "}{uiT("You can still enter an upstream model ID.")}{onRetryCatalog && <Button type="button" variant="outline" size="sm" disabled={disabled || catalogLoading} onClick={onRetryCatalog}>{uiT("Retry model catalog")}</Button>}</div>}
      </div>
      <Label htmlFor="model-alias">{uiT("Niu model alias")}<Input id="model-alias" value={alias} onChange={event => setAlias(event.target.value)} maxLength={200} placeholder={uiT("e.g. fast or team/model")} required disabled={disabled || Boolean(model)} />
      </Label>

    </div>
    {capabilities.catalog && <div className="space-y-1 text-sm text-muted-foreground">
      <h3 className="font-medium text-foreground">{uiT("Catalog metadata to save")}</h3>
      {capabilities.catalog.name && <p>{capabilities.catalog.name}</p>}
      <p>{uiT("Context:")}{" "}{capabilities.catalog.context_length?.toLocaleString(readUILocale()) ?? uiT("Not reported")}{" "}{uiT("· Maximum output:")}{" "}{capabilities.catalog.max_completion_tokens?.toLocaleString(readUILocale()) ?? uiT("Not reported")}</p>
      <p>{uiT("Inputs:")}{" "}{capabilities.catalog.input_modalities?.join(', ') || uiT("Not reported")}{" "}{uiT("· Outputs:")}{" "}{capabilities.catalog.output_modalities?.join(', ') || uiT("Not reported")}</p>
      {model && JSON.stringify(model.capabilities.catalog) !== JSON.stringify(capabilities.catalog) && <p>{uiT("This replaces the saved catalog metadata for this route. Existing purchase rates and customer prices are preserved.")}</p>}
    </div>}
    <div className="model-route-switches">
      <Label className="model-switch"><Checkbox checked={enabled} disabled={disabled} onCheckedChange={value => setEnabled(value === true)} /><span><strong>{uiT("Enabled for inference")}</strong><small>{uiT("Disabled mappings remain in the directory.")}</small></span></Label>
      {personal && <p className="text-sm text-muted-foreground">{uiT("Private model. Available only to the account that owns this API key.")}</p>}
    </div>
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">{uiT("Video configuration")}</h3><p className="text-sm text-muted-foreground">{capabilities.video_schema ? uiF("Configured · {0}", [capabilities.video_schema.channel]) : uiT("No video schema configured")}</p></div><Button type="button" variant="outline" disabled={disabled || !alias.trim() || !upstreamModel.trim()} onClick={() => setVideoEditing(true)}>{capabilities.video_schema ? uiT("Edit video configuration") : uiT("Configure video")}</Button></div>
      {!ownerFunded && !internalShared && capabilities.video_schema && <p className="text-sm text-muted-foreground">{uiT("Changes can pause affected offers. Review the rates and enable them again after updating the connection.")}</p>}
    </div>
    {videoEditing && <VideoSchemaEditor modelAlias={alias.trim()} upstreamModel={upstreamModel.trim()} schema={capabilities.video_schema} onClose={() => setVideoEditing(false)} onApply={schema => { setCapabilities(current => { const next = {...current}; if (schema) next.video_schema = schema; else delete next.video_schema; return next; }); setVideoEditing(false); }} />}
    <fieldset className="model-capabilities" disabled={disabled}>
      <legend>{uiT("Optional capabilities")}</legend>
      <p>{uiT("These declarations are off by default. Enable only after checking the selected upstream model and endpoint.")}</p>
      <div className="model-capability-grid">
        {capabilityChoices.map(choice => {
          const dependent = choice.key === 'supports_streaming_tool_calls' && !capabilities.supports_tool_calls
            || (choice.key === 'supports_embedding_dimensions' || choice.key === 'supports_embedding_base64') && !capabilities.supports_embeddings;
          return <Label className={'model-capability' + (dependent ? ' is-dependent' : '')} key={choice.key}>
            <Checkbox checked={capabilities[choice.key]} disabled={disabled || dependent} onCheckedChange={value => updateCapability(choice.key, value === true)} />
            <span><strong>{uiT(choice.label)}</strong><small>{uiT(choice.help)}</small></span>
          </Label>;
        })}
      </div>
    </fieldset>
    <div className="model-form-footer">
      <span>{model ? uiT("The alias remains stable for existing clients.") : uiT("Pricing remains unset until it is configured separately.")}</span>
      <div>
        {model && <Button type="button" variant="ghost" disabled={disabled} onClick={onCancel}>{uiT("Cancel")}</Button>}
        <Button type="submit" disabled={disabled || !alias.trim() || !upstreamModel.trim()}>{disabled ? uiT("Saving…") : model ? uiT("Save changes") : uiT("Add model")}</Button>
      </div>
    </div>
  </form>;
}
