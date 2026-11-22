import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { IconCheck, IconChevronDown, IconCurrencyDollar, IconRefresh, IconRotate, IconSearch, IconTag } from '@tabler/icons-react';
import type { RetailSchedule } from '@niu-io/sdk/admin';
import ProviderLogo from '@/components/ProviderLogo';
import { TableSkeleton } from '@/components/PageSkeletons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDiscountBadge } from '@/features/provider-business/upstream-pricing';
import { modelIdentity } from '@/lib/providers';
import { amountFromNanos, amountToNanos } from '@/lib/money';
import { mediaAmount, mediaAmountUnits } from '@/lib/media-price';
import { translateUI, useLocale as useUILocale } from '@/shell/ui-locale';
import {
  discountRetailSchedule,
  formatEpochDate,
  formatScheduleCompact,
  inferCustomerDiscountPercent,
  loadCustomerPricingRows,
  parseCustomerDiscountInput,
  PRESET_DISCOUNTS,
  resetCustomerModelDiscount,
  setCustomerPricingBatch,
  VALIDITY_PRESETS,
  type CustomerModelPriceRow,
  type ValidityId,
} from './customer-pricing-model';

export { discountRetailSchedule, inferCustomerDiscountPercent, parseCustomerDiscountInput } from './customer-pricing-model';

