import { useRef, useState, type FormEvent } from 'react';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { amountFromNanos } from '@/lib/money';
import {
  applyDiscountNanos,
  formatDiscountBadge,
  formatPer1MShort,
  parseDiscountPercent,
  parsePer1MAmountToNanos,
  type UpstreamStandardPrice,
} from './upstream-pricing';

const DISCOUNT_PRESETS = [100, 90, 80, 70, 50] as const;

export type SingleModelPricingSubmit = {
  standardInputNanos: string;
  standardOutputNanos: string;
  standardCachedInputNanos: string | null;
  discountPercent: number;
  purchaseInputNanos: string;
  purchaseOutputNanos: string;
  purchaseCachedInputNanos: string | null;
  updateCustomerPrice: boolean;
};

export function ModelDiscountDialog({
  open,
  inline = false,
  alias,
  upstreamModel,
  currency,
  upstreamHint,
  initialStandardInputNanos,
  initialStandardOutputNanos,
  initialStandardCachedNanos,
  initialDiscountPercent,
  hasExistingCustomerPrice,
  enabling,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  inline?: boolean;
  alias: string;
  upstreamModel?: string;
  currency: string;
  upstreamHint?: UpstreamStandardPrice | null;
  initialStandardInputNanos?: string | null;
  initialStandardOutputNanos?: string | null;
  initialStandardCachedNanos?: string | null;
  initialDiscountPercent?: number | null;
  hasExistingCustomerPrice: boolean;
  enabling: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (payload: SingleModelPricingSubmit) => Promise<void>;
}) {
  const { t: uiT, locale } = useUILocale();
  const isZh = locale === 'zh-CN';
  const openerRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);

  const [standardInput, setStandardInput] = useState(() =>
    initialStandardInputNanos ? amountFromNanos(initialStandardInputNanos) : '',
  );
  const [standardOutput, setStandardOutput] = useState(() =>
    initialStandardOutputNanos ? amountFromNanos(initialStandardOutputNanos) : '',
  );
  const [standardCached, setStandardCached] = useState(() =>
    initialStandardCachedNanos ? amountFromNanos(initialStandardCachedNanos) : '',
  );
  const [discountInput, setDiscountInput] = useState(() =>
    initialDiscountPercent != null && Math.abs(initialDiscountPercent - 100) >= 0.05
      ? String(initialDiscountPercent)
      : '100',
  );
  const [updateCustomerPrice, setUpdateCustomerPrice] = useState(!hasExistingCustomerPrice);
  const [validationError, setValidationError] = useState('');

  const inputNanos = parsePer1MAmountToNanos(standardInput);
  const outputNanos = parsePer1MAmountToNanos(standardOutput);
  const cachedNanos = standardCached.trim() ? parsePer1MAmountToNanos(standardCached) : null;
  const discountPercent = parseDiscountPercent(discountInput);

  const previewValid = inputNanos !== null && outputNanos !== null && discountPercent !== null && (standardCached.trim() === '' || cachedNanos !== null);
  const purchaseInput = inputNanos !== null && discountPercent !== null && previewValid ? applyDiscountNanos(inputNanos, discountPercent) : null;
  const purchaseOutput = outputNanos !== null && discountPercent !== null && previewValid ? applyDiscountNanos(outputNanos, discountPercent) : null;
  const purchaseCached = cachedNanos !== null && discountPercent !== null && previewValid ? applyDiscountNanos(cachedNanos, discountPercent) : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setValidationError('');
    if (!currency) {
      setValidationError(uiT('Configure the platform currency in Settings first.', '请先在平台设置中配置计费币种。'));
      return;
    }
    if (!inputNanos || !outputNanos) {
      setValidationError(uiT('Enter valid non-negative upstream standard input and output prices per 1M tokens.', '请填写有效的上游标准输入/输出价格（每百万 tokens）。'));
      return;
    }
    if (BigInt(inputNanos) === 0n && BigInt(outputNanos) === 0n) {
      setValidationError(uiT('Upstream standard price cannot be zero for both input and output.', '上游标准输入和输出价格不能同时为 0。'));
      return;
    }
    if (standardCached.trim() !== '' && cachedNanos === null) {
      setValidationError(uiT('Enter a valid cached input price or leave it blank.', '请填写有效的缓存读取价格，或留空。'));
      return;
    }
    if (discountPercent === null || !purchaseInput || !purchaseOutput) {
      setValidationError(uiT('Enter a discount percentage between 0.1 and 1000 (100 = no discount).', '请填写有效折扣百分比（例如 70 表示 7 折，100 或留空表示无折扣）。'));
      return;
    }
    await onSubmit({
      standardInputNanos: inputNanos,
      standardOutputNanos: outputNanos,
      standardCachedInputNanos: cachedNanos,
      discountPercent,
      purchaseInputNanos: purchaseInput,
      purchaseOutputNanos: purchaseOutput,
      purchaseCachedInputNanos: purchaseCached,
      updateCustomerPrice,
    });
  }

  if (!open) return null;

  const titleText = enabling
    ? uiT('Enable model & set discount', '启用模型并设置折扣')
    : uiT('Set discount & pricing', '设置模型折扣与价格');
  const subtitleNode = (
    <>
      <span className="font-mono text-foreground">{alias}</span>
      {upstreamModel && upstreamModel !== alias ? ` (${upstreamModel})` : ''}
    </>
  );

  const formContent = (
    <form onSubmit={event => void handleSubmit(event)} className="space-y-4">
          {upstreamHint && upstreamHint.currency !== currency && (
            <Alert>
              <AlertDescription className="text-xs">
                <p>
                  {uiT('Upstream published price is in', '上游公开标准价币种为')}{' '}
                  <strong>{upstreamHint.currency}</strong>:{' '}
                  <span className="tabular-nums font-medium">
                    {formatPer1MShort(upstreamHint.inputPer1MNanos, upstreamHint.currency)} /{' '}
                    {formatPer1MShort(upstreamHint.outputPer1MNanos, upstreamHint.currency)}
                  </span>{' '}
                  {uiT('per 1M tokens. Enter the equivalent price in', '每百万 tokens。请换算为平台币种')}{' '}
                  <strong>{currency}</strong>.
                </p>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {uiT('Upstream standard price per 1M tokens', '上游标准价（每百万 tokens）')} · {currency || '—'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="discount-std-input">{uiT('Input price', '输入单价')}</Label>
                <Input
                  id="discount-std-input"
                  inputMode="decimal"
                  required
                  disabled={busy}
                  placeholder="e.g. 2.00"
                  value={standardInput}
                  onChange={e => { setStandardInput(e.target.value); setValidationError(''); }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="discount-std-output">{uiT('Output price', '输出单价')}</Label>
                <Input
                  id="discount-std-output"
                  inputMode="decimal"
                  required
                  disabled={busy}
                  placeholder="e.g. 8.00"
                  value={standardOutput}
                  onChange={e => { setStandardOutput(e.target.value); setValidationError(''); }}
                />
              </div>
            </div>
            <details className="pt-1">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                {uiT('Optional: cached input price', '可选：缓存读取单价')}
              </summary>
              <div className="mt-2 space-y-1.5">
                <Label htmlFor="discount-std-cached">{uiT('Cache read price / 1M tokens', '缓存读取单价 / 百万 tokens')}</Label>
                <Input
                  id="discount-std-cached"
                  inputMode="decimal"
                  disabled={busy}
                  placeholder={uiT('Leave blank to match input price', '留空则按输入单价计算')}
                  value={standardCached}
                  onChange={e => { setStandardCached(e.target.value); setValidationError(''); }}
                />
              </div>
            </details>
          </div>

          <div className="space-y-2">
            <Label htmlFor="discount-percent">
              {uiT('Discount off upstream standard price (%)', '上游标准价折扣（%，留空或 100 = 无折扣）')}
            </Label>
            <Input
              id="discount-percent"
              inputMode="decimal"
              disabled={busy}
              placeholder="100"
              value={discountInput}
              onChange={e => { setDiscountInput(e.target.value); setValidationError(''); }}
            />
            <div className="flex flex-wrap gap-1.5">
              {DISCOUNT_PRESETS.map(preset => (
                <Button
                  key={preset}
                  type="button"
                  size="xs"
                  variant={discountPercent === preset ? 'default' : 'outline'}
                  disabled={busy}
                  onClick={() => { setDiscountInput(String(preset)); setValidationError(''); }}
                >
                  {formatDiscountBadge(preset, isZh)}
                </Button>
              ))}
            </div>
          </div>

          {previewValid && inputNanos && outputNanos && purchaseInput && purchaseOutput && (
            <div className="space-y-1.5 rounded-lg bg-muted/55 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {uiT('Your purchase cost', '你的采购成本')} ({formatDiscountBadge(discountPercent, isZh)})
                </span>
                <strong className="tabular-nums text-foreground">
                  {formatPer1MShort(purchaseInput, currency)} / {formatPer1MShort(purchaseOutput, currency)} {uiT('per 1M', '/ 1M')}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {updateCustomerPrice
                    ? uiT('Customer selling price (standard)', '客户售价（按标准价）')
                    : uiT('Customer selling price', '客户售价')}
                </span>
                <strong className="tabular-nums text-foreground">
                  {updateCustomerPrice
                    ? `${formatPer1MShort(inputNanos, currency)} / ${formatPer1MShort(outputNanos, currency)} ${uiT('per 1M', '/ 1M')}`
                    : uiT('Keep existing price in Pricing', '保持客户定价页现有售价')}
                </strong>
              </div>
            </div>
          )}

          {hasExistingCustomerPrice && (
            <Label htmlFor="update-customer-selling-price" className="flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox
                id="update-customer-selling-price"
                checked={updateCustomerPrice}
                disabled={busy}
                onCheckedChange={value => setUpdateCustomerPrice(value === true)}
              />
              <span>
                {uiT(
                  'Also update platform customer selling price to this upstream standard price',
                  '同时将平台客户售价更新为此上游标准价',
                )}
              </span>
            </Label>
          )}

          {(validationError || error) && (
            <Alert variant="destructive">
              <AlertDescription>{validationError || uiT(error)}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {uiT('Cancel')}
            </Button>
            <Button type="submit" disabled={busy || !currency}>
              {busy
                ? uiT('Saving…')
                : enabling
                  ? uiT('Save & enable', '保存并启用')
                  : uiT('Save & apply', '保存并生效')}
            </Button>
          </div>
        </form>
  );

  if (inline) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{titleText}</h3>
          <p className="text-sm text-muted-foreground">{subtitleNode}</p>
        </div>
        {formContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!next && !busy) onClose(); }}>
      <DialogContent
        className="sm:max-w-lg"
        onCloseAutoFocus={event => {
          if (openerRef.current?.isConnected) {
            event.preventDefault();
            openerRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
          <DialogDescription>{subtitleNode}</DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}

export function BatchDiscountDialog({
  open,
  inline = false,
  currency,
  eligibleCount,
  skippedCount,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  inline?: boolean;
  currency: string;
  eligibleCount: number;
  skippedCount: number;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (discountPercent: number) => Promise<void>;
}) {
  const { t: uiT, format: uiF, locale } = useUILocale();
  const isZh = locale === 'zh-CN';
  const [discountInput, setDiscountInput] = useState('100');
  const [validationError, setValidationError] = useState('');
  const discountPercent = parseDiscountPercent(discountInput);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || eligibleCount === 0) return;
    if (discountPercent === null) {
      setValidationError(uiT('Enter a discount percentage between 0.1 and 1000.', '请填写有效折扣百分比（例如 70 表示 7 折）。'));
      return;
    }
    setValidationError('');
    await onSubmit(discountPercent);
  }

  if (!open) return null;

  const batchForm = (
        <form onSubmit={event => void handleSubmit(event)} className="space-y-4">
          {skippedCount > 0 && (
            <Alert>
              <AlertDescription className="text-xs">
                {uiF('{0} selected models have no standard price in {1} yet and will be skipped. Configure them individually.', [skippedCount, currency || '—'])}
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="batch-discount-percent">
              {uiT('Discount (%)', '折扣（%，100 = 无折扣）')}
            </Label>
            <Input
              id="batch-discount-percent"
              inputMode="decimal"
              disabled={busy}
              value={discountInput}
              onChange={e => { setDiscountInput(e.target.value); setValidationError(''); }}
            />
            <div className="flex flex-wrap gap-1.5">
              {DISCOUNT_PRESETS.map(preset => (
                <Button
                  key={preset}
                  type="button"
                  size="xs"
                  variant={discountPercent === preset ? 'default' : 'outline'}
                  disabled={busy}
                  onClick={() => { setDiscountInput(String(preset)); setValidationError(''); }}
                >
                  {formatDiscountBadge(preset, isZh)}
                </Button>
              ))}
            </div>
          </div>
          {(validationError || error) && (
            <Alert variant="destructive">
              <AlertDescription>{validationError || uiT(error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {uiT('Cancel')}
            </Button>
            <Button type="submit" disabled={busy || eligibleCount === 0}>
              {busy
                ? uiT('Applying…', '应用中…')
                : uiF('Apply to {0} models', [eligibleCount])}
            </Button>
          </div>
        </form>
  );

  if (inline) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{uiT('Set discount in bulk', '批量设置折扣')}</h3>
          <p className="text-sm text-muted-foreground">
            {uiF('Apply one discount percentage off upstream standard prices to {0} selected models and activate them immediately.', [eligibleCount])}
          </p>
        </div>
        {batchForm}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!next && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{uiT('Set discount in bulk', '批量设置折扣')}</DialogTitle>
          <DialogDescription>
            {uiF('Apply one discount percentage off upstream standard prices to {0} selected models and activate them immediately.', [eligibleCount])}
          </DialogDescription>
        </DialogHeader>
        {batchForm}
      </DialogContent>
    </Dialog>
  );
}
