import { useEffect, useMemo, useRef } from 'react';
import { IconCheck as Check, IconFlask as FlaskConical, IconSearch as Search, IconX as X } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProviderLogo from '@/components/ProviderLogo';
import { disambiguatedCatalogTitle, modelIdentity } from '@/lib/providers';
import type { Model } from '@/shell/dashboard-context';
import { useLocale as useUILocale } from '@/shell/ui-locale';

type PlaygroundModelPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseRestoreFocus: () => void;
  usableModels: string[];
  selectedModels: string[];
  maxModels: number;
  unverifiedModels: string[];
  catalogModels?: Model[];
  managedKey: boolean;
  modelsLoading: boolean;
  modelsError: string;
  query: string;
  onQueryChange: (query: string) => void;
  category: string;
  onCategoryChange: (category: string) => void;
  onToggleModel: (model: string) => void;
};

export default function PlaygroundModelPickerDialog({
  open,
  onOpenChange,
  onCloseRestoreFocus,
  usableModels,
  selectedModels,
  maxModels,
  unverifiedModels,
  catalogModels,
  managedKey,
  modelsLoading,
  modelsError,
  query,
  onQueryChange,
  category,
  onCategoryChange,
  onToggleModel,
}: PlaygroundModelPickerDialogProps) {
  const { t: uiT, format: uiF } = useUILocale();

  const modelCategories = useMemo(() => {
    const coding = usableModels.filter(model =>
      /(?:^|[\/_ .-])(?:code|coder|codex|codestral|devstral|starcoder)(?:$|[\/_ .:-])/i.test(model),
    );
    const reasoning = usableModels.filter(model =>
      /reason|thinking|deepseek-r1|qwq|(?:^|[\/_ .-])o[134](?:$|[\/_ .:-])/i.test(model),
    );
    return [
      { id: 'all', label: 'All models', models: usableModels },
      ...(coding.length >= 2 ? [{ id: 'coding', label: 'Coding', models: coding }] : []),
      ...(reasoning.length >= 2 ? [{ id: 'reasoning', label: 'Reasoning', models: reasoning }] : []),
    ];
  }, [usableModels]);

  const activeCategory = modelCategories.find(item => item.id === category) ?? modelCategories[0];

  const matchedModels = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const source = normalized ? usableModels : activeCategory?.models ?? usableModels;
    if (!normalized) return source;
    return source.filter(model => {
      if (model.toLowerCase().includes(normalized)) return true;
      const modelObj = catalogModels?.find(item => item.id === model) ?? { id: model };
      return disambiguatedCatalogTitle(modelObj, catalogModels ?? []).toLowerCase().includes(normalized);
    });
  }, [usableModels, query, activeCategory, catalogModels]);

  const visibleModels = useMemo(() => matchedModels.slice(0, 80), [matchedModels]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query, category, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="niu-modal playground-model-dialog"
        showCloseButton={false}
        onCloseAutoFocus={event => {
          event.preventDefault();
          onCloseRestoreFocus();
        }}
      >
        <DialogHeader className="niu-modal-heading flex-row text-left playground-model-dialog-header">
          <div className="min-w-0 space-y-1">
            <DialogTitle>{uiT("Choose models")}</DialogTitle>
            <DialogDescription>{uiT("Select one to four models. Each receives the same prompt.")}</DialogDescription>
          </div>
          <DialogClose className="niu-modal-close" aria-label={uiT("Close dialog")}>
            <X size={18} />
          </DialogClose>
        </DialogHeader>

        <div className="playground-model-picker">
          <div className="playground-model-controls">
            <div className="playground-model-search">
              <Search size={16} aria-hidden="true" className="playground-model-search-icon" />
              <Label htmlFor="playground-model-search-input" className="sr-only">
                {uiT("Search models")}
              </Label>
              <Input
                id="playground-model-search-input"
                autoFocus
                value={query}
                onChange={event => onQueryChange(event.target.value)}
                placeholder={uiT("Search models…")}
                className={query ? 'pl-9 pr-8' : 'pl-9'}
              />
              {query && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="playground-model-search-clear"
                  aria-label={uiT("Clear search")}
                  onClick={() => onQueryChange('')}
                >
                  <X size={14} />
                </Button>
              )}
            </div>

            {modelCategories.length > 1 && (
              <Tabs
                value={activeCategory?.id}
                onValueChange={value => {
                  onCategoryChange(value);
                  onQueryChange('');
                }}
              >
                <TabsList className="playground-model-categories" aria-label={uiT("Model categories")}>
                  {modelCategories.map(item => (
                    <TabsTrigger key={item.id} value={item.id} className="playground-model-category">
                      {uiT(item.label)}
                      <span>{item.models.length}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}

            {selectedModels.length > 0 && (
              <div className="playground-model-selected-strip">
                {selectedModels.map(model => {
                  const modelObj = catalogModels?.find(item => item.id === model) ?? { id: model };
                  const chipLabel = disambiguatedCatalogTitle(modelObj, catalogModels ?? []);
                  return (
                    <span key={model} className="playground-model-selected-chip">
                      <ProviderLogo provider={modelIdentity(modelObj)} size="small" />
                      <span className="truncate">{chipLabel}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="playground-model-chip-remove"
                        aria-label={uiF("Remove {0}", [model])}
                        onClick={() => onToggleModel(model)}
                      >
                        <X size={12} />
                      </Button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div ref={listRef} className="playground-model-picker-list">
            {visibleModels.map(model => {
              const selected = selectedModels.includes(model);
              const modelObj = catalogModels?.find(item => item.id === model) ?? { id: model };
              const displayTitle = disambiguatedCatalogTitle(modelObj, catalogModels ?? []);
              const billingSource = catalogModels?.find(item => item.id === model)?.billing_source;
              const unverified = unverifiedModels.includes(model);
              const showBilling = Boolean(managedKey && billingSource);
              return (
                <Button
                  key={model}
                  type="button"
                  variant="ghost"
                  className="playground-model-picker-option"
                  aria-pressed={selected}
                  disabled={!selected && selectedModels.length >= maxModels}
                  onClick={() => onToggleModel(model)}
                >
                  <ProviderLogo provider={modelIdentity(modelObj)} size="small" />
                  <span className="playground-model-option-body">
                    <span className="playground-model-option-title">
                      {displayTitle}
                      {displayTitle !== model && <span className="sr-only"> {model}</span>}
                    </span>
                    {(showBilling || unverified) && (
                      <span className="playground-model-option-meta">
                        {showBilling && (
                          <span>
                            {billingSource === 'own_api_key' ? uiT("Billed by your Provider") : uiT("Niu credits")}
                          </span>
                        )}
                        {showBilling && unverified && <span aria-hidden="true">·</span>}
                        {unverified && (
                          <span className="playground-model-option-unverified">{uiT("Chat support unverified")}</span>
                        )}
                      </span>
                    )}
                  </span>
                  <span className="playground-model-option-check" aria-hidden="true">
                    {selected && <Check size={16} />}
                  </span>
                </Button>
              );
            })}
            {visibleModels.length === 0 &&
              (modelsLoading ? (
                <p className="model-no-results">{uiT("Loading models…")}</p>
              ) : (
                <Empty className="model-no-results min-h-32 border-0 bg-transparent">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <FlaskConical size={18} aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyDescription>
                      {modelsError ? uiT("Model catalog unavailable.") : uiT("No matching models")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ))}
          </div>

          <div className="playground-model-dialog-footer">
            <div className="playground-model-footer-meta">
              <span className="playground-model-selection-count">
                {selectedModels.length > 0
                  ? uiF("{0} of {1} selected", [selectedModels.length, maxModels])
                  : uiT("Select at least one model")}
              </span>
              {matchedModels.length > visibleModels.length && (
                <span className="playground-model-picker-hint">
                  {uiF("Showing {0} of {1} models", [visibleModels.length, matchedModels.length])}
                </span>
              )}
            </div>
            <DialogClose asChild>
              <Button type="button" size="sm">
                {uiT("Done")}
              </Button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
