import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { IconCoins } from '@tabler/icons-react';
import { ListRowsSkeleton } from '@/components/PageSkeletons';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity } from '@/lib/providers';
import { fetchQuery, invalidateQueries, peekQuery } from '@/lib/query-cache';
import { formatExactUnitAtoms, formatUnitAtoms, unitAmountFromAtoms, unitAmountToAtoms } from '@/lib/money';
import { mediaQuantity, mediaQuantityInput } from '@/lib/media-price';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { request } from '@/features/providers/api';
import { registeredRetailModelChoices, type RetailModelChoice } from './api';

type UnitTextPrice = {
  prompt_rate: string;
  completion_rate: string;
  cached_prompt_rate?: string | null;
  cache_write_prompt_rate?: string | null;
  reasoning_completion_rate?: string | null;
  request_fee_atoms: string;
  minimum_charge_atoms: string;
  context_tiers: unknown[];
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

function UnitRate({ atoms, unitName, precision }: { atoms: string; unitName: string; precision: number }) {
  const summary = formatUnitAtoms(atoms, unitName, precision);
  const exact = formatExactUnitAtoms(atoms, unitName, precision);
  return <>{summary}{exact !== summary && <span className="block text-xs text-muted-foreground">{exact}</span>}</>;
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
  error,
  emptyCopy,
  ariaLabel,
}: {
  id: string;
  modelAlias: string;
  onSelect: (choice: RetailModelChoice) => void;
  choices: RetailModelChoice[];
  loading: boolean;
  error: string;
  emptyCopy: ReactNode;
  ariaLabel: string;
}) {
  const { t: uiT } = useUILocale();
  const [query, setQuery] = useState('');
  const visible = choices.filter(choice => choice.model_alias.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button id={id} type="button" variant="outline" className="w-full justify-between" disabled={loading || !!error} aria-label={ariaLabel}>
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
      {!loading && !error && !choices.length && <Alert><AlertDescription className="flex min-w-0 flex-wrap items-center gap-2"><span className="min-w-0">{emptyCopy}</span><Link className="font-medium text-primary underline underline-offset-4" to="/admin/providers" target="_blank" rel="noopener noreferrer">{uiT("Configure a Provider model (opens in a new tab)")}</Link></AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertDescription>{uiT(error)}</AlertDescription></Alert>}
    </>
  );
}

