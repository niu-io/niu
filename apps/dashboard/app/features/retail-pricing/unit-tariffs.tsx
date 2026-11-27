import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { IconCoins } from '@tabler/icons-react';
import { ListRowsSkeleton } from '@/components/PageSkeletons';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity } from '@/lib/providers';
import { fetchQuery, invalidateQueries, peekQuery } from '@/lib/query-cache';
import { formatExactUnitAtoms, unitAmountFromAtoms, unitAmountToAtoms } from '@/lib/money';
import { mediaQuantity, mediaQuantityInput, mediaRoundingLabels } from '@/lib/media-price';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProviderRequestError, request } from '@/features/providers/api';
import { registeredRetailModelChoices, registeredTextModelChoices, type RetailModelChoice } from './api';

import type { ContextPriceTier } from '@niu-io/sdk/admin';
import { checkedRates, checkedTiers, ratesFrom, tokenBand, type Tier } from './text-terms';
import { ContextTierFields, TextRateBand } from './text-rate-band';

type UnitTextPrice = {
  prompt_rate: string;
  completion_rate: string;
  cached_prompt_rate?: string | null;
  cache_write_prompt_rate?: string | null;
  reasoning_completion_rate?: string | null;
  request_fee_atoms: string;
  minimum_charge_atoms: string;
  context_tiers: ContextPriceTier[];
};

type UnitTextTariffRecord = {
  revision: string;
  definition_revision: string;
  model_alias: string;
  price: UnitTextPrice;
};

type UnitMediaTariffRecord = {
  revision: string;
  definition_revision: string;
  model_alias: string;
  channel: string;
  resolution: string;
  reference_video: boolean;
  meter: string;
  price: {
    dimensions: {
      model: string;
      channel: string;
      resolution: string;
      reference_video: boolean;
    };
    meter: string;
    amount_atoms: string;
    per_quantity: { numerator: string; denominator: string };
    minimum_quantity: { numerator: string; denominator: string };
    rounding: 'Down' | 'Up' | 'HalfEven';
  };
};

type UnitPlatformConfig = {
  revision: string;
  billing_mode: 'currency' | 'credits';
  definition: {
    revision: string;
    name: string;
    display_precision: number;
    atoms_per_unit: string;
  } | null;
  text_tariffs?: UnitTextTariffRecord[];
};

function tariffRateRange(price: UnitTextPrice, field: 'prompt_rate' | 'completion_rate', unit: string, precision: number) {
  const first = price.context_tiers[0];
  const base = BigInt(first?.minimum_input_tokens === '0' ? first[field] : price[field]);
  let low = base;
  let high = base;
  for (const tier of price.context_tiers) {
    const rate = BigInt(tier[field]);
    if (rate < low) low = rate;
    if (rate > high) high = rate;
  }
  const minimum = formatExactUnitAtoms(low.toString(), unit, precision);
  return low === high ? minimum : minimum + ' – ' + formatExactUnitAtoms(high.toString(), unit, precision);
}