export function CustomerPricingPanel({
  token,
  organizationId,
  showRefresh = true,
  onBusyChange,
  onNavigateAway,
}: {
  token: string;
  organizationId: string;
  showRefresh?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onNavigateAway?: () => void;
}) {
  const { locale, t: uiT, format: uiF } = useUILocale();
  const isZh = locale === 'zh-CN';
  const [rows, setRows] = useState<CustomerModelPriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [batchDiscount, setBatchDiscount] = useState('85');
  const [validityId, setValidityId] = useState<ValidityId>('5y');
  const [busy, setBusyState] = useState(false);

  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [rowDiscountInput, setRowDiscountInput] = useState('85');
  const [rowInputRate, setRowInputRate] = useState('');
  const [rowOutputRate, setRowOutputRate] = useState('');
  const [rowMediaAmount, setRowMediaAmount] = useState('');
  const [rowEditMode, setRowEditMode] = useState<'percent' | 'exact'>('percent');
  const [rowError, setRowError] = useState('');

  const abortRef = useRef<AbortController | null>(null);

  const setBusy = useCallback(
    (next: boolean) => {
      setBusyState(next);
      onBusyChange?.(next);
    },
    [onBusyChange],
  );

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const loaded = await loadCustomerPricingRows(token, organizationId, controller.signal);
      if (controller.signal.aborted) return;
      setRows(loaded);
      setSelectedIds(prev => {
        const next = new Set<string>();
        for (const row of loaded) {
          if (prev.has(row.price_id)) next.add(row.price_id);
        }
        return next;
      });
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : translateUI('Could not load customer pricing.'));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [organizationId, token]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const visibleRows = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(row => row.model_alias.toLowerCase().includes(query));
  }, [filter, rows]);

  const discountedCount = useMemo(() => rows.filter(row => row.active_promotion !== null).length, [rows]);
  const validityPreset = VALIDITY_PRESETS.find(item => item.id === validityId) ?? VALIDITY_PRESETS[2];
  const batchTargets = useMemo(
    () => (selectedIds.size > 0 ? visibleRows.filter(row => selectedIds.has(row.price_id)) : visibleRows),
    [selectedIds, visibleRows],
  );
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every(row => selectedIds.has(row.price_id));

  function toggleAllVisible(checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const row of visibleRows) {
        if (checked) next.add(row.price_id);
        else next.delete(row.price_id);
      }
      return next;
    });
  }

  function toggleOne(priceId: string, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(priceId);
      else next.delete(priceId);
      return next;
    });
  }

  function openRowEditor(row: CustomerModelPriceRow) {
    setEditingPriceId(row.price_id);
    setRowError('');
    setRowEditMode('percent');
    const currentPercent = row.active_promotion ? inferCustomerDiscountPercent(row.standard_schedule, row.active_promotion.schedule) : null;
    const defaultPercent = currentPercent !== null && currentPercent > 0 && currentPercent < 100
      ? Number.isInteger(currentPercent) ? String(currentPercent) : currentPercent.toFixed(1).replace(/\.0$/, '')
      : '85';
    setRowDiscountInput(defaultPercent);
    const activeSchedule = row.active_promotion?.schedule ?? row.standard_schedule;
    if (activeSchedule.kind === 'text') {
      setRowInputRate(amountFromNanos(activeSchedule.prompt_rate));
      setRowOutputRate(amountFromNanos(activeSchedule.completion_rate));
      setRowMediaAmount('');
    } else {
      setRowMediaAmount(mediaAmount(activeSchedule.amount_units, activeSchedule.decimal_places));
      setRowInputRate('');
      setRowOutputRate('');
    }
  }

  async function applyBatchDiscount() {
    const percent = parseCustomerDiscountInput(batchDiscount);
    if (percent === null) {
      setError(uiT('Enter a discount between 1% and 99.9% (e.g. 85 for 15% off).'));
      return;
    }
    if (!batchTargets.length) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await setCustomerPricingBatch(
        token,
        organizationId,
        batchTargets.map(row => ({
          price_id: row.price_id,
          schedule: discountRetailSchedule(row.standard_schedule, percent),
          valid_seconds: validityPreset.seconds,
          reason: `Customer price (${percent}% of standard)`,
        })),
      );
      setEditingPriceId(null);
      setSelectedIds(new Set());
      setNotice(uiF('Applied {0} to {1} models.', [formatDiscountBadge(percent, isZh), batchTargets.length]));
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : uiT('Could not save customer pricing.'));
    } finally {
      setBusy(false);
    }
  }

  async function resetBatchToStandard() {
    const targets = batchTargets.filter(row => row.active_promotion !== null);
    if (!targets.length) {
      setNotice(uiT('Selected models are already using the platform standard price.'));
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await setCustomerPricingBatch(
        token,
        organizationId,
        targets.map(row => ({
          price_id: row.price_id,
          schedule: null,
          reason: 'Reset to platform standard price',
        })),
      );
      setEditingPriceId(null);
      setSelectedIds(new Set());
      setNotice(uiF('Reset {0} models to platform standard pricing.', [targets.length]));
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : uiT('Could not reset customer pricing.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveSingleRow(row: CustomerModelPriceRow) {
    setRowError('');
    let schedule: RetailSchedule;
    let reason: string;
    if (rowEditMode === 'percent') {
      const percent = parseCustomerDiscountInput(rowDiscountInput);
      if (percent === null) {
        setRowError(uiT('Enter a discount between 1% and 99.9% (e.g. 85 for 15% off).'));
        return;
      }
      schedule = discountRetailSchedule(row.standard_schedule, percent);
      reason = `Customer price (${percent}% of standard)`;
    } else if (row.standard_schedule.kind === 'text') {
      let promptNanos: string;
      let completionNanos: string;
      try {
        promptNanos = amountToNanos(rowInputRate, true);
        completionNanos = amountToNanos(rowOutputRate, true);
      } catch {
        setRowError(uiT('Enter valid non-negative input and output prices per 1M tokens.'));
        return;
      }
      if (BigInt(promptNanos) > BigInt(row.standard_schedule.prompt_rate) || BigInt(completionNanos) > BigInt(row.standard_schedule.completion_rate)) {
        setRowError(uiT('Customer-specific prices cannot exceed the platform standard price.'));
        return;
      }
      const inferred = inferCustomerDiscountPercent(row.standard_schedule, { ...row.standard_schedule, prompt_rate: promptNanos, completion_rate: completionNanos });
      const baseScale = inferred !== null && inferred > 0 && inferred < 100 ? inferred : 100;
      const scaled = discountRetailSchedule(row.standard_schedule, baseScale);
      schedule = scaled.kind === 'text' ? { ...scaled, prompt_rate: promptNanos, completion_rate: completionNanos } : row.standard_schedule;
      reason = 'Custom customer price';
    } else {
      let amountUnits: string;
      try {
        amountUnits = mediaAmountUnits(rowMediaAmount, row.standard_schedule.decimal_places);
      } catch {
        setRowError(uiT('Enter a valid non-negative unit price.'));
        return;
      }
      if (BigInt(amountUnits) > BigInt(row.standard_schedule.amount_units)) {
        setRowError(uiT('Customer-specific prices cannot exceed the platform standard price.'));
        return;
      }
      schedule = { ...row.standard_schedule, amount_units: amountUnits };
      reason = 'Custom customer price';
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      await setCustomerPricingBatch(token, organizationId, [
        { price_id: row.price_id, schedule, valid_seconds: validityPreset.seconds, reason },
      ]);
      setEditingPriceId(null);
      setNotice(uiF('Saved customer pricing for {0}.', [row.model_alias]));
      await load();
    } catch (failure) {
      setRowError(failure instanceof Error ? failure.message : uiT('Could not save customer pricing.'));
    } finally {
      setBusy(false);
    }
  }

  async function resetSingleRow(row: CustomerModelPriceRow) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await resetCustomerModelDiscount(token, organizationId, row.price_id);
      if (editingPriceId === row.price_id) setEditingPriceId(null);
      setNotice(uiF('Reset {0} to platform standard pricing.', [row.model_alias]));
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : uiT('Could not reset customer pricing.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {notice && <p role="status" className="text-sm text-foreground">{notice}</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" disabled={busy || loading} onClick={() => void load()}>{uiT('Retry')}</Button>
          </AlertDescription>
        </Alert>
      )}

      {loading && !rows.length ? (
        <TableSkeleton columns={4} rows={4} label={uiT('Loading customer pricing…')} />
      ) : !rows.length ? (
        <Empty className="min-h-40">
          <EmptyHeader>
            <EmptyMedia variant="icon"><IconCurrencyDollar size={20} aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>{uiT('No standard prices yet')}</EmptyTitle>
            <EmptyDescription>{uiT('Enable models in Providers or publish standard prices first before setting customer-specific discounts.', '请先在模型供应商中启用模型或在标准售价中发布价格，再为客户设置专属折扣。')}</EmptyDescription>
          </EmptyHeader>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" onClick={onNavigateAway}><Link to="/admin/providers">{uiT('Open Providers', '前往模型供应商')}</Link></Button>
            <Button asChild variant="outline" size="sm" onClick={onNavigateAway}><Link to="/admin/pricing">{uiT('Open Standard pricing', '前往标准售价')}</Link></Button>
          </div>
        </Empty>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-muted/45 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {selectedIds.size > 0
                  ? uiF('Batch discount · {0} selected', [selectedIds.size])
                  : uiF('Batch discount · {0} of {1} models discounted', [discountedCount, rows.length])}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{uiT('Valid for', '有效期')}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" disabled={busy} aria-label={uiT('Discount validity period')}>
                      <span>{isZh ? validityPreset.labelZh : validityPreset.labelEn}</span>
                      <IconChevronDown size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuRadioGroup value={validityId} onValueChange={v => setValidityId(v as ValidityId)}>
                      {VALIDITY_PRESETS.map(preset => (
                        <DropdownMenuRadioItem key={preset.id} value={preset.id}>{isZh ? preset.labelZh : preset.labelEn}</DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {PRESET_DISCOUNTS.map(preset => (
                  <Button key={preset} type="button" size="sm" variant={batchDiscount.trim() === String(preset) ? 'default' : 'outline'} disabled={busy} onClick={() => setBatchDiscount(String(preset))}>
                    {isZh ? `${(preset / 10).toFixed(1).replace(/\.0$/, '')} 折` : `${preset}%`}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Input aria-label={uiT('Batch discount percentage')} inputMode="decimal" className="h-8 w-20 text-sm tabular-nums" value={batchDiscount} disabled={busy} onChange={event => setBatchDiscount(event.target.value)} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                <Button type="button" size="sm" disabled={busy || !batchTargets.length} onClick={() => void applyBatchDiscount()}>
                  <IconCheck size={14} aria-hidden="true" />
                  <span>{selectedIds.size > 0 ? uiF('Apply to selected ({0})', [batchTargets.length]) : uiF('Apply to all ({0})', [batchTargets.length])}</span>
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={busy || !batchTargets.some(r => r.active_promotion !== null)} onClick={() => void resetBatchToStandard()}>
                  <IconRotate size={14} aria-hidden="true" />
                  <span>{uiT('Reset to standard', '恢复标准价')}</span>
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative w-full min-w-0 sm:max-w-xs">
              <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input type="search" className="pl-9" aria-label={uiT('Filter models')} placeholder={uiT('Filter by model…')} value={filter} onChange={event => setFilter(event.target.value)} />
            </div>
            {showRefresh && (
              <Button type="button" variant="outline" size="sm" disabled={loading || busy} onClick={() => void load()}>
                <IconRefresh size={14} aria-hidden="true" />
                <span>{uiT('Refresh')}</span>
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <Table aria-label={uiT('Customer model pricing')}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox aria-label={uiT('Select all models', '全选模型')} checked={allVisibleSelected} disabled={busy || !visibleRows.length} onCheckedChange={checked => toggleAllVisible(checked === true)} /></TableHead>
                  <TableHead>{uiT('Model')}</TableHead>
                  <TableHead>{uiT('Standard price')}</TableHead>
                  <TableHead>{uiT('Customer price')}</TableHead>
                  <TableHead className="text-right">{uiT('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map(row => {
                  const isEditing = editingPriceId === row.price_id;
                  const promo = row.active_promotion;
                  const inferredPercent = promo ? inferCustomerDiscountPercent(row.standard_schedule, promo.schedule) : null;
                  return (
                    <TableRow key={row.price_id} className="align-top">
                      <TableCell className="pt-3"><Checkbox aria-label={uiF('Select {0}', [row.model_alias])} checked={selectedIds.has(row.price_id)} disabled={busy} onCheckedChange={checked => toggleOne(row.price_id, checked === true)} /></TableCell>
                      <TableCell className="whitespace-normal min-w-40">
                        <p className="inline-flex items-center gap-2 font-medium break-words">
                          <ProviderLogo provider={modelIdentity({ id: row.model_alias })} size="small" />
                          <span>{row.model_alias}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{row.currency}{row.standard_schedule.kind === 'media' ? ` · ${uiT('Media', '媒体')}` : ` · ${uiT('per 1M tokens')}`}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-sm text-muted-foreground">{formatScheduleCompact(row.standard_schedule, row.currency)}</TableCell>
                      <TableCell className="whitespace-normal min-w-48">
                        {isEditing ? (
                          <div className="space-y-2.5 rounded-lg bg-muted/45 p-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Button type="button" size="sm" variant={rowEditMode === 'percent' ? 'secondary' : 'ghost'} onClick={() => { setRowEditMode('percent'); setRowError(''); }}>{uiT('By discount %', '按折扣')}</Button>
                              <Button type="button" size="sm" variant={rowEditMode === 'exact' ? 'secondary' : 'ghost'} onClick={() => { setRowEditMode('exact'); setRowError(''); }}>{uiT('Exact price', '指定单价')}</Button>
                            </div>
                            {rowEditMode === 'percent' ? (
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-1">
                                  {PRESET_DISCOUNTS.map(preset => (
                                    <Button key={preset} type="button" size="sm" variant={rowDiscountInput.trim() === String(preset) ? 'default' : 'outline'} disabled={busy} onClick={() => setRowDiscountInput(String(preset))}>
                                      {isZh ? `${(preset / 10).toFixed(1).replace(/\.0$/, '')} 折` : `${preset}%`}
                                    </Button>
                                  ))}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Input aria-label={uiF('Discount percentage for {0}', [row.model_alias])} inputMode="decimal" className="h-8 w-20 text-sm tabular-nums" value={rowDiscountInput} disabled={busy} onChange={event => { setRowDiscountInput(event.target.value); setRowError(''); }} />
                                  <span className="text-xs text-muted-foreground">%</span>
                                  {(() => {
                                    const parsed = parseCustomerDiscountInput(rowDiscountInput);
                                    if (parsed === null) return null;
                                    return <span className="text-xs font-medium tabular-nums text-foreground">→ {formatScheduleCompact(discountRetailSchedule(row.standard_schedule, parsed), row.currency)}</span>;
                                  })()}
                                </div>
                              </div>
                            ) : row.standard_schedule.kind === 'text' ? (
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1"><Label htmlFor={`cust-in-${row.price_id}`} className="text-xs">{uiT('Input price')}</Label><Input id={`cust-in-${row.price_id}`} inputMode="decimal" className="h-8 text-sm tabular-nums" value={rowInputRate} disabled={busy} onChange={event => { setRowInputRate(event.target.value); setRowError(''); }} /></div>
                                <div className="space-y-1"><Label htmlFor={`cust-out-${row.price_id}`} className="text-xs">{uiT('Output price')}</Label><Input id={`cust-out-${row.price_id}`} inputMode="decimal" className="h-8 text-sm tabular-nums" value={rowOutputRate} disabled={busy} onChange={event => { setRowOutputRate(event.target.value); setRowError(''); }} /></div>
                              </div>
                            ) : (
                              <div className="space-y-1"><Label htmlFor={`cust-media-${row.price_id}`} className="text-xs">{uiT('Unit price')}</Label><Input id={`cust-media-${row.price_id}`} inputMode="decimal" className="h-8 text-sm tabular-nums" value={rowMediaAmount} disabled={busy} onChange={event => { setRowMediaAmount(event.target.value); setRowError(''); }} /></div>
                            )}
                            {rowError && <p role="alert" className="text-xs text-destructive">{rowError}</p>}
                            <div className="flex items-center gap-1.5">
                              <Button type="button" size="sm" disabled={busy} onClick={() => void saveSingleRow(row)}>{busy ? uiT('Saving…') : uiT('Save')}</Button>
                              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditingPriceId(null)}>{uiT('Cancel')}</Button>
                            </div>
                          </div>
                        ) : promo ? (
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="secondary">{formatDiscountBadge(inferredPercent, isZh)}</Badge>
                              <span className="text-sm font-medium tabular-nums">{formatScheduleCompact(promo.schedule, row.currency)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{uiF('Until {0}', [formatEpochDate(promo.eligibility_until)])}</p>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">{uiT('Standard price', '按标准价')}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {!isEditing && (
                          <div className="inline-flex items-center gap-1">
                            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => openRowEditor(row)}>{promo ? uiT('Edit') : uiT('Set discount')}</Button>
                            {promo && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void resetSingleRow(row)}>{uiT('Reset', '恢复')}</Button>}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

export function CustomerPricingDialog({
  token,
  organizationId,
  organizationName,
  returnFocusTo,
  onClose,
}: {
  token: string;
  organizationId: string;
  organizationName: string;
  returnFocusTo?: HTMLElement | null;
  onClose: () => void;
}) {
  const { t: uiT } = useUILocale();
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <DialogContent
        className="w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90dvh] overflow-y-auto"
        onCloseAutoFocus={event => {
          if (returnFocusTo?.isConnected) {
            event.preventDefault();
            returnFocusTo.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconTag size={18} aria-hidden="true" />
            <span>{uiT('Customer pricing', '专属折扣')}</span>
            <Badge variant="secondary" className="font-normal">{organizationName}</Badge>
          </DialogTitle>
          <DialogDescription>
            {uiT('Set customer-specific discounts off platform standard prices. Undiscounted models automatically use the platform standard price.', '基于平台标准售价为该客户设置专属折扣；未单独设置的模型自动按平台标准售价计费。')}
          </DialogDescription>
        </DialogHeader>

        <CustomerPricingPanel token={token} organizationId={organizationId} onBusyChange={setBusy} onNavigateAway={onClose} />

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{uiT('Close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
