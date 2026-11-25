import { useState, type FormEvent } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import type { RetailSchedule } from '@niu-io/sdk/admin';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDiscountBadge } from '@/features/provider-business/upstream-pricing';
import { amountFromNanos, amountToNanos } from '@/lib/money';
import { mediaAmount, mediaAmountUnits } from '@/lib/media-price';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import {
  discountRetailSchedule,
  formatScheduleCompact,
  inferCustomerDiscountPercent,
  parseCustomerDiscountInput,
  PRESET_DISCOUNTS,
  VALIDITY_PRESETS,
  type CustomerModelPriceRow,
  type ValidityId,
} from './customer-pricing-model';

function ValiditySelector({
  value,
  disabled,
  onChange,
}: {
  value: ValidityId;
  disabled: boolean;
  onChange: (next: ValidityId) => void;
}) {
  const { locale, t: uiT } = useUILocale();
  const isZh = locale === 'zh-CN';
  const preset = VALIDITY_PRESETS.find(item => item.id === value) ?? VALIDITY_PRESETS[2];
  return (
    <div className="space-y-1.5">
      <Label>{uiT('Valid for', '有效期')}</Label>
      <div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={uiT('Discount validity period')}>
              <span>{isZh ? preset.labelZh : preset.labelEn}</span>
              <IconChevronDown size={14} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup value={value} onValueChange={v => onChange(v as ValidityId)}>
              {VALIDITY_PRESETS.map(item => (
                <DropdownMenuRadioItem key={item.id} value={item.id}>
                  {isZh ? item.labelZh : item.labelEn}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function CustomerModelPriceDialog({
  row,
  busy,
  error,
  returnFocusTo,
  onClose,
  onSave,
}: {
  row: CustomerModelPriceRow;
  busy: boolean;
  error: string;
  returnFocusTo: HTMLElement | null;
  onClose: () => void;
  onSave: (payload: { schedule: RetailSchedule; validSeconds: number; reason: string }) => Promise<void>;
}) {
  const { locale, t: uiT, format: uiF } = useUILocale();
  const isZh = locale === 'zh-CN';
  const promo = row.active_promotion;
  const activeSchedule = promo?.schedule ?? row.standard_schedule;
  const initialPercent = promo ? inferCustomerDiscountPercent(row.standard_schedule, promo.schedule) : null;
  const defaultPercent =
    initialPercent !== null && initialPercent > 0 && initialPercent < 100
      ? Number.isInteger(initialPercent)
        ? String(initialPercent)
        : initialPercent.toFixed(1).replace(/\.0$/, '')
      : '85';

  const [mode, setMode] = useState<'percent' | 'exact'>('percent');
  const [discountInput, setDiscountInput] = useState(defaultPercent);
  const [inputRate, setInputRate] = useState(() =>
    activeSchedule.kind === 'text' ? amountFromNanos(activeSchedule.prompt_rate) : '',
  );
  const [outputRate, setOutputRate] = useState(() =>
    activeSchedule.kind === 'text' ? amountFromNanos(activeSchedule.completion_rate) : '',
  );
  const [mediaRate, setMediaRate] = useState(() =>
    activeSchedule.kind === 'media' ? mediaAmount(activeSchedule.amount_units, activeSchedule.decimal_places) : '',
  );
  const [validityId, setValidityId] = useState<ValidityId>('5y');
  const [validationError, setValidationError] = useState('');

  const validityPreset = VALIDITY_PRESETS.find(item => item.id === validityId) ?? VALIDITY_PRESETS[2];
  const parsedPercent = mode === 'percent' ? parseCustomerDiscountInput(discountInput) : null;
  const previewSchedule = parsedPercent !== null ? discountRetailSchedule(row.standard_schedule, parsedPercent) : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setValidationError('');

    let schedule: RetailSchedule;
    let reason: string;

    if (mode === 'percent') {
      const percent = parseCustomerDiscountInput(discountInput);
      if (percent === null) {
        setValidationError(uiT('Enter a discount between 1% and 99.9% (e.g. 85 for 15% off).'));
        return;
      }
      schedule = discountRetailSchedule(row.standard_schedule, percent);
      reason = `Customer price (${percent}% of standard)`;
    } else if (row.standard_schedule.kind === 'text') {
      let promptNanos: string;
      let completionNanos: string;
      try {
        promptNanos = amountToNanos(inputRate, true);
        completionNanos = amountToNanos(outputRate, true);
      } catch {
        setValidationError(uiT('Enter valid non-negative input and output prices per 1M tokens.'));
        return;
      }
      if (
        BigInt(promptNanos) > BigInt(row.standard_schedule.prompt_rate) ||
        BigInt(completionNanos) > BigInt(row.standard_schedule.completion_rate)
      ) {
        setValidationError(uiT('Customer-specific prices cannot exceed the platform standard price.'));
        return;
      }
      const inferred = inferCustomerDiscountPercent(row.standard_schedule, {
        ...row.standard_schedule,
        prompt_rate: promptNanos,
        completion_rate: completionNanos,
      });
      const baseScale = inferred !== null && inferred > 0 && inferred < 100 ? inferred : 100;
      const scaled = discountRetailSchedule(row.standard_schedule, baseScale);
      schedule = scaled.kind === 'text' ? { ...scaled, prompt_rate: promptNanos, completion_rate: completionNanos } : row.standard_schedule;
      reason = 'Custom customer price';
    } else {
      let amountUnits: string;
      try {
        amountUnits = mediaAmountUnits(mediaRate, row.standard_schedule.decimal_places);
      } catch {
        setValidationError(uiT('Enter a valid non-negative unit price.'));
        return;
      }
      if (BigInt(amountUnits) > BigInt(row.standard_schedule.amount_units)) {
        setValidationError(uiT('Customer-specific prices cannot exceed the platform standard price.'));
        return;
      }
      schedule = { ...row.standard_schedule, amount_units: amountUnits };
      reason = 'Custom customer price';
    }

    await onSave({ schedule, validSeconds: validityPreset.seconds, reason });
  }

  return (
    <Dialog open onOpenChange={next => { if (!next && !busy) onClose(); }}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={event => {
          if (returnFocusTo?.isConnected) {
            event.preventDefault();
            returnFocusTo.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{promo ? uiT('Edit custom price', '编辑专属价格') : uiT('Set custom price', '设置专属价格')}</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-foreground">{row.model_alias}</span>
            {' · '}
            {uiT('Standard price')}: {formatScheduleCompact(row.standard_schedule, row.currency)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={event => void handleSubmit(event)} className="space-y-4">
          <fieldset className="inline-flex items-center gap-1 rounded-lg bg-muted/60 p-1 border-0" aria-label={uiT('Pricing input mode', '定价方式')}>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={mode === 'percent'}
              disabled={busy}
              onClick={() => { setMode('percent'); setValidationError(''); }}
            >
              {uiT('By discount %', '按折扣计算')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={mode === 'exact'}
              disabled={busy}
              onClick={() => { setMode('exact'); setValidationError(''); }}
            >
              {uiT('Exact price', '指定单价')}
            </Button>
          </fieldset>

          {mode === 'percent' ? (
            <div className="space-y-2.5">
              <Label htmlFor="cust-single-discount">{uiF('Discount percentage for {0}', [row.model_alias])}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="cust-single-discount"
                  inputMode="decimal"
                  className="w-28 tabular-nums"
                  value={discountInput}
                  disabled={busy}
                  onChange={event => { setDiscountInput(event.target.value); setValidationError(''); }}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_DISCOUNTS.map(preset => (
                  <Button
                    key={preset}
                    type="button"
                    size="xs"
                    variant={discountInput.trim() === String(preset) ? 'default' : 'outline'}
                    disabled={busy}
                    onClick={() => { setDiscountInput(String(preset)); setValidationError(''); }}
                  >
                    {isZh ? `${(preset / 10).toFixed(1).replace(/\.0$/, '')} 折` : `${preset}%`}
                  </Button>
                ))}
              </div>
              {previewSchedule && (
                <div className="rounded-lg bg-muted/55 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{uiT('Standard price')}</span>
                    <span className="tabular-nums text-muted-foreground">{formatScheduleCompact(row.standard_schedule, row.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{uiT('Customer price')} ({formatDiscountBadge(parsedPercent, isZh)})</span>
                    <strong className="tabular-nums text-foreground">{formatScheduleCompact(previewSchedule, row.currency)}</strong>
                  </div>
                </div>
              )}
            </div>
          ) : row.standard_schedule.kind === 'text' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-exact-input">{uiT('Input price')}</Label>
                <Input
                  id="cust-exact-input"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={inputRate}
                  disabled={busy}
                  onChange={event => { setInputRate(event.target.value); setValidationError(''); }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-exact-output">{uiT('Output price')}</Label>
                <Input
                  id="cust-exact-output"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={outputRate}
                  disabled={busy}
                  onChange={event => { setOutputRate(event.target.value); setValidationError(''); }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="cust-exact-media">{uiT('Unit price')}</Label>
              <Input
                id="cust-exact-media"
                inputMode="decimal"
                className="tabular-nums"
                value={mediaRate}
                disabled={busy}
                onChange={event => { setMediaRate(event.target.value); setValidationError(''); }}
              />
            </div>
          )}

          <ValiditySelector value={validityId} disabled={busy} onChange={setValidityId} />

          {(validationError || error) && (
            <Alert variant="destructive">
              <AlertDescription>{validationError || error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {uiT('Cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? uiT('Saving…') : uiT('Save price', '保存价格')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerBatchPriceDialog({
  targetCount,
  isSelection,
  busy,
  error,
  returnFocusTo,
  onClose,
  onApply,
}: {
  targetCount: number;
  isSelection: boolean;
  busy: boolean;
  error: string;
  returnFocusTo: HTMLElement | null;
  onClose: () => void;
  onApply: (payload: { percent: number; validSeconds: number }) => Promise<void>;
}) {
  const { locale, t: uiT, format: uiF } = useUILocale();
  const isZh = locale === 'zh-CN';
  const [discountInput, setDiscountInput] = useState('85');
  const [validityId, setValidityId] = useState<ValidityId>('5y');
  const [validationError, setValidationError] = useState('');
  const validityPreset = VALIDITY_PRESETS.find(item => item.id === validityId) ?? VALIDITY_PRESETS[2];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || targetCount === 0) return;
    const percent = parseCustomerDiscountInput(discountInput);
    if (percent === null) {
      setValidationError(uiT('Enter a discount between 1% and 99.9% (e.g. 85 for 15% off).'));
      return;
    }
    setValidationError('');
    await onApply({ percent, validSeconds: validityPreset.seconds });
  }

  return (
    <Dialog open onOpenChange={next => { if (!next && !busy) onClose(); }}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={event => {
          if (returnFocusTo?.isConnected) {
            event.preventDefault();
            returnFocusTo.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{uiT('Batch customer pricing', '批量设置专属价格')}</DialogTitle>
          <DialogDescription>
            {isSelection
              ? uiF('Apply one discount off standard prices to {0} selected models.', [targetCount])
              : uiF('Apply one discount off standard prices to all {0} models.', [targetCount])}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={event => void handleSubmit(event)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cust-batch-discount">{uiT('Batch discount percentage')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="cust-batch-discount"
                inputMode="decimal"
                className="w-28 tabular-nums"
                value={discountInput}
                disabled={busy}
                onChange={event => { setDiscountInput(event.target.value); setValidationError(''); }}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_DISCOUNTS.map(preset => (
                <Button
                  key={preset}
                  type="button"
                  size="xs"
                  variant={discountInput.trim() === String(preset) ? 'default' : 'outline'}
                  disabled={busy}
                  onClick={() => { setDiscountInput(String(preset)); setValidationError(''); }}
                >
                  {isZh ? `${(preset / 10).toFixed(1).replace(/\.0$/, '')} 折` : `${preset}%`}
                </Button>
              ))}
            </div>
          </div>

          <ValiditySelector value={validityId} disabled={busy} onChange={setValidityId} />

          {(validationError || error) && (
            <Alert variant="destructive">
              <AlertDescription>{validationError || error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {uiT('Cancel')}
            </Button>
            <Button type="submit" disabled={busy || targetCount === 0}>
              {busy
                ? uiT('Saving…')
                : isSelection
                  ? uiF('Apply to selected ({0})', [targetCount])
                  : uiF('Apply to all ({0})', [targetCount])}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
