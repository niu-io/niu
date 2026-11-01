import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { ListRowsSkeleton } from '@/components/PageSkeletons';
import { fetchQuery, invalidateQueries, peekQuery } from '@/lib/query-cache';
import { formatExactUnitAtoms, formatUnitAtoms, unitAmountFromAtoms, unitAmountToAtoms } from '@/lib/money';
import { mediaQuantity, mediaQuantityInput } from '@/lib/media-price';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  const visibleText = (config?.text_tariffs ?? []).filter(t => t.model_alias.toLowerCase().includes(query));
  const visibleMedia = mediaTariffs.filter(t => t.model_alias.toLowerCase().includes(query));

  return (
    <section className="space-y-4 rounded-lg bg-muted/30 p-4" aria-label={uiT("Branded Credits consumption tariffs")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{uiT("Branded Credits consumption tariffs (")}{unitName})</h2>
            {config && (
              <Badge variant={config.billing_mode === 'credits' ? 'default' : 'outline'}>
                {config.billing_mode === 'credits' ? uiT("Active in Credits mode") : uiT("Pre-configured (Currency mode active)")}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {uiT("Explicit atom-denominated model consumption tariffs independent of top-up conversion rates and Provider procurement costs.")}</p>
        </div>
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
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {loading && !config && <ListRowsSkeleton rows={2} label={uiT("Loading Credits tariffs…")} />}
      {!loading && !config?.definition && (
        <p className="text-xs text-muted-foreground">
          {uiT("Publish a branded unit definition in Admin → Settings before publishing Credits consumption tariffs.")}</p>
      )}

      {visibleText.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {uiT("Text model tariffs (per 1M tokens)")}</h3>
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
                  <TableCell className="font-medium">
                    <p>{row.model_alias}</p>
                    <p className="text-xs text-muted-foreground">
                      {uiT("Tariff v")}{row.revision}{" "}{uiT("· Unit v")}{row.definition_revision}
                    </p>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <p>{formatUnitAtoms(row.price.prompt_rate, unitName, precision)}</p>
                    {formatExactUnitAtoms(row.price.prompt_rate, unitName, precision) !==
                      formatUnitAtoms(row.price.prompt_rate, unitName, precision) && (
                      <p className="text-xs text-muted-foreground">
                        {formatExactUnitAtoms(row.price.prompt_rate, unitName, precision)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <p>{formatUnitAtoms(row.price.completion_rate, unitName, precision)}</p>
                    {formatExactUnitAtoms(row.price.completion_rate, unitName, precision) !==
                      formatUnitAtoms(row.price.completion_rate, unitName, precision) && (
                      <p className="text-xs text-muted-foreground">
                        {formatExactUnitAtoms(row.price.completion_rate, unitName, precision)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">
                    <p>
                      {uiT("Cached:")}{' '}
                      {row.price.cached_prompt_rate != null
                        ? formatUnitAtoms(row.price.cached_prompt_rate, unitName, precision)
                        : uiT("Ordinary")}
                    </p>
                    <p>
                      {uiT("Reasoning:")}{' '}
                      {row.price.reasoning_completion_rate != null
                        ? formatUnitAtoms(row.price.reasoning_completion_rate, unitName, precision)
                        : uiT("Ordinary")}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">
                    <p>{uiT("Fee:")}{" "}{formatUnitAtoms(row.price.request_fee_atoms, unitName, precision)}</p>
                    <p>{uiT("Min:")}{" "}{formatUnitAtoms(row.price.minimum_charge_atoms, unitName, precision)}</p>
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
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {uiT("Media / video tariffs")}</h3>
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
                  <TableCell className="font-medium">
                    <p>{row.model_alias}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.channel} · {row.resolution} · {row.reference_video ? uiT("With reference video") : uiT("Standard")}{" "}{uiT("· Tariff v")}{row.revision}
                    </p>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <p>
                      {formatUnitAtoms(row.price.amount_atoms, unitName, precision)}{" "}{uiT("per")}{' '}
                      {mediaQuantityInput(row.price.per_quantity)} {row.meter.replace(/_/g, ' ')}
                    </p>
                    {formatExactUnitAtoms(row.price.amount_atoms, unitName, precision) !==
                      formatUnitAtoms(row.price.amount_atoms, unitName, precision) && (
                      <p className="text-xs text-muted-foreground">
                        {formatExactUnitAtoms(row.price.amount_atoms, unitName, precision)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">
                    <p>
                      {uiT("Minimum:")}{" "}{mediaQuantityInput(row.price.minimum_quantity)} {row.meter.replace(/_/g, ' ')}
                    </p>
                    <p>{uiT("Rounding:")}{" "}{uiT(row.price.rounding)}</p>
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

      {textEditor && config?.definition && (
        <UnitTextTariffDialog
          token={token}
          config={config}
          initial={textEditor === 'new' ? null : textEditor}
          onClose={() => setTextEditor(null)}
          onSaved={modelAlias => {
            setTextEditor(null);
            setNotice(`Published ${unitName} text tariff for ${modelAlias}.`);
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
            setNotice(`Published ${unitName} media tariff for ${modelAlias}.`);
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
  const [promptRate, setPromptRate] = useState(
    initial ? unitAmountFromAtoms(initial.price.prompt_rate) : '15',
  );
  const [completionRate, setCompletionRate] = useState(
    initial ? unitAmountFromAtoms(initial.price.completion_rate) : '30',
  );
  const [cachedRate, setCachedRate] = useState(
    initial?.price.cached_prompt_rate != null ? unitAmountFromAtoms(initial.price.cached_prompt_rate) : '',
  );
  const [reasoningRate, setReasoningRate] = useState(
    initial?.price.reasoning_completion_rate != null
      ? unitAmountFromAtoms(initial.price.reasoning_completion_rate)
      : '',
  );
  const [requestFee, setRequestFee] = useState(
    initial ? unitAmountFromAtoms(initial.price.request_fee_atoms) : '0',
  );
  const [minimumCharge, setMinimumCharge] = useState(
    initial ? unitAmountFromAtoms(initial.price.minimum_charge_atoms) : '0',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !config.definition) return;
    const model = modelAlias.trim();
    if (!model) {
      setError('Enter a model alias.');
      return;
    }
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
      setError(cause instanceof Error ? cause.message : 'Enter valid nonnegative unit amounts (up to 9 decimal places).');
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
      setError(cause instanceof Error ? cause.message : 'Could not publish Credits text tariff.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? uiF("Revise {0} text tariff", [unitName]) : uiF("Publish {0} text tariff", [unitName])}</DialogTitle>
          <DialogDescription>
            {uiT("Rates are specified in")}{" "}{unitName}{" "}{uiT("per 1,000,000 tokens (1")}{" "}{unitName}{" "}{uiT("= 1,000,000,000 exact atoms).")}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={event => void submit(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="unit-tariff-model">{uiT("Model alias")}</Label>
            <Input
              id="unit-tariff-model"
              value={modelAlias}
              disabled={saving || !!initial}
              onChange={event => setModelAlias(event.target.value)}
              placeholder="deepseek/deepseek-chat"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-prompt">{uiT("Input rate (")}{unitName}{" "}{uiT("/ 1M tokens)")}</Label>
              <Input
                id="unit-tariff-prompt"
                inputMode="decimal"
                value={promptRate}
                disabled={saving}
                onChange={event => setPromptRate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-completion">{uiT("Output rate (")}{unitName}{" "}{uiT("/ 1M tokens)")}</Label>
              <Input
                id="unit-tariff-completion"
                inputMode="decimal"
                value={completionRate}
                disabled={saving}
                onChange={event => setCompletionRate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-cached">{uiT("Cached input rate (optional)")}</Label>
              <Input
                id="unit-tariff-cached"
                inputMode="decimal"
                value={cachedRate}
                disabled={saving}
                placeholder={uiT("Uses ordinary input rate")}
                onChange={event => setCachedRate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-reasoning">{uiT("Reasoning output rate (optional)")}</Label>
              <Input
                id="unit-tariff-reasoning"
                inputMode="decimal"
                value={reasoningRate}
                disabled={saving}
                placeholder={uiT("Uses ordinary output rate")}
                onChange={event => setReasoningRate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-fee">{uiT("Fixed request fee (")}{unitName})</Label>
              <Input
                id="unit-tariff-fee"
                inputMode="decimal"
                value={requestFee}
                disabled={saving}
                onChange={event => setRequestFee(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-min">{uiT("Minimum request charge (")}{unitName})</Label>
              <Input
                id="unit-tariff-min"
                inputMode="decimal"
                value={minimumCharge}
                disabled={saving}
                onChange={event => setMinimumCharge(event.target.value)}
              />
            </div>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              {uiT("Cancel")}</Button>
            <Button type="submit" disabled={saving}>
              {saving ? uiT("Publishing…") : uiF("Publish {0} text tariff", [unitName])}
            </Button>
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
  const [modelAlias, setModelAlias] = useState(initial?.model_alias ?? 'seedance-2.0');
  const [channel, setChannel] = useState(initial?.channel ?? 'default');
  const [resolution, setResolution] = useState(initial?.resolution ?? '720p');
  const [referenceVideo, setReferenceVideo] = useState(initial?.reference_video ?? false);
  const [amount, setAmount] = useState(initial ? unitAmountFromAtoms(initial.price.amount_atoms) : '15');
  const [perQuantity, setPerQuantity] = useState(
    initial ? mediaQuantityInput(initial.price.per_quantity) : '1000',
  );
  const [minimumQuantity, setMinimumQuantity] = useState(
    initial ? mediaQuantityInput(initial.price.minimum_quantity) : '1',
  );
  const [rounding, setRounding] = useState<'Down' | 'Up' | 'HalfEven'>(initial?.price.rounding ?? 'Up');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !config.definition) return;
    const model = modelAlias.trim();
    const ch = channel.trim();
    const res = resolution.trim();
    if (!model || !ch || !res) {
      setError('Complete model alias, channel, and resolution.');
      return;
    }
    let amountAtoms: string;
    let perQty: { numerator: string; denominator: string };
    let minQty: { numerator: string; denominator: string };
    try {
      amountAtoms = unitAmountToAtoms(amount, true);
      perQty = mediaQuantity(perQuantity, false);
      minQty = mediaQuantity(minimumQuantity, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter valid media tariff quantities.');
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
            channel: ch,
            resolution: res,
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
      setError(cause instanceof Error ? cause.message : 'Could not publish Credits media tariff.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? uiF("Revise {0} media tariff", [unitName]) : uiF("Publish {0} media tariff", [unitName])}</DialogTitle>
          <DialogDescription>
            {uiT("Set")}{" "}{unitName}{" "}{uiT("consumption rates for video generation by model, channel, resolution, and reference-video mode.")}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={event => void submit(event)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-model">{uiT("Model alias")}</Label>
              <Input
                id="unit-media-model"
                value={modelAlias}
                disabled={saving || !!initial}
                onChange={event => setModelAlias(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-channel">{uiT("Channel")}</Label>
              <Input
                id="unit-media-channel"
                value={channel}
                disabled={saving || !!initial}
                onChange={event => setChannel(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-resolution">{uiT("Resolution")}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    id="unit-media-resolution"
                    type="button"
                    variant="outline"
                    disabled={saving || !!initial}
                    className="w-full justify-between"
                  >
                    <span>{resolution}</span>
                    <ChevronDown className="size-4 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup value={resolution} onValueChange={setResolution}>
                    {['480p', '720p', '1080p'].map(r => (
                      <DropdownMenuRadioItem key={r} value={r}>
                        {r}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex items-end pb-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="unit-media-ref"
                  checked={referenceVideo}
                  disabled={saving || !!initial}
                  onCheckedChange={v => setReferenceVideo(v === true)}
                />
                <Label htmlFor="unit-media-ref">{uiT("With reference video")}</Label>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-amount">{uiT("Rate (")}{unitName})</Label>
              <Input
                id="unit-media-amount"
                inputMode="decimal"
                value={amount}
                disabled={saving}
                onChange={event => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-per">{uiT("Per video tokens")}</Label>
              <Input
                id="unit-media-per"
                value={perQuantity}
                disabled={saving}
                onChange={event => setPerQuantity(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-min">{uiT("Minimum video tokens")}</Label>
              <Input
                id="unit-media-min"
                value={minimumQuantity}
                disabled={saving}
                onChange={event => setMinimumQuantity(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unit-media-rounding">{uiT("Rounding")}</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  id="unit-media-rounding"
                  type="button"
                  variant="outline"
                  disabled={saving}
                  className="w-full sm:w-56 justify-between"
                >
                  <span>{uiT(rounding)}</span>
                  <ChevronDown className="size-4 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                  value={rounding}
                  onValueChange={v => setRounding(v as 'Down' | 'Up' | 'HalfEven')}
                >
                  <DropdownMenuRadioItem value="Up">{uiT("Up")}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="HalfEven">{uiT("HalfEven")}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="Down">{uiT("Down")}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              {uiT("Cancel")}</Button>
            <Button type="submit" disabled={saving}>
              {saving ? uiT("Publishing…") : uiF("Publish {0} media tariff", [unitName])}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