function quantityText(value: { numerator: string; denominator: string }) {
  if (value.denominator !== '1') return mediaQuantityInput(value);
  return value.numerator.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function DialogModelPicker({
  id,
  modelAlias,
  onSelect,
  choices,
  loading,
  ariaLabel,
}: {
  id: string;
  modelAlias: string;
  onSelect: (choice: RetailModelChoice) => void;
  choices: RetailModelChoice[];
  loading: boolean;
  ariaLabel: string;
}) {
  const { t: uiT } = useUILocale();
  const [query, setQuery] = useState('');
  const visible = choices.filter(choice => choice.model_alias.toLowerCase().includes(query.trim().toLowerCase()));
  return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button id={id} type="button" variant="outline" className="w-full justify-between" disabled={loading || !choices.length} aria-label={ariaLabel}>
            <span className="flex min-w-0 items-center gap-2">{modelAlias && <ProviderLogo provider={modelIdentity({ id: modelAlias })} size="small" />}<span className="min-w-0 truncate">{modelAlias || (loading ? uiT("Loading registered models…") : uiT("Choose registered model"))}</span></span>
            <ChevronDown className="size-4 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 max-w-[calc(100vw-2rem)] overflow-y-auto">
          <Input aria-label={uiT("Filter registered models")} placeholder={uiT("Filter models")} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') event.stopPropagation(); }} />
          <DropdownMenuRadioGroup value={modelAlias} onValueChange={value => { const choice = choices.find(item => item.model_alias === value); if (choice) onSelect(choice); }}>
            {visible.map(choice => <DropdownMenuRadioItem key={choice.model_alias} value={choice.model_alias}><ProviderLogo provider={modelIdentity({ id: choice.model_alias })} size="small" />{choice.model_alias}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
          {!loading && !visible.length && <p className="p-2 text-sm text-muted-foreground">{uiT("No registered models match this filter.")}</p>}
        </DropdownMenuContent>
      </DropdownMenu>
  );
}

function useTariffDismiss(draft: readonly unknown[], saving: boolean, onClose: () => void) {
  const values = JSON.stringify(draft);
  const [original] = useState(values);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  function dismiss() {
    if (saving) return;
    if (values === original) onClose();
    else setConfirmDiscard(true);
  }
  return { dismiss, confirmDiscard, keepEditing: () => setConfirmDiscard(false) };
}

function MissingTariffModel({ message, failed, loading, onRefresh, onClose }: { message: string; failed: boolean; loading: boolean; onRefresh: () => void; onClose: () => void }) {
  const { t } = useUILocale();
  return <>
    <p role="status" className="text-sm">{message}</p>
    <DialogFooter>
      <Button variant="outline" onClick={onClose}>{t("Cancel")}</Button>
      <Button variant={failed ? "default" : "outline"} disabled={loading} onClick={onRefresh}>{t("Refresh model choices")}</Button>
      {!failed && <Button asChild><Link to="/admin/providers" target="_blank" rel="noopener noreferrer" aria-label={t("Configure a Provider model (opens in a new tab)")}>{t("Configure model", "配置模型")}</Link></Button>}
    </DialogFooter>
  </>;
}

export function BrandedUnitTariffsSection({ token, filter, searchControl }: { token: string; filter: string; searchControl?: ReactNode }) {
  const { t: uiT, format: uiF } = useUILocale();
  const scope = token || 'public';
  const initialCfg = peekQuery<{ data: UnitPlatformConfig }>(scope, '/api/v1/admin/units')?.data ?? null;
  const initialMedia = peekQuery<{ data: UnitMediaTariffRecord[] }>(scope, '/api/v1/admin/units/media/tariffs')?.data;
  const [config, setConfig] = useState<UnitPlatformConfig | null>(() => initialCfg);
  const [mediaTariffs, setMediaTariffs] = useState<UnitMediaTariffRecord[]>(() => Array.isArray(initialMedia) ? initialMedia : []);
  const [loading, setLoading] = useState(() => !initialCfg);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const tariffTrigger = useRef<HTMLElement | null>(null);
  const [textEditor, setTextEditor] = useState<UnitTextTariffRecord | 'new' | null>(null);
  const [mediaEditor, setMediaEditor] = useState<UnitMediaTariffRecord | 'new' | null>(null);

  async function load(force = false) {
    setLoading(true);
    setError('');
    try {
      if (force) invalidateQueries('/api/v1/admin/units');
      const [cfgResp, mediaResp] = await Promise.all([
        fetchQuery(
          scope,
          '/api/v1/admin/units',
          signal => request<{ data: UnitPlatformConfig }>(token, '/api/v1/admin/units', 'GET', undefined, signal),
          { force, awaitRevalidate: true },
        ),
        fetchQuery(
          scope,
          '/api/v1/admin/units/media/tariffs',
          signal => request<{ data: UnitMediaTariffRecord[] }>(token, '/api/v1/admin/units/media/tariffs', 'GET', undefined, signal),
          { force, awaitRevalidate: true },
        ),
      ]);
      setConfig(cfgResp.data);
      setMediaTariffs(Array.isArray(mediaResp.data) ? mediaResp.data : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Branded Credits tariffs unavailable.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  const unitName = config?.definition?.name ?? uiT("Niu Credits");
  const precision = config?.definition?.display_precision ?? 2;
  const query = filter.trim().toLowerCase();
  const allText = config?.text_tariffs ?? [];
  const visibleText = allText.filter(t => t.model_alias.toLowerCase().includes(query));
  const visibleMedia = mediaTariffs.filter(t => t.model_alias.toLowerCase().includes(query));
  const hasTariffs = allText.length > 0 || mediaTariffs.length > 0;

  return (
    <section className="space-y-4" aria-label={uiF("{0} consumption tariffs", [unitName])}>
      {config?.definition && <div className="flex flex-wrap items-center justify-end gap-2">
          {hasTariffs && searchControl}
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void load(true)}>
            {uiT("Refresh Credits tariffs")}</Button>
          <Button
            size="sm"
            disabled={loading || !config?.definition}
            onClick={event => {
              tariffTrigger.current = event.currentTarget;
              setNotice('');
              setTextEditor('new');
            }}
          >
            {uiT("Publish Credits text tariff")}</Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || !config?.definition}
            onClick={event => {
              tariffTrigger.current = event.currentTarget;
              setNotice('');
              setMediaEditor('new');
            }}
          >
            {uiT("Publish Credits media tariff")}</Button>
      </div>}

      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-2"><span>{error}</span><Button variant="outline" size="sm" disabled={loading} onClick={() => void load(true)}>{uiT("Retry Credits tariffs")}</Button></AlertDescription>
        </Alert>
      )}
      {loading && !config && <ListRowsSkeleton rows={2} label={uiT("Loading Credits tariffs…")} />}
      {!loading && !error && !config?.definition && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>{uiT("Branded credits are not configured.", "品牌额度尚未配置。")}</span>
            <Button asChild variant="link" className="h-auto p-0"><Link to="/admin/settings?tab=units">{uiT("Configure credits", "配置额度")}</Link></Button>
          </AlertDescription>
        </Alert>
      )}

      {visibleText.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{uiT("Text model tariffs (per 1M tokens)")}</h3>
          <Table className="standard-price-directory w-full [&_th]:whitespace-normal [&_td]:whitespace-normal max-[600px]:[&_td]:text-left" aria-label={uiT("Branded Credits text tariffs")}>
            <TableHeader>
              <TableRow>
                <TableHead>{uiT("Model")}</TableHead>
                <TableHead className="text-right">{uiT("Input / 1M")}</TableHead>
                <TableHead className="text-right">{uiT("Output / 1M")}</TableHead>
                <TableHead className="text-right">{uiT("Cached / Reasoning")}</TableHead>
                <TableHead className="text-right">{uiT("Request fee & min")}</TableHead>
                <TableHead>{uiT("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleText.map(row => (
                <TableRow key={row.model_alias}>
                  <TableCell className="max-w-40 whitespace-normal font-medium"><p className="inline-flex items-center gap-2 break-words"><ProviderLogo provider={modelIdentity({ id: row.model_alias })} size="small" /><span>{row.model_alias}</span></p>{row.price.context_tiers.length > 0 && <p className="text-xs text-muted-foreground">{uiT("Context tiers")} · {row.price.context_tiers.length}</p>}</TableCell>
                  <TableCell data-label={uiT("Input / 1M")} className="text-right tabular-nums">{tariffRateRange(row.price, 'prompt_rate', unitName, precision)}</TableCell>
                  <TableCell data-label={uiT("Output / 1M")} className="text-right tabular-nums">{tariffRateRange(row.price, 'completion_rate', unitName, precision)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                    <p>{uiT("Cached:")}{' '}{row.price.cached_prompt_rate != null ? formatExactUnitAtoms(row.price.cached_prompt_rate, unitName, precision) : uiT("Ordinary")}</p>
                    <p>{uiT("Reasoning:")}{' '}{row.price.reasoning_completion_rate != null ? formatExactUnitAtoms(row.price.reasoning_completion_rate, unitName, precision) : uiT("Ordinary")}</p>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                    <p>{uiT("Fee:")}{' '}{formatExactUnitAtoms(row.price.request_fee_atoms, unitName, precision)}</p>
                    <p>{uiT("Min:")}{' '}{formatExactUnitAtoms(row.price.minimum_charge_atoms, unitName, precision)}</p>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={uiF("Edit Credits text tariff for {0}", [row.model_alias])}
                      onClick={event => {
                        tariffTrigger.current = event.currentTarget;
                        setNotice('');
                        setTextEditor(row);
                      }}
                    >
                      {uiT("Edit")}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {visibleMedia.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{uiT("Video tariffs")}</h3>
          <Table className="standard-price-directory w-full [&_th]:whitespace-normal [&_td]:whitespace-normal max-[600px]:[&_td]:text-left" aria-label={uiT("Branded Credits media tariffs")}>
            <TableHeader>
              <TableRow>
                <TableHead>{uiT("Model")}</TableHead><TableHead>{uiT("Media specification")}</TableHead>
                <TableHead className="text-right">{uiT("Rate")}</TableHead>
                <TableHead className="text-right">{uiT("Minimum quantity")}</TableHead><TableHead>{uiT("Rounding")}</TableHead>
                <TableHead>{uiT("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMedia.map(row => (
                <TableRow key={`${row.model_alias}:${row.channel}:${row.resolution}:${row.reference_video}`}>
                  <TableCell className="max-w-56 whitespace-normal font-medium">
                    <p className="inline-flex items-center gap-2 break-words"><ProviderLogo provider={modelIdentity({ id: row.model_alias })} size="small" /><span>{row.model_alias}</span></p>
                  </TableCell><TableCell data-label={uiT("Media specification")} className="whitespace-normal text-sm text-muted-foreground">
                    <p>
                      {row.channel} · {row.resolution} · {row.reference_video ? uiT("With reference video") : uiT("Standard")}
                    </p>
                  </TableCell>
                  <TableCell data-label={uiT("Rate")} className="text-right tabular-nums">
                    <p>{formatExactUnitAtoms(row.price.amount_atoms, unitName, precision)}{' '}{uiT("per")}{' '}{quantityText(row.price.per_quantity)} {uiT("video tokens")}</p>
                  </TableCell>
                  <TableCell data-label={uiT("Minimum quantity")} className="text-right text-xs tabular-nums text-muted-foreground">
                    {quantityText(row.price.minimum_quantity)} {uiT("video tokens")}
                  </TableCell><TableCell data-label={uiT("Rounding")} className="text-sm">
                    {uiT(mediaRoundingLabels[row.price.rounding])}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={uiF("Edit Credits media tariff for {0}", [row.model_alias])}
                      onClick={event => {
                        tariffTrigger.current = event.currentTarget;
                        setNotice('');
                        setMediaEditor(row);
                      }}
                    >
                      {uiT("Edit")}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && !error && config?.definition && !visibleText.length && !visibleMedia.length && (
        <Empty className="min-h-40"><EmptyHeader><EmptyMedia variant="icon"><IconCoins size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{hasTariffs ? uiT("No Credits tariffs match this filter.") : uiT("No Credits tariffs have been published.")}</EmptyDescription></EmptyHeader></Empty>
      )}

      {textEditor && config?.definition && (
        <UnitTextTariffDialog
          token={token}
          config={config}
          onConflict={() => void load(true)}
          restoreFocus={() => tariffTrigger.current?.focus()}
          initial={textEditor === 'new' ? null : textEditor}
          onClose={() => setTextEditor(null)}
          onSaved={modelAlias => {
            setTextEditor(null);
            setNotice(uiF("Published {0} text tariff for {1}.", [unitName, modelAlias]));
            void load(true);
          }}
        />
      )}

      {mediaEditor && config?.definition && (
        <UnitMediaTariffDialog
          token={token}
          config={config}
          onConflict={() => void load(true)}
          restoreFocus={() => tariffTrigger.current?.focus()}
          initial={mediaEditor === 'new' ? null : mediaEditor}
          onClose={() => setMediaEditor(null)}
          onSaved={modelAlias => {
            setMediaEditor(null);
            setNotice(uiF("Published {0} media tariff for {1}.", [unitName, modelAlias]));
            void load(true);
          }}
        />
      )}
    </section>
  );
}

function focusConflictAlert(alert: HTMLDivElement | null) {
  if (!alert) return;
  alert.focus({ preventScroll: true });
  alert.scrollIntoView({ block: 'center', behavior: 'instant' });
}

function UnitTextTariffDialog({
  token,
  config: openingConfig,
  onConflict,
  initial,
  onClose,
  onSaved,
  restoreFocus,
}: {
  token: string;
  config: UnitPlatformConfig;
  onConflict: () => void;
  initial: UnitTextTariffRecord | null;
  restoreFocus: () => void;
  onClose: () => void;
  onSaved: (modelAlias: string) => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const [config] = useState(openingConfig);
  const [conflict, setConflict] = useState(false);
  const unitName = config.definition?.name ?? uiT("Niu Credits");
  const [modelAlias, setModelAlias] = useState(initial?.model_alias ?? '');
  const [models, setModels] = useState<RetailModelChoice[]>([]);
  const [modelsLoading, setModelsLoading] = useState(() => !initial);
  const [modelsRevision, refreshModels] = useState(0);
  const [modelsError, setModelsError] = useState('');
  const [rates, setRates] = useState(() => ratesFrom(initial?.price));
  const [tiers, setTiers] = useState<Tier[]>(() => (initial?.price.context_tiers ?? []).map(tier => ({
    minimum_input_tokens: tier.minimum_input_tokens, rates: ratesFrom(tier),
  })));
  const [requestFee, setRequestFee] = useState(initial ? unitAmountFromAtoms(initial.price.request_fee_atoms) : '0');
  const [minimumCharge, setMinimumCharge] = useState(initial ? unitAmountFromAtoms(initial.price.minimum_charge_atoms) : '0');
  const [saving, setSaving] = useState(false);
  const draftLocked = saving || modelsLoading;
  const [error, setError] = useState('');
  const { dismiss, confirmDiscard, keepEditing } = useTariffDismiss([modelAlias, rates, tiers, requestFee, minimumCharge], saving, onClose);

  useEffect(() => {
    if (initial) return;
    const controller = new AbortController();
    setModelsLoading(true); setModelsError('');
    void registeredTextModelChoices(token, controller.signal)
      .then(choices => { if (!controller.signal.aborted) setModels(choices); })
      .catch(failure => { if (!controller.signal.aborted) setModelsError(failure instanceof Error ? failure.message : uiT('Registered models unavailable.')); })
      .finally(() => { if (!controller.signal.aborted) setModelsLoading(false); });
    return () => controller.abort();
  }, [token, initial, modelsRevision]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || conflict || !config.definition) return;
    const model = modelAlias.trim();
    if (!model) { setError(uiT("Choose a registered model.")); return; }
    if (!rates.prompt_rate.trim() || !rates.completion_rate.trim()) { setError(uiT("Enter input and output rates.")); return; }
    let price: UnitTextPrice;
    try {
      price = {
        ...checkedRates(rates),
        request_fee_atoms: unitAmountToAtoms(requestFee, true),
        minimum_charge_atoms: unitAmountToAtoms(minimumCharge, true),
        context_tiers: checkedTiers(tiers),
      };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : uiT('Enter valid nonnegative unit amounts (up to 9 decimal places).'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      await request(token, '/api/v1/admin/units/tariffs', 'POST', {
        model_alias: model,
        definition_revision: config.definition.revision,
        expected_revision: config.revision,
        idempotency_key: crypto.randomUUID(),
        price,
      });
      onSaved(model);
    } catch (cause) {
      if (cause instanceof ProviderRequestError && cause.status === 409) {
        setConflict(true);
        setError(uiT('Pricing changed. Reopen the tariff to review the current rate.', '价格已更新。重新打开费率可查看现价。'));
        onConflict();
      } else {
        setError(cause instanceof Error ? cause.message : uiT('Could not publish Credits text tariff.'));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) dismiss(); }}>
      <DialogContent aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }} className="w-[calc(100vw-2rem)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial ? uiF("Revise {0} text tariff", [unitName]) : uiF("Publish {0} text tariff", [unitName])}</DialogTitle>
        </DialogHeader>
        {confirmDiscard ? <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{uiT("Discard changes", "放弃修改")}</Button>
          <Button type="button" autoFocus onClick={keepEditing}>{uiT("Keep editing", "继续编辑")}</Button>
        </DialogFooter> : !initial && (!modelsLoading || modelsRevision > 0) && (modelsError || !models.length) ? <MissingTariffModel message={modelsError ? uiT(modelsError) : uiT("No registered models are available for pricing.")} failed={Boolean(modelsError)} loading={modelsLoading} onRefresh={() => refreshModels(value => value + 1)} onClose={onClose} /> : <form className="space-y-4" onSubmit={event => void submit(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="unit-tariff-model">{uiT("Model")}</Label>
            {initial ? <p className="break-words">{modelAlias}</p> : <DialogModelPicker id="unit-tariff-model" modelAlias={modelAlias} onSelect={choice => { setModelAlias(choice.model_alias); setError(''); }} choices={models} loading={modelsLoading} ariaLabel={uiT("Credits text tariff model")} />}
          </div>
          <h3 className="font-medium">{uiT("Base rates", "基础单价")}{tiers.length > 0 && ` · ${tokenBand('0', tiers[0].minimum_input_tokens)} ${uiT('Tokens')}`}</h3>
          <TextRateBand id="unit-tariff" rates={rates} previous={initial ? ratesFrom(initial.price) : undefined}
            disabled={draftLocked} onChange={(key, value) => setRates(current => ({ ...current, [key]: value }))} />
          <ContextTierFields tiers={tiers} setTiers={setTiers} previous={initial?.price.context_tiers} locked={draftLocked} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-fee">{uiT("Fixed request fee (")}{unitName})</Label>
              <Input id="unit-tariff-fee" inputMode="decimal" value={requestFee} disabled={draftLocked} onChange={event => setRequestFee(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-min">{uiT("Minimum request charge (")}{unitName})</Label>
              <Input id="unit-tariff-min" inputMode="decimal" value={minimumCharge} disabled={draftLocked} onChange={event => setMinimumCharge(event.target.value)} />
            </div>
          </div>
          {error && <Alert variant="destructive" className={conflict ? "sticky bottom-0 z-10 bg-[var(--background)]!" : undefined} tabIndex={-1} ref={conflict ? focusConflictAlert : undefined}><AlertDescription>{uiT(error)}</AlertDescription></Alert>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={dismiss}>{uiT("Cancel")}</Button>
            <Button type="submit" disabled={saving || conflict || !modelAlias.trim() || !rates.prompt_rate.trim() || !rates.completion_rate.trim()}>{saving ? uiT("Publishing…") : uiT("Publish", "发布")}</Button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
  );
}

function UnitMediaTariffDialog({
  token,
  config: openingConfig,
  onConflict,
  initial,
  onClose,
  onSaved,
  restoreFocus,
}: {
  token: string;
  config: UnitPlatformConfig;
  onConflict: () => void;
  initial: UnitMediaTariffRecord | null;
  restoreFocus: () => void;
  onClose: () => void;
  onSaved: (modelAlias: string) => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const [config] = useState(openingConfig);
  const [conflict, setConflict] = useState(false);
  const unitName = config.definition?.name ?? uiT("Niu Credits");
  const [modelAlias, setModelAlias] = useState(initial?.model_alias ?? '');
  const [models, setModels] = useState<RetailModelChoice[]>([]);
  const [modelsLoading, setModelsLoading] = useState(() => !initial);
  const [modelsRevision, refreshModels] = useState(0);
  const [modelsError, setModelsError] = useState('');
  const [channel, setChannel] = useState(initial?.channel ?? '');
  const [resolution, setResolution] = useState(initial?.resolution ?? '');
  const [referenceVideo, setReferenceVideo] = useState(initial?.reference_video ?? false);
  const [amount, setAmount] = useState(initial ? unitAmountFromAtoms(initial.price.amount_atoms) : '');
  const [perQuantity, setPerQuantity] = useState(initial ? mediaQuantityInput(initial.price.per_quantity) : '1000');
  const [minimumQuantity, setMinimumQuantity] = useState(initial ? mediaQuantityInput(initial.price.minimum_quantity) : '1');
  const [rounding, setRounding] = useState<'Down' | 'Up' | 'HalfEven'>(initial?.price.rounding ?? 'Up');
  const [saving, setSaving] = useState(false);
  const draftLocked = saving || modelsLoading;
  const [error, setError] = useState('');
  const { dismiss, confirmDiscard, keepEditing } = useTariffDismiss([modelAlias, channel, resolution, referenceVideo, amount, perQuantity, minimumQuantity, rounding], saving, onClose);

  useEffect(() => {
    if (initial) return;
    const controller = new AbortController();
    setModelsLoading(true); setModelsError('');
    void registeredRetailModelChoices(token, controller.signal)
      .then(choices => { if (!controller.signal.aborted) setModels(choices.filter(choice => choice.media?.meter === 'video_tokens')); })
      .catch(failure => { if (!controller.signal.aborted) setModelsError(failure instanceof Error ? failure.message : uiT('Registered models unavailable.')); })
      .finally(() => { if (!controller.signal.aborted) setModelsLoading(false); });
    return () => controller.abort();
  }, [token, initial, modelsRevision]);

  const chosenMedia = initial ? null : models.find(choice => choice.model_alias === modelAlias)?.media ?? null;
  const resolutions = initial ? [resolution] : chosenMedia?.resolutions ?? [];
  const showReference = initial ? initial.reference_video : chosenMedia?.reference_video === true;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || conflict || !config.definition) return;
    const model = modelAlias.trim();
    if (!model) { setError(uiT("Choose a registered model.")); return; }
    if (!channel.trim() || !resolution.trim()) { setError(uiT("Choose a supported resolution.")); return; }
    if (!initial && (!chosenMedia || chosenMedia.channel !== channel || !chosenMedia.resolutions.includes(resolution) || (referenceVideo && !chosenMedia.reference_video))) {
      setError(uiT("Choose a supported media specification."));
      return;
    }
    let amountAtoms: string;
    let perQty: { numerator: string; denominator: string };
    let minQty: { numerator: string; denominator: string };
    try {
      if (!amount.trim()) throw new Error('Enter a rate.');
      amountAtoms = unitAmountToAtoms(amount, true);
      perQty = mediaQuantity(perQuantity, false);
      minQty = mediaQuantity(minimumQuantity, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : uiT('Enter valid media tariff quantities.'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      await request(token, '/api/v1/admin/units/media/tariffs', 'POST', {
        model_alias: model,
        definition_revision: config.definition.revision,
        expected_revision: config.revision,
        idempotency_key: crypto.randomUUID(),
        price: {
          dimensions: {
            model,
            channel: channel.trim(),
            resolution: resolution.trim(),
            reference_video: referenceVideo,
          },
          meter: 'video_tokens',
          amount_atoms: amountAtoms,
          per_quantity: perQty,
          minimum_quantity: minQty,
          rounding,
        },
      });
      onSaved(model);
    } catch (cause) {
      if (cause instanceof ProviderRequestError && cause.status === 409) {
        setConflict(true);
        setError(uiT('Pricing changed. Reopen the tariff to review the current rate.', '价格已更新。重新打开费率可查看现价。'));
        onConflict();
      } else {
        setError(cause instanceof Error ? cause.message : uiT('Could not publish Credits media tariff.'));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) dismiss(); }}>
      <DialogContent aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }} className="w-[calc(100vw-2rem)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial ? uiF("Revise {0} media tariff", [unitName]) : uiF("Publish {0} media tariff", [unitName])}</DialogTitle>
        </DialogHeader>
        {confirmDiscard ? <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{uiT("Discard changes", "放弃修改")}</Button>
          <Button type="button" autoFocus onClick={keepEditing}>{uiT("Keep editing", "继续编辑")}</Button>
        </DialogFooter> : !initial && (!modelsLoading || modelsRevision > 0) && (modelsError || !models.length) ? <MissingTariffModel message={modelsError ? uiT(modelsError) : uiT("No registered models use video-token media pricing.")} failed={Boolean(modelsError)} loading={modelsLoading} onRefresh={() => refreshModels(value => value + 1)} onClose={onClose} /> : <form className="space-y-4" onSubmit={event => void submit(event)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-model">{uiT("Model")}</Label>
              {initial ? <p className="break-words">{modelAlias}</p> : <DialogModelPicker id="unit-media-model" modelAlias={modelAlias} onSelect={choice => { const media = choice.media; if (!media) return; setModelAlias(choice.model_alias); setChannel(media.channel); setResolution(media.resolutions.length === 1 ? media.resolutions[0] : ''); setReferenceVideo(false); setError(''); }} choices={models} loading={modelsLoading} ariaLabel={uiT("Credits media tariff model")} />}
            </div>
            <div className="space-y-1.5">
              <Label>{uiT("Channel")}</Label>
              <p className="text-sm text-muted-foreground">{channel || uiT("Choose a model to set its channel.")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-resolution">{uiT("Resolution")}</Label>
              {initial ? <p>{resolution}</p> : <DropdownMenu><DropdownMenuTrigger asChild><Button id="unit-media-resolution" type="button" variant="outline" disabled={saving || !chosenMedia} aria-label={uiT("Media resolution")} className="w-full justify-between"><span className="min-w-0 truncate">{resolution || uiT("Choose resolution")}</span><ChevronDown className="size-4 shrink-0" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={resolution} onValueChange={setResolution}>{resolutions.map(r => <DropdownMenuRadioItem key={r} value={r}>{r}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}
            </div>
            <div className="flex items-end pb-2">
              {showReference && <div className="flex items-center gap-2"><Checkbox id="unit-media-ref" checked={referenceVideo} disabled={saving || !!initial} onCheckedChange={v => setReferenceVideo(v === true)} /><Label htmlFor="unit-media-ref">{uiT("With reference video")}</Label></div>}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-amount">{uiT("Rate (")}{unitName})</Label>
              <Input id="unit-media-amount" inputMode="decimal" value={amount} disabled={draftLocked} onChange={event => setAmount(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-per">{uiT("Per quantity (video tokens)")}</Label>
              <Input id="unit-media-per" value={perQuantity} disabled={draftLocked} onChange={event => setPerQuantity(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-min">{uiT("Minimum quantity (video tokens)")}</Label>
              <Input id="unit-media-min" value={minimumQuantity} disabled={draftLocked} onChange={event => setMinimumQuantity(event.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unit-media-rounding">{uiT("Rounding")}</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button id="unit-media-rounding" type="button" variant="outline" disabled={draftLocked} className="w-full sm:w-56 justify-between">
                  <span>{uiT(mediaRoundingLabels[rounding])}</span>
                  <ChevronDown className="size-4 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup value={rounding} onValueChange={v => setRounding(v as 'Down' | 'Up' | 'HalfEven')}>
                  <DropdownMenuRadioItem value="Up">{uiT(mediaRoundingLabels.Up)}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="HalfEven">{uiT(mediaRoundingLabels.HalfEven)}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="Down">{uiT(mediaRoundingLabels.Down)}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {error && (
            <Alert variant="destructive" className={conflict ? "sticky bottom-0 z-10 bg-[var(--background)]!" : undefined} tabIndex={-1} ref={conflict ? focusConflictAlert : undefined}>
              <AlertDescription>{uiT(error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={dismiss}>{uiT("Cancel")}</Button>
            <Button type="submit" disabled={saving || conflict || !modelAlias.trim() || !resolution.trim() || !amount.trim()}>{saving ? uiT("Publishing…") : uiT("Publish", "发布")}</Button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
  );
}