export function BrandedUnitTariffsSection({ token, filter }: { token: string; filter: string }) {
  const { t: uiT, format: uiF } = useUILocale();
  const scope = token || 'public';
  const initialCfg = peekQuery<{ data: UnitPlatformConfig }>(scope, '/api/v1/platform/units')?.data ?? null;
  const initialMedia = peekQuery<{ data: UnitMediaTariffRecord[] }>(scope, '/api/v1/platform/units/media/tariffs')?.data;
  const [config, setConfig] = useState<UnitPlatformConfig | null>(() => initialCfg);
  const [mediaTariffs, setMediaTariffs] = useState<UnitMediaTariffRecord[]>(() => Array.isArray(initialMedia) ? initialMedia : []);
  const [loading, setLoading] = useState(() => !initialCfg);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [textEditor, setTextEditor] = useState<UnitTextTariffRecord | 'new' | null>(null);
  const [mediaEditor, setMediaEditor] = useState<UnitMediaTariffRecord | 'new' | null>(null);

  async function load(force = false) {
    setLoading(true);
    setError('');
    try {
      if (force) invalidateQueries('/api/v1/platform/units');
      const [cfgResp, mediaResp] = await Promise.all([
        fetchQuery(
          scope,
          '/api/v1/platform/units',
          signal => request<{ data: UnitPlatformConfig }>(token, '/api/v1/platform/units', 'GET', undefined, signal),
          { force, awaitRevalidate: true },
        ),
        fetchQuery(
          scope,
          '/api/v1/platform/units/media/tariffs',
          signal => request<{ data: UnitMediaTariffRecord[] }>(token, '/api/v1/platform/units/media/tariffs', 'GET', undefined, signal),
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">{uiF("Rates are charged in {0} when the installation bills in Branded Credits. Publishing a rate does not change the active billing mode.", [unitName])}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void load(true)}>
            {uiT("Refresh Credits tariffs")}</Button>
          <Button
            size="sm"
            disabled={loading || !config?.definition}
            onClick={() => {
              setNotice('');
              setTextEditor('new');
            }}
          >
            {uiT("Publish Credits text tariff")}</Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || !config?.definition}
            onClick={() => {
              setNotice('');
              setMediaEditor('new');
            }}
          >
            {uiT("Publish Credits media tariff")}</Button>
        </div>
      </div>

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
            <span>{uiT("Publish a branded unit definition in Admin → Settings before publishing Credits consumption tariffs.")}</span>
            <Button asChild variant="link" className="h-auto p-0"><Link to="/admin/settings">{uiT("Open Settings")}</Link></Button>
          </AlertDescription>
        </Alert>
      )}

      {visibleText.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{uiT("Text model tariffs (per 1M tokens)")}</h3>
          <Table aria-label={uiT("Branded Credits text tariffs")}>
            <TableHeader>
              <TableRow>
                <TableHead>{uiT("Model")}</TableHead>
                <TableHead>{uiT("Input / 1M")}</TableHead>
                <TableHead>{uiT("Output / 1M")}</TableHead>
                <TableHead>{uiT("Cached / Reasoning")}</TableHead>
                <TableHead>{uiT("Request fee & min")}</TableHead>
                <TableHead>{uiT("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleText.map(row => (
                <TableRow key={row.model_alias}>
                  <TableCell className="max-w-40 whitespace-normal font-medium"><p className="inline-flex items-center gap-2 break-words"><ProviderLogo provider={modelIdentity({ id: row.model_alias })} size="small" /><span>{row.model_alias}</span></p></TableCell>
                  <TableCell className="tabular-nums"><UnitRate atoms={row.price.prompt_rate} unitName={unitName} precision={precision} /></TableCell>
                  <TableCell className="tabular-nums"><UnitRate atoms={row.price.completion_rate} unitName={unitName} precision={precision} /></TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">
                    <p>{uiT("Cached:")}{' '}{row.price.cached_prompt_rate != null ? formatUnitAtoms(row.price.cached_prompt_rate, unitName, precision) : uiT("Ordinary")}</p>
                    <p>{uiT("Reasoning:")}{' '}{row.price.reasoning_completion_rate != null ? formatUnitAtoms(row.price.reasoning_completion_rate, unitName, precision) : uiT("Ordinary")}</p>
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">
                    <p>{uiT("Fee:")}{' '}{formatUnitAtoms(row.price.request_fee_atoms, unitName, precision)}</p>
                    <p>{uiT("Min:")}{' '}{formatUnitAtoms(row.price.minimum_charge_atoms, unitName, precision)}</p>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={uiF("Edit Credits text tariff for {0}", [row.model_alias])}
                      onClick={() => {
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
          <Table aria-label={uiT("Branded Credits media tariffs")}>
            <TableHeader>
              <TableRow>
                <TableHead>{uiT("Model & dimensions")}</TableHead>
                <TableHead>{uiT("Rate")}</TableHead>
                <TableHead>{uiT("Minimum & rounding")}</TableHead>
                <TableHead>{uiT("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMedia.map(row => (
                <TableRow key={`${row.model_alias}:${row.channel}:${row.resolution}:${row.reference_video}`}>
                  <TableCell className="max-w-56 whitespace-normal font-medium">
                    <p className="inline-flex items-center gap-2 break-words"><ProviderLogo provider={modelIdentity({ id: row.model_alias })} size="small" /><span>{row.model_alias}</span></p>
                    <p className="text-xs text-muted-foreground">
                      {row.channel} · {row.resolution} · {row.reference_video ? uiT("With reference video") : uiT("Standard")}
                    </p>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <p>{formatUnitAtoms(row.price.amount_atoms, unitName, precision)}{' '}{uiT("per")}{' '}{quantityText(row.price.per_quantity)} {uiT("video tokens")}</p>
                    {formatExactUnitAtoms(row.price.amount_atoms, unitName, precision) !== formatUnitAtoms(row.price.amount_atoms, unitName, precision) && <p className="text-xs text-muted-foreground">{formatExactUnitAtoms(row.price.amount_atoms, unitName, precision)}</p>}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">
                    <p>{uiT("Minimum:")}{' '}{quantityText(row.price.minimum_quantity)} {uiT("video tokens")}</p>
                    <p>{uiT("Rounding:")}{' '}{uiT(row.price.rounding)}</p>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={uiF("Edit Credits media tariff for {0}", [row.model_alias])}
                      onClick={() => {
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

function UnitTextTariffDialog({
  token,
  config,
  initial,
  onClose,
  onSaved,
}: {
  token: string;
  config: UnitPlatformConfig;
  initial: UnitTextTariffRecord | null;
  onClose: () => void;
  onSaved: (modelAlias: string) => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const unitName = config.definition?.name ?? uiT("Niu Credits");
  const [modelAlias, setModelAlias] = useState(initial?.model_alias ?? '');
  const [models, setModels] = useState<RetailModelChoice[]>([]);
  const [modelsLoading, setModelsLoading] = useState(() => !initial);
  const [modelsError, setModelsError] = useState('');
  const [promptRate, setPromptRate] = useState(initial ? unitAmountFromAtoms(initial.price.prompt_rate) : '');
  const [completionRate, setCompletionRate] = useState(initial ? unitAmountFromAtoms(initial.price.completion_rate) : '');
  const [cachedRate, setCachedRate] = useState(initial?.price.cached_prompt_rate != null ? unitAmountFromAtoms(initial.price.cached_prompt_rate) : '');
  const [reasoningRate, setReasoningRate] = useState(initial?.price.reasoning_completion_rate != null ? unitAmountFromAtoms(initial.price.reasoning_completion_rate) : '');
  const [requestFee, setRequestFee] = useState(initial ? unitAmountFromAtoms(initial.price.request_fee_atoms) : '0');
  const [minimumCharge, setMinimumCharge] = useState(initial ? unitAmountFromAtoms(initial.price.minimum_charge_atoms) : '0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initial) return;
    const controller = new AbortController();
    setModelsLoading(true); setModelsError('');
    void registeredRetailModelChoices(token, controller.signal)
      .then(choices => { if (!controller.signal.aborted) setModels(choices); })
      .catch(failure => { if (!controller.signal.aborted) setModelsError(failure instanceof Error ? failure.message : uiT('Registered models unavailable.')); })
      .finally(() => { if (!controller.signal.aborted) setModelsLoading(false); });
    return () => controller.abort();
  }, [token, initial]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !config.definition) return;
    const model = modelAlias.trim();
    if (!model) { setError(uiT("Choose a registered model.")); return; }
    if (!promptRate.trim() || !completionRate.trim()) { setError(uiT("Enter input and output rates.")); return; }
    let price: UnitTextPrice;
    try {
      price = {
        prompt_rate: unitAmountToAtoms(promptRate, true),
        completion_rate: unitAmountToAtoms(completionRate, true),
        cached_prompt_rate: cachedRate.trim() ? unitAmountToAtoms(cachedRate, true) : null,
        cache_write_prompt_rate: null,
        reasoning_completion_rate: reasoningRate.trim() ? unitAmountToAtoms(reasoningRate, true) : null,
        request_fee_atoms: unitAmountToAtoms(requestFee, true),
        minimum_charge_atoms: unitAmountToAtoms(minimumCharge, true),
        context_tiers: initial?.price.context_tiers ?? [],
      };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : uiT('Enter valid nonnegative unit amounts (up to 9 decimal places).'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      const latestCfg = await request<{ data: UnitPlatformConfig }>(token, '/api/v1/platform/units', 'GET');
      const defRev = latestCfg.data.definition?.revision ?? config.definition.revision;
      await request(token, '/api/v1/platform/units/tariffs', 'POST', {
        model_alias: model,
        definition_revision: defRev,
        expected_revision: latestCfg.data.revision,
        idempotency_key: crypto.randomUUID(),
        price,
      });
      onSaved(model);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : uiT('Could not publish Credits text tariff.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? uiF("Revise {0} text tariff", [unitName]) : uiF("Publish {0} text tariff", [unitName])}</DialogTitle>
          <DialogDescription>{uiF("Rates are in {0} per 1,000,000 tokens. Up to 9 decimal places are stored exactly.", [unitName])}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={event => void submit(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="unit-tariff-model">{uiT("Model")}</Label>
            {initial ? <p className="break-words">{modelAlias}</p> : <DialogModelPicker id="unit-tariff-model" modelAlias={modelAlias} onSelect={choice => { setModelAlias(choice.model_alias); setError(''); }} choices={models} loading={modelsLoading} error={modelsError} emptyCopy={uiT("No registered models are available for pricing.")} ariaLabel={uiT("Credits text tariff model")} />}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-prompt">{uiT("Input rate (")}{unitName}{" "}{uiT("/ 1M tokens)")}</Label>
              <Input id="unit-tariff-prompt" inputMode="decimal" value={promptRate} disabled={saving} onChange={event => setPromptRate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-completion">{uiT("Output rate (")}{unitName}{" "}{uiT("/ 1M tokens)")}</Label>
              <Input id="unit-tariff-completion" inputMode="decimal" value={completionRate} disabled={saving} onChange={event => setCompletionRate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-cached">{uiT("Cached input rate (optional)")}</Label>
              <Input id="unit-tariff-cached" inputMode="decimal" value={cachedRate} disabled={saving} placeholder={uiT("Uses ordinary input rate")} onChange={event => setCachedRate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-reasoning">{uiT("Reasoning output rate (optional)")}</Label>
              <Input id="unit-tariff-reasoning" inputMode="decimal" value={reasoningRate} disabled={saving} placeholder={uiT("Uses ordinary output rate")} onChange={event => setReasoningRate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-fee">{uiT("Fixed request fee (")}{unitName})</Label>
              <Input id="unit-tariff-fee" inputMode="decimal" value={requestFee} disabled={saving} onChange={event => setRequestFee(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-min">{uiT("Minimum request charge (")}{unitName})</Label>
              <Input id="unit-tariff-min" inputMode="decimal" value={minimumCharge} disabled={saving} onChange={event => setMinimumCharge(event.target.value)} />
            </div>
          </div>
          {error && <Alert variant="destructive"><AlertDescription>{uiT(error)}</AlertDescription></Alert>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>{uiT("Cancel")}</Button>
            <Button type="submit" disabled={saving || !modelAlias.trim() || !promptRate.trim() || !completionRate.trim()}>{saving ? uiT("Publishing…") : initial ? uiF("Revise {0} tariff", [unitName]) : uiF("Publish {0} tariff", [unitName])}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UnitMediaTariffDialog({
  token,
  config,
  initial,
  onClose,
  onSaved,
}: {
  token: string;
  config: UnitPlatformConfig;
  initial: UnitMediaTariffRecord | null;
  onClose: () => void;
  onSaved: (modelAlias: string) => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const unitName = config.definition?.name ?? uiT("Niu Credits");
  const [modelAlias, setModelAlias] = useState(initial?.model_alias ?? '');
  const [models, setModels] = useState<RetailModelChoice[]>([]);
  const [modelsLoading, setModelsLoading] = useState(() => !initial);
  const [modelsError, setModelsError] = useState('');
  const [channel, setChannel] = useState(initial?.channel ?? '');
  const [resolution, setResolution] = useState(initial?.resolution ?? '');
  const [referenceVideo, setReferenceVideo] = useState(initial?.reference_video ?? false);
  const [amount, setAmount] = useState(initial ? unitAmountFromAtoms(initial.price.amount_atoms) : '');
  const [perQuantity, setPerQuantity] = useState(initial ? mediaQuantityInput(initial.price.per_quantity) : '1000');
  const [minimumQuantity, setMinimumQuantity] = useState(initial ? mediaQuantityInput(initial.price.minimum_quantity) : '1');
  const [rounding, setRounding] = useState<'Down' | 'Up' | 'HalfEven'>(initial?.price.rounding ?? 'Up');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initial) return;
    const controller = new AbortController();
    setModelsLoading(true); setModelsError('');
    void registeredRetailModelChoices(token, controller.signal)
      .then(choices => { if (!controller.signal.aborted) setModels(choices.filter(choice => choice.media?.meter === 'video_tokens')); })
      .catch(failure => { if (!controller.signal.aborted) setModelsError(failure instanceof Error ? failure.message : uiT('Registered models unavailable.')); })
      .finally(() => { if (!controller.signal.aborted) setModelsLoading(false); });
    return () => controller.abort();
  }, [token, initial]);

  const chosenMedia = initial ? null : models.find(choice => choice.model_alias === modelAlias)?.media ?? null;
  const resolutions = initial ? [resolution] : chosenMedia?.resolutions ?? [];
  const showReference = initial ? initial.reference_video : chosenMedia?.reference_video === true;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !config.definition) return;
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
      const latestCfg = await request<{ data: UnitPlatformConfig }>(token, '/api/v1/platform/units', 'GET');
      const defRev = latestCfg.data.definition?.revision ?? config.definition.revision;
      await request(token, '/api/v1/platform/units/media/tariffs', 'POST', {
        model_alias: model,
        definition_revision: defRev,
        expected_revision: latestCfg.data.revision,
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
      setError(cause instanceof Error ? cause.message : uiT('Could not publish Credits media tariff.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? uiF("Revise {0} media tariff", [unitName]) : uiF("Publish {0} media tariff", [unitName])}</DialogTitle>
          <DialogDescription>{uiF("Set {0} consumption rates for video generation. The selected registered model fixes its channel and supported resolutions.", [unitName])}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={event => void submit(event)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-model">{uiT("Model")}</Label>
              {initial ? <p className="break-words">{modelAlias}</p> : <DialogModelPicker id="unit-media-model" modelAlias={modelAlias} onSelect={choice => { const media = choice.media; if (!media) return; setModelAlias(choice.model_alias); setChannel(media.channel); setResolution(media.resolutions.length === 1 ? media.resolutions[0] : ''); setReferenceVideo(false); setError(''); }} choices={models} loading={modelsLoading} error={modelsError} emptyCopy={uiT("No registered models use video-token media pricing.")} ariaLabel={uiT("Credits media tariff model")} />}
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
              <Input id="unit-media-amount" inputMode="decimal" value={amount} disabled={saving} onChange={event => setAmount(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-per">{uiT("Per quantity (video tokens)")}</Label>
              <Input id="unit-media-per" value={perQuantity} disabled={saving} onChange={event => setPerQuantity(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-min">{uiT("Minimum quantity (video tokens)")}</Label>
              <Input id="unit-media-min" value={minimumQuantity} disabled={saving} onChange={event => setMinimumQuantity(event.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unit-media-rounding">{uiT("Rounding")}</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button id="unit-media-rounding" type="button" variant="outline" disabled={saving} className="w-full sm:w-56 justify-between">
                  <span>{uiT(rounding)}</span>
                  <ChevronDown className="size-4 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup value={rounding} onValueChange={v => setRounding(v as 'Down' | 'Up' | 'HalfEven')}>
                  <DropdownMenuRadioItem value="Up">{uiT("Up")}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="HalfEven">{uiT("HalfEven")}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="Down">{uiT("Down")}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{uiT(error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>{uiT("Cancel")}</Button>
            <Button type="submit" disabled={saving || !modelAlias.trim() || !resolution.trim() || !amount.trim()}>{saving ? uiT("Publishing…") : initial ? uiF("Revise {0} tariff", [unitName]) : uiF("Publish {0} tariff", [unitName])}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
