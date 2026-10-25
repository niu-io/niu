import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
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
  const [config, setConfig] = useState<UnitPlatformConfig | null>(null);
  const [mediaTariffs, setMediaTariffs] = useState<UnitMediaTariffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [textEditor, setTextEditor] = useState<UnitTextTariffRecord | 'new' | null>(null);
  const [mediaEditor, setMediaEditor] = useState<UnitMediaTariffRecord | 'new' | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [cfgResp, mediaResp] = await Promise.all([
        request<{ data: UnitPlatformConfig }>(token, '/api/v1/platform/units', 'GET'),
        request<{ data: UnitMediaTariffRecord[] }>(token, '/api/v1/platform/units/media/tariffs', 'GET'),
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

  const unitName = config?.definition?.name ?? 'Niu Credits';
  const precision = config?.definition?.display_precision ?? 2;
  const query = filter.trim().toLowerCase();
  const visibleText = (config?.text_tariffs ?? []).filter(t => t.model_alias.toLowerCase().includes(query));
  const visibleMedia = mediaTariffs.filter(t => t.model_alias.toLowerCase().includes(query));

  return (
    <section className="space-y-4 rounded-lg bg-muted/30 p-4" aria-label="Branded Credits consumption tariffs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Branded Credits consumption tariffs ({unitName})</h2>
            {config && (
              <Badge variant={config.billing_mode === 'credits' ? 'default' : 'outline'}>
                {config.billing_mode === 'credits' ? 'Active in Credits mode' : 'Pre-configured (Currency mode active)'}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Explicit atom-denominated model consumption tariffs independent of top-up conversion rates and Provider
            procurement costs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
            Refresh Credits tariffs
          </Button>
          <Button
            size="sm"
            disabled={loading || !config?.definition}
            onClick={() => {
              setNotice('');
              setTextEditor('new');
            }}
          >
            Publish Credits text tariff
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || !config?.definition}
            onClick={() => {
              setNotice('');
              setMediaEditor('new');
            }}
          >
            Publish Credits media tariff
          </Button>
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
      {!loading && !config?.definition && (
        <p className="text-xs text-muted-foreground">
          Publish a branded unit definition in Admin → Settings before publishing Credits consumption tariffs.
        </p>
      )}

      {visibleText.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Text model tariffs (per 1M tokens)
          </h3>
          <Table aria-label="Branded Credits text tariffs">
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Input / 1M</TableHead>
                <TableHead>Output / 1M</TableHead>
                <TableHead>Cached / Reasoning</TableHead>
                <TableHead>Request fee &amp; min</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleText.map(row => (
                <TableRow key={row.model_alias}>
                  <TableCell className="font-medium">
                    <p>{row.model_alias}</p>
                    <p className="text-xs text-muted-foreground">
                      Tariff v{row.revision} · Unit v{row.definition_revision}
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
                      Cached:{' '}
                      {row.price.cached_prompt_rate != null
                        ? formatUnitAtoms(row.price.cached_prompt_rate, unitName, precision)
                        : 'Ordinary'}
                    </p>
                    <p>
                      Reasoning:{' '}
                      {row.price.reasoning_completion_rate != null
                        ? formatUnitAtoms(row.price.reasoning_completion_rate, unitName, precision)
                        : 'Ordinary'}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">
                    <p>Fee: {formatUnitAtoms(row.price.request_fee_atoms, unitName, precision)}</p>
                    <p>Min: {formatUnitAtoms(row.price.minimum_charge_atoms, unitName, precision)}</p>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Edit Credits text tariff for ${row.model_alias}`}
                      onClick={() => {
                        setNotice('');
                        setTextEditor(row);
                      }}
                    >
                      Edit
                    </Button>
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
            Media / video tariffs
          </h3>
          <Table aria-label="Branded Credits media tariffs">
            <TableHeader>
              <TableRow>
                <TableHead>Model &amp; dimensions</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Minimum &amp; rounding</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMedia.map(row => (
                <TableRow key={`${row.model_alias}:${row.channel}:${row.resolution}:${row.reference_video}`}>
                  <TableCell className="font-medium">
                    <p>{row.model_alias}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.channel} · {row.resolution} · {row.reference_video ? 'With reference video' : 'Standard'} ·
                      Tariff v{row.revision}
                    </p>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <p>
                      {formatUnitAtoms(row.price.amount_atoms, unitName, precision)} per{' '}
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
                      Minimum: {mediaQuantityInput(row.price.minimum_quantity)} {row.meter.replace(/_/g, ' ')}
                    </p>
                    <p>Rounding: {row.price.rounding}</p>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Edit Credits media tariff for ${row.model_alias}`}
                      onClick={() => {
                        setNotice('');
                        setMediaEditor(row);
                      }}
                    >
                      Edit
                    </Button>
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
            void load();
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
            void load();
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
  const unitName = config.definition?.name ?? 'Niu Credits';
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
          <DialogTitle>{initial ? `Revise ${unitName} text tariff` : `Publish ${unitName} text tariff`}</DialogTitle>
          <DialogDescription>
            Rates are specified in {unitName} per 1,000,000 tokens (1 {unitName} = 1,000,000,000 exact atoms).
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={event => void submit(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="unit-tariff-model">Model alias</Label>
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
              <Label htmlFor="unit-tariff-prompt">Input rate ({unitName} / 1M tokens)</Label>
              <Input
                id="unit-tariff-prompt"
                inputMode="decimal"
                value={promptRate}
                disabled={saving}
                onChange={event => setPromptRate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-completion">Output rate ({unitName} / 1M tokens)</Label>
              <Input
                id="unit-tariff-completion"
                inputMode="decimal"
                value={completionRate}
                disabled={saving}
                onChange={event => setCompletionRate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-cached">Cached input rate (optional)</Label>
              <Input
                id="unit-tariff-cached"
                inputMode="decimal"
                value={cachedRate}
                disabled={saving}
                placeholder="Uses ordinary input rate"
                onChange={event => setCachedRate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-reasoning">Reasoning output rate (optional)</Label>
              <Input
                id="unit-tariff-reasoning"
                inputMode="decimal"
                value={reasoningRate}
                disabled={saving}
                placeholder="Uses ordinary output rate"
                onChange={event => setReasoningRate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-fee">Fixed request fee ({unitName})</Label>
              <Input
                id="unit-tariff-fee"
                inputMode="decimal"
                value={requestFee}
                disabled={saving}
                onChange={event => setRequestFee(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-tariff-min">Minimum request charge ({unitName})</Label>
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
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Publishing…' : `Publish ${unitName} text tariff`}
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
  const unitName = config.definition?.name ?? 'Niu Credits';
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
          <DialogTitle>{initial ? `Revise ${unitName} media tariff` : `Publish ${unitName} media tariff`}</DialogTitle>
          <DialogDescription>
            Set {unitName} consumption rates for video generation by model, channel, resolution, and reference-video
            mode.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={event => void submit(event)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-model">Model alias</Label>
              <Input
                id="unit-media-model"
                value={modelAlias}
                disabled={saving || !!initial}
                onChange={event => setModelAlias(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-channel">Channel</Label>
              <Input
                id="unit-media-channel"
                value={channel}
                disabled={saving || !!initial}
                onChange={event => setChannel(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-resolution">Resolution</Label>
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
                <Label htmlFor="unit-media-ref">With reference video</Label>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-amount">Rate ({unitName})</Label>
              <Input
                id="unit-media-amount"
                inputMode="decimal"
                value={amount}
                disabled={saving}
                onChange={event => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-per">Per video tokens</Label>
              <Input
                id="unit-media-per"
                value={perQuantity}
                disabled={saving}
                onChange={event => setPerQuantity(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-media-min">Minimum video tokens</Label>
              <Input
                id="unit-media-min"
                value={minimumQuantity}
                disabled={saving}
                onChange={event => setMinimumQuantity(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unit-media-rounding">Rounding</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  id="unit-media-rounding"
                  type="button"
                  variant="outline"
                  disabled={saving}
                  className="w-full sm:w-56 justify-between"
                >
                  <span>{rounding}</span>
                  <ChevronDown className="size-4 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                  value={rounding}
                  onValueChange={v => setRounding(v as 'Down' | 'Up' | 'HalfEven')}
                >
                  <DropdownMenuRadioItem value="Up">Up</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="HalfEven">HalfEven</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="Down">Down</DropdownMenuRadioItem>
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
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Publishing…' : `Publish ${unitName} media tariff`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
