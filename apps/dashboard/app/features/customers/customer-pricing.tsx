import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { IconCurrencyDollar, IconPercentage, IconRefresh, IconRotate, IconSearch } from '@tabler/icons-react';
import type { RetailSchedule } from '@niu-io/sdk/admin';
import ProviderLogo from '@/components/ProviderLogo';
import { TableSkeleton } from '@/components/PageSkeletons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDiscountBadge } from '@/features/provider-business/upstream-pricing';
import { modelIdentity } from '@/lib/providers';
import { translateUI, useLocale as useUILocale } from '@/shell/ui-locale';
import { CustomerBatchPriceDialog, CustomerModelPriceDialog } from './customer-pricing-dialogs';
import {
  discountRetailSchedule,
  formatEpochDate,
  formatScheduleCompact,
  inferCustomerDiscountPercent,
  loadCustomerPricingRows,
  resetCustomerModelDiscount,
  setCustomerPricingBatch,
  type CustomerModelPriceRow,
} from './customer-pricing-model';

export { discountRetailSchedule, inferCustomerDiscountPercent, parseCustomerDiscountInput } from './customer-pricing-model';

export function CustomerPricingPanel({
  token,
  organizationId,
  showRefresh = true,
  onBusyChange,
  onChanged,
  onNavigateAway,
}: {
  token: string;
  organizationId: string;
  showRefresh?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onChanged?: () => void;
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
  const [busy, setBusyState] = useState(false);

  const [editingRow, setEditingRow] = useState<CustomerModelPriceRow | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

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

  const batchTargets = useMemo(
    () => (selectedIds.size > 0 ? visibleRows.filter(row => selectedIds.has(row.price_id)) : visibleRows),
    [selectedIds, visibleRows],
  );
  const selectedDiscountedTargets = useMemo(
    () => visibleRows.filter(row => selectedIds.has(row.price_id) && row.active_promotion !== null),
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

  async function applyBatch({ percent, validSeconds }: { percent: number; validSeconds: number }) {
    if (!batchTargets.length) return;
    setBusy(true);
    setDialogError('');
    setError('');
    setNotice('');
    try {
      await setCustomerPricingBatch(
        token,
        organizationId,
        batchTargets.map(row => ({
          price_id: row.price_id,
          schedule: discountRetailSchedule(row.standard_schedule, percent),
          valid_seconds: validSeconds,
          reason: `Customer price (${percent}% of standard)`,
        })),
      );
      setBatchOpen(false);
      setSelectedIds(new Set());
      setNotice(uiF('Applied {0} to {1} models.', [formatDiscountBadge(percent, isZh), batchTargets.length]));
      await load();
      onChanged?.();
    } catch (failure) {
      setDialogError(failure instanceof Error ? failure.message : uiT('Could not save customer pricing.'));
    } finally {
      setBusy(false);
    }
  }

  async function resetSelectedToStandard() {
    if (!selectedDiscountedTargets.length) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await setCustomerPricingBatch(
        token,
        organizationId,
        selectedDiscountedTargets.map(row => ({
          price_id: row.price_id,
          schedule: null,
          reason: 'Reset to platform standard price',
        })),
      );
      setSelectedIds(new Set());
      setNotice(uiF('Reset {0} models to platform standard pricing.', [selectedDiscountedTargets.length]));
      await load();
      onChanged?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : uiT('Could not reset customer pricing.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveSingleRow(
    row: CustomerModelPriceRow,
    { schedule, validSeconds, reason }: { schedule: RetailSchedule; validSeconds: number; reason: string },
  ) {
    setBusy(true);
    setDialogError('');
    setError('');
    setNotice('');
    try {
      await setCustomerPricingBatch(token, organizationId, [
        { price_id: row.price_id, schedule, valid_seconds: validSeconds, reason },
      ]);
      setEditingRow(null);
      setNotice(uiF('Saved customer pricing for {0}.', [row.model_alias]));
      await load();
      onChanged?.();
    } catch (failure) {
      setDialogError(failure instanceof Error ? failure.message : uiT('Could not save customer pricing.'));
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
      setNotice(uiF('Reset {0} to platform standard pricing.', [row.model_alias]));
      await load();
      onChanged?.();
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
            <Button type="button" variant="outline" size="sm" disabled={busy || loading} onClick={() => void load()}>
              {uiT('Retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {loading && !rows.length ? (
        <TableSkeleton columns={5} rows={4} label={uiT('Loading customer pricing…')} />
      ) : !rows.length ? (
        <Empty className="min-h-40">
          <EmptyHeader>
            <EmptyMedia variant="icon"><IconCurrencyDollar size={20} aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>{uiT('No standard prices yet')}</EmptyTitle>
            <EmptyDescription>
              {uiT(
                'Enable models in Providers or publish standard prices first before setting customer-specific discounts.',
                '请先在模型供应商中启用模型或在标准售价中发布价格，再为客户设置专属价格。',
              )}
            </EmptyDescription>
          </EmptyHeader>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" onClick={onNavigateAway}>
              <Link to="/admin/providers">{uiT('Open Providers', '前往模型供应商')}</Link>
            </Button>
            <Button asChild variant="outline" size="sm" onClick={onNavigateAway}>
              <Link to="/admin/pricing">{uiT('Open Standard pricing', '前往标准售价')}</Link>
            </Button>
          </div>
        </Empty>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative w-full min-w-0 sm:max-w-xs">
              <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                className="pl-9"
                aria-label={uiT('Filter models')}
                placeholder={uiT('Filter by model…')}
                value={filter}
                onChange={event => setFilter(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedIds.size > 0 ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || !batchTargets.length}
                    onClick={event => {
                      openerRef.current = event.currentTarget;
                      setDialogError('');
                      setBatchOpen(true);
                    }}
                  >
                    <IconPercentage size={14} aria-hidden="true" />
                    <span>{uiF('Set price ({0})', [batchTargets.length])}</span>
                  </Button>
                  {selectedDiscountedTargets.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void resetSelectedToStandard()}
                    >
                      <IconRotate size={14} aria-hidden="true" />
                      <span>{uiT('Reset to standard', '恢复标准价')}</span>
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !visibleRows.length}
                  onClick={event => {
                    openerRef.current = event.currentTarget;
                    setDialogError('');
                    setBatchOpen(true);
                  }}
                >
                  <IconPercentage size={14} aria-hidden="true" />
                  <span>{uiT('Batch pricing', '批量设价')}</span>
                </Button>
              )}

              {showRefresh && (
                <Button type="button" variant="outline" size="sm" disabled={loading || busy} onClick={() => void load()}>
                  <IconRefresh size={14} aria-hidden="true" />
                  <span>{uiT('Refresh')}</span>
                </Button>
              )}
            </div>
          </div>

          <Table aria-label={uiT('Customer model pricing')}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label={uiT('Select all models', '全选模型')}
                    checked={allVisibleSelected}
                    disabled={busy || !visibleRows.length}
                    onCheckedChange={checked => toggleAllVisible(checked === true)}
                  />
                </TableHead>
                <TableHead>{uiT('Model')}</TableHead>
                <TableHead className="hidden sm:table-cell">{uiT('Standard price')}</TableHead>
                <TableHead>{uiT('Customer price')}</TableHead>
                <TableHead className="text-right">{uiT('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map(row => {
                const promo = row.active_promotion;
                const inferredPercent = promo ? inferCustomerDiscountPercent(row.standard_schedule, promo.schedule) : null;
                return (
                  <TableRow key={row.price_id}>
                    <TableCell>
                      <Checkbox
                        aria-label={uiF('Select {0}', [row.model_alias])}
                        checked={selectedIds.has(row.price_id)}
                        disabled={busy}
                        onCheckedChange={checked => toggleOne(row.price_id, checked === true)}
                      />
                    </TableCell>
                    <TableCell className="whitespace-normal sm:min-w-44">
                      <p className="inline-flex items-center gap-2 font-medium break-words">
                        <ProviderLogo provider={modelIdentity({ id: row.model_alias })} size="small" />
                        <span>{row.model_alias}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.currency}
                        {row.standard_schedule.kind === 'media' ? ` · ${uiT('Media', '媒体')}` : ` · ${uiT('per 1M tokens')}`}
                      </p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell whitespace-nowrap tabular-nums text-sm text-muted-foreground">
                      {formatScheduleCompact(row.standard_schedule, row.currency)}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {promo ? (
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
                      <div className="inline-flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={event => {
                            openerRef.current = event.currentTarget;
                            setDialogError('');
                            setEditingRow(row);
                          }}
                        >
                          {promo ? uiT('Edit') : uiT('Set price', '设置价格')}
                        </Button>
                        {promo && (
                          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void resetSingleRow(row)}>
                            {uiT('Reset', '恢复')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {editingRow && (
        <CustomerModelPriceDialog
          key={editingRow.price_id}
          row={editingRow}
          busy={busy}
          error={dialogError}
          returnFocusTo={openerRef.current}
          onClose={() => setEditingRow(null)}
          onSave={payload => saveSingleRow(editingRow, payload)}
        />
      )}

      {batchOpen && (
        <CustomerBatchPriceDialog
          targetCount={batchTargets.length}
          isSelection={selectedIds.size > 0}
          busy={busy}
          error={dialogError}
          returnFocusTo={openerRef.current}
          onClose={() => setBatchOpen(false)}
          onApply={applyBatch}
        />
      )}
    </div>
  );
}
