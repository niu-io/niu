import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { translateUI } from '@/shell/ui-locale';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import LegacyMediaContracts from './legacy-media';
import { PriceComparison, supplyStateOf, type PricingHealth } from './pricing-health';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { IconChevronDown, IconCurrencyDollar, IconSearch, IconDots, IconRefresh } from '@tabler/icons-react';
import { ListRowsSkeleton, TableSkeleton } from '@/components/PageSkeletons';
import { fetchQuery, invalidateQueries, peekQuery } from '@/lib/query-cache';
import { useDashboardContext } from '@/shell/dashboard-context';
import { usePlatformCurrency, type BillingMode } from '@/shell/platform-currency';
import PageHeader from '@/components/PageHeader';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity } from '@/lib/providers';
import { money } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { request } from '@/features/providers/api';
import { TextStandardEditor } from './text-editor';
import { MediaStandardEditor } from './media-editor';
import { PromotionEditor } from './promotion-editor';
import { ScheduleRevision, SellingSchedule } from './schedule';
import { PromotionsManager } from './promotions';
import { BrandedUnitTariffsSection } from './unit-tariffs';
import type { RetailPriceRecord, RetailPriceHistory } from '@niu-io/sdk/admin';

const base = '/api/v1/admin/pricing/standard-prices';
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(readUILocale()) : translateUI('Date unavailable');
const seconds = (value: string) => /^\d+$/.test(value) ? date(new Date(Number(value) * 1000).toISOString()) : translateUI('Date unavailable');
export default function RetailPricingRoute() {
  const { token, refreshModels } = useDashboardContext();
  return <Standards key={token} token={token} refreshModels={refreshModels} />;
}
function Standards({ token, refreshModels }: { token: string; refreshModels: () => Promise<void> }) {
  const { t: uiT, format: uiF } = useUILocale();
  const { billingMode, currency, unit } = usePlatformCurrency();
  const [search, setSearch] = useSearchParams();
  const tabParam = search.get('tab');
  const [viewMode, setViewMode] = useState<BillingMode | null>(
    tabParam === 'credits' || tabParam === 'currency' ? tabParam : null,
  );
  const activeMode: BillingMode = billingMode ?? 'currency';
  const showModeTabs = activeMode === 'credits' || Boolean(unit) || tabParam === 'credits';
  const mode: BillingMode = tabParam === 'credits' || tabParam === 'currency'
    ? tabParam
    : viewMode ?? activeMode;
  const modeLabel = mode === 'credits' ? uiT("Branded Credits") : uiT("Settlement Currency");
  const scope = token || 'public';
  const firstPagePath = base + '?limit=50';
  const initialPage = peekQuery<{ data: (RetailPriceRecord & { pricing_health?: PricingHealth })[]; next_after: string | null }>(scope, firstPagePath);
  const [rows, setRows] = useState<(RetailPriceRecord & { pricing_health?: PricingHealth })[]>(() => Array.isArray(initialPage?.data) ? initialPage.data : []);
  const [cursor, setCursor] = useState<string | null>(() => initialPage?.next_after ?? null);
  const [loading, setLoading] = useState(() => !initialPage), [error, setError] = useState(''), [filter, setFilter] = useState('');
  const priceSearch = useRef<HTMLInputElement>(null);
  const [supplyFilter, setSupplyFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [failed, setFailed] = useState<string>(), [selected, setSelected] = useState<RetailPriceRecord | null>(null);
  const [editor, setEditor] = useState<{ kind: 'text' | 'media'; previous: RetailPriceRecord | null; initialModel?: string } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const dialogOpener = useRef<HTMLButtonElement | null>(null);
  const publishButton = useRef<HTMLButtonElement>(null);
  function restorePricingFocus(event: Event) {
    const target = dialogOpener.current?.isConnected ? dialogOpener.current : publishButton.current;
    if (target && !target.disabled) {
      event.preventDefault();
      target.focus();
    }
  }
  const legacyOpener = useRef<HTMLButtonElement>(null);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [promotion, setPromotion] = useState<RetailPriceRecord | null>(null);
  const [managed, setManaged] = useState<RetailPriceRecord | null>(null);
  const active = useRef<AbortController | null>(null);
  async function load(after?: string, force = false) {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setLoading(true); setError(''); setFailed(undefined);
    try {
      const path = base + '?limit=50' + (after ? '&after=' + encodeURIComponent(after) : '');
      const result = after
        ? await request<{ data: (RetailPriceRecord & { pricing_health?: PricingHealth })[]; next_after: string | null }>(token, path, 'GET', undefined, controller.signal)
        : await fetchQuery(
            scope,
            path,
            signal => request<{ data: (RetailPriceRecord & { pricing_health?: PricingHealth })[]; next_after: string | null }>(token, path, 'GET', undefined, signal),
            { signal: controller.signal, force, awaitRevalidate: true },
          );
      if (controller.signal.aborted) return;
      if (!Array.isArray(result.data) || result.next_after === after) throw new Error('Price page did not advance. Refresh prices.');
      setRows(current => after ? [...current, ...result.data.filter(row => !current.some(item => item.price_id === row.price_id))] : result.data); setCursor(result.next_after);
    } catch (failure) { if (!controller.signal.aborted) { setFailed(after); setError(failure instanceof Error ? failure.message : 'Standard prices unavailable.'); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  const reloadFresh = () => {
    invalidateQueries(base);
    invalidateQueries('/api/v1/models');
    void refreshModels();
    void load(undefined, true);
  };
  useEffect(() => { void load(); return () => active.current?.abort(); }, [token]);
  const requestedModel = search.get('model')?.trim() ?? '';
  const requestedPublish = search.get('publish');
  useEffect(() => {
    if (!requestedModel || (requestedPublish !== 'text' && requestedPublish !== 'media')) return;
    setFilter(requestedModel);
    if (mode !== 'currency' || !currency || loading || error || editor) return;
    const existing = rows.find(row => row.model_alias === requestedModel && row.schedule.kind === requestedPublish) ?? null;
    if (!existing && cursor) return;
    setEditor({ kind: requestedPublish, previous: existing, initialModel: requestedModel });
    setEditorOpen(true);
    const next = new URLSearchParams(search);
    next.delete('publish');
    setSearch(next, { replace: true });
  }, [requestedModel, requestedPublish, mode, currency, loading, error, editor, rows, cursor, search, setSearch]);
  useEffect(() => {
    if (mode === 'currency' && (filter.trim() || supplyFilter !== 'all') && cursor && !loading && !error) void load(cursor);
  }, [filter, mode, supplyFilter, cursor, loading, error]);
  const hasSupplyData = rows.some(row => supplyStateOf(row.pricing_health) !== 'unknown');
  const activeSupplyCount = rows.filter(row => supplyStateOf(row.pricing_health) === 'active').length;
  const inactiveSupplyCount = rows.filter(row => {
    const state = supplyStateOf(row.pricing_health);
    return state === 'inactive' || state === 'unconfigured';
  }).length;
  const sortedRows = hasSupplyData
    ? [...rows].sort((a, b) => {
        const rank = (state: ReturnType<typeof supplyStateOf>) =>
          state === 'active' ? 0 : state === 'unknown' ? 1 : state === 'inactive' ? 2 : 3;
        return rank(supplyStateOf(a.pricing_health)) - rank(supplyStateOf(b.pricing_health));
      })
    : rows;
  const visible = sortedRows.filter(row => {
    if (!row.model_alias.toLowerCase().includes(filter.trim().toLowerCase())) return false;
    if (supplyFilter === 'all' || !hasSupplyData) return true;
    const state = supplyStateOf(row.pricing_health);
    return supplyFilter === 'active' ? state === 'active' : state !== 'active';
  });
  const supplyFilterLabel =
    supplyFilter === 'active'
      ? uiF("Active supply ({0})", [cursor ? activeSupplyCount + "+" : activeSupplyCount])
      : supplyFilter === 'inactive'
        ? uiF("No active supply ({0})", [cursor ? inactiveSupplyCount + "+" : inactiveSupplyCount])
        : uiF("All models ({0})", [cursor ? rows.length + "+" : rows.length]);
  const modelSearch = <div className="relative w-full min-w-0 sm:max-w-sm"><IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input ref={priceSearch} type="search" className="pl-9" aria-label={uiT("Filter model prices")} placeholder={uiT("Filter by model name…")} value={filter} onChange={event => setFilter(event.target.value)} /></div>;
  const supplyFilterControl = hasSupplyData ? (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" aria-label={uiT("Filter by supply status", "按供应状态筛选")}>
            <span>{supplyFilterLabel}</span>
            <IconChevronDown size={14} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value={supplyFilter} onValueChange={value => setSupplyFilter(value as 'all' | 'active' | 'inactive')}>
            <DropdownMenuRadioItem value="all">{uiF("All models ({0})", [cursor ? rows.length + "+" : rows.length])}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="active">{uiF("Active supply ({0})", [cursor ? activeSupplyCount + "+" : activeSupplyCount])}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="inactive">{uiF("No active supply ({0})", [cursor ? inactiveSupplyCount + "+" : inactiveSupplyCount])}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {!cursor && inactiveSupplyCount > 0 && (
        <span className="text-xs text-muted-foreground">
          {uiF("{0} active · {1} without active supply", [activeSupplyCount, inactiveSupplyCount])}
        </span>
      )}
    </div>
  ) : null;
  const currencyHeaderActions = mode === 'currency' ? (
    <>
      <Button variant="ghost" size="icon-sm" disabled={loading} aria-label={uiT("Refresh prices")} title={uiT("Refresh prices")} onClick={reloadFresh}>
        <IconRefresh size={16} className={loading ? 'animate-spin' : undefined} aria-hidden="true" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={legacyOpener} type="button" variant="outline" size="icon-sm" aria-label={uiT("More actions")} disabled={loading && !rows.length}>
            <IconDots size={16} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!currency || (loading && !rows.length) || !!error || !!editor} onSelect={() => { dialogOpener.current = legacyOpener.current; setEditor({ kind: 'media', previous: null }); setEditorOpen(true); }}>{uiT("Publish media price")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLegacyOpen(true)}>{uiT("Existing media contracts")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button ref={publishButton} size="sm" disabled={!currency || (loading && !rows.length) || !!error || !!editor} onClick={event => { dialogOpener.current = event.currentTarget; setEditor({ kind: 'text', previous: null }); setEditorOpen(true); }}>{uiT("Publish text price")}</Button>
    </>
  ) : undefined;
  return <div className="empty-region space-y-5">
    <Tabs value={mode} onValueChange={value => {
      const nextMode = value as BillingMode;
      setViewMode(nextMode);
      const next = new URLSearchParams(search);
      next.set('tab', nextMode);
      setSearch(next, { replace: true });
    }}>
      <PageHeader
        title={uiT("Standard pricing", "标准售价")}
        tabs={showModeTabs ? (
          <TabsList variant="line" aria-label={uiT("Pricing mode")}>
            <TabsTrigger value="currency">{uiT("Settlement Currency")}</TabsTrigger>
            <TabsTrigger value="credits">{uiT("Branded Credits")}</TabsTrigger>
          </TabsList>
        ) : undefined}
        action={currencyHeaderActions}
      />
      {editor && !editorOpen && <Alert><AlertDescription className="flex flex-wrap items-center gap-2"><span>{uiT("A price publication is awaiting confirmation. Reopen it to check or retry before leaving this page.")}</span><Button type="button" variant="outline" onClick={event => { dialogOpener.current = event.currentTarget; setEditorOpen(true); }}>{uiT("Return to publication")}</Button></AlertDescription></Alert>}
      {showModeTabs && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={mode === activeMode ? 'secondary' : 'outline'}>{mode === activeMode ? uiF("Active billing mode: {0}", [modeLabel]) : uiF("Preparing prices for {0}", [modeLabel])}</Badge>
            {mode === 'currency' && supplyFilterControl}
          </div>
          {mode === 'currency' && rows.length > 0 && modelSearch}
        </div>
      )}
      <TabsContent value="currency" className="space-y-4">
        {!currency && <Alert><AlertDescription className="flex flex-wrap items-center gap-2"><span>{uiT("Configure the platform currency in Admin Settings before publishing currency prices. If it is already configured, refresh this page.")}</span><Button asChild variant="link" className="h-auto p-0"><Link to="/admin/settings">{uiT("Open Settings")}</Link></Button></AlertDescription></Alert>}
        {!showModeTabs && rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {modelSearch}
            {supplyFilterControl}
          </div>
        )}
        {notice && <p role="status">{uiT(notice)}</p>}
        {error && <Alert variant="destructive"><AlertDescription>{uiT(error)} <Button variant="outline" disabled={loading} onClick={() => void load(failed, true)}>{uiT("Retry prices")}</Button></AlertDescription></Alert>}
        {loading && !rows.length && <TableSkeleton columns={4} rows={5} label={uiT("Loading standard prices…")} />}
        {!!visible.length && <Table className="standard-price-directory" aria-label={uiT("Platform standard selling prices")}><TableHeader><TableRow>{[uiT('Model'), uiT('Standard price'), uiT('Published'), uiT('Actions')].map((label, index) => <TableHead key={label} className={index === 3 ? 'text-right' : undefined}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{visible.map(row => {
          const supply = supplyStateOf(row.pricing_health);
          const providers = row.pricing_health?.active_providers ?? [];
          const unsupplied = supply === 'inactive' || supply === 'unconfigured';
          const below = unsupplied ? undefined : row.pricing_health?.checks.find(check => check.status === 'below_cost');
          const missingQuote = !unsupplied && row.pricing_health?.checks.some(check => check.status === 'missing_provider_price' || check.status === 'comparison_unavailable');
          const loss = below?.rates?.find(rate => below.dimensions.some(item => item.dimension === rate.dimension && item.minimum_input_tokens === rate.minimum_input_tokens));
          return <TableRow key={row.price_id} className={unsupplied ? 'opacity-75 transition-opacity hover:opacity-100' : undefined}><TableCell className="max-w-64 whitespace-normal"><p className="inline-flex items-center gap-2 font-medium break-words"><ProviderLogo provider={modelIdentity({ id: row.model_alias })} size="small" /><span>{row.model_alias}</span></p><div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span>{row.currency} · {row.schedule.kind === 'text' ? uiT("Text tokens") : row.schedule.meter === 'video_tokens' ? uiT("Video tokens") : row.schedule.meter === 'seconds' ? uiT("Seconds") : row.schedule.meter}</span>{supply === 'active' && <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-normal">{providers.length ? uiF("Active supply · {0}", [providers.join(', ')]) : uiT("Active supply", "有可用供应")}</Badge>}{supply === 'inactive' && <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal text-muted-foreground">{uiT("Supply inactive", "供应已停用")}</Badge>}{supply === 'unconfigured' && <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal text-muted-foreground">{uiT("No active supply", "无可用供应")}</Badge>}</div></TableCell><TableCell data-label={uiT("Standard price")} className="min-w-0 sm:min-w-52 whitespace-normal tabular-nums"><SellingSchedule schedule={row.schedule} currency={row.currency} compact />
            {missingQuote && <Badge variant="outline">{uiT("Purchase comparison incomplete", "采购价待核对")}</Badge>}
            {below && <div className="mt-2 space-y-1"><Badge variant="destructive">{uiT("Below purchase cost", "低于采购成本")}</Badge>
              {loss && <p className="text-sm">{uiT(loss.dimension)} · {below.provider} · {uiT("Selling price", "售价")} {money(loss.selling, row.currency)} · {uiT("Purchase price", "采购价")} {money(loss.purchase, row.currency)} / {uiT("million tokens", "百万 Token")}{loss.minimum_input_tokens !== '0' && ' · ≥ ' + BigInt(loss.minimum_input_tokens).toLocaleString() + ' ' + uiT("Tokens")}</p>}</div>}</TableCell><TableCell data-label={uiT("Published")} className="text-sm text-muted-foreground whitespace-normal">{date(row.published_at)}</TableCell><TableCell><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="sm" disabled={loading || !!error} onClick={event => { dialogOpener.current = event.currentTarget; setSelected(row); }}>{uiT("Compare prices", "核对价格")}</Button><DropdownMenu><DropdownMenuTrigger asChild><Button onFocus={event => { dialogOpener.current = event.currentTarget; }} variant="ghost" size="icon" aria-label={uiT("Actions")} disabled={loading || !!error}><IconDots /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={!!editor} onSelect={() => { setEditor({ kind: row.schedule.kind, previous: row }); setEditorOpen(true); }}>{uiT("Revise standard")}</DropdownMenuItem><DropdownMenuItem onSelect={() => setManaged(row)}>{uiT("Promotions")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></TableCell></TableRow>;
        })}</TableBody></Table>}
        {!loading && !error && !cursor && !visible.length && <Empty className="min-h-48">
          <EmptyHeader><EmptyMedia variant="icon"><IconCurrencyDollar size={20} aria-hidden="true" /></EmptyMedia><EmptyTitle>{rows.length ? uiT("No matching prices") : uiT("No standard prices yet")}</EmptyTitle></EmptyHeader>
          {(filter.trim() || supplyFilter !== 'all') && <EmptyContent><Button variant="outline" onClick={() => {
            setFilter('');
            setSupplyFilter('all');
            priceSearch.current?.focus();
          }}>{uiT("Clear filters")}</Button></EmptyContent>}
        </Empty>}
        {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>{uiT("More prices")}</Button>}
      </TabsContent>
      <TabsContent value="credits" className="space-y-4"><BrandedUnitTariffsSection token={token} filter={filter} searchControl={modelSearch} /></TabsContent>
    </Tabs>
    {legacyOpen && <LegacyMediaContracts token={token} returnFocus={legacyOpener} onClose={() => setLegacyOpen(false)}/>}
    {editor?.kind === 'text' && <TextStandardEditor token={token} previous={editor.previous} initialModel={editor.initialModel} open={editorOpen} onCloseAutoFocus={restorePricingFocus} onClose={pending => { setEditorOpen(false); if (!pending) { setEditor(null); reloadFresh(); } }} onSaved={() => { setEditor(null); setNotice(uiT("Text standard price published.")); reloadFresh(); }} />}
    {editor?.kind === 'media' && <MediaStandardEditor token={token} previous={editor.previous} initialModel={editor.initialModel} open={editorOpen} onCloseAutoFocus={restorePricingFocus} onClose={pending => { setEditorOpen(false); if (!pending) { setEditor(null); reloadFresh(); } }} onSaved={() => { setEditor(null); setNotice(uiT("Media standard price published.")); reloadFresh(); }} />}
    {managed && <PromotionsManager token={token} price={managed} onClose={() => { setManaged(null); reloadFresh(); }} onPublish={baseline => { setManaged(null); setPromotion(baseline); }} />}
    {promotion && <PromotionEditor token={token} baseline={promotion} onClose={() => { setPromotion(null); reloadFresh(); }} onSaved={() => { setPromotion(null); setNotice('Finite promotion published. Existing request prices are unchanged.'); reloadFresh(); }} />}
    {selected && <History key={selected.price_id} token={token} price={selected} onCloseAutoFocus={restorePricingFocus} onClose={() => setSelected(null)} />}
  </div>;
}
function History({ token, price, onClose, onCloseAutoFocus }: { token: string; price: RetailPriceRecord; onClose: () => void; onCloseAutoFocus: (event: Event) => void }) {
  const { t: uiT } = useUILocale();
  const [history, setHistory] = useState<RetailPriceHistory | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [failed, setFailed] = useState<string>();
  const active = useRef<AbortController | null>(null);
  async function load(before?: string) {
    active.current?.abort(); const controller = new AbortController(); active.current = controller; setLoading(true); setError(''); setFailed(undefined);
    try {
      const value = await request<RetailPriceHistory>(token, base + '/' + encodeURIComponent(price.price_id) + '/history?limit=50' + (before ? '&before=' + encodeURIComponent(before) : ''), 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (!Array.isArray(value.data) || value.next_before === before) throw new Error('History did not advance. Refresh history.');
      setHistory(current => before && current ? { ...value, data: [...current.data, ...value.data.filter(row => !current.data.some(saved => saved.revision === row.revision))] } : value);
    } catch (failure) { if (!controller.signal.aborted) { setFailed(before); setError(failure instanceof Error ? failure.message : 'Price history unavailable.'); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => () => active.current?.abort(), [token, price.price_id]);
  return (
    <Sheet open onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent onCloseAutoFocus={onCloseAutoFocus} className="w-full gap-5 overflow-y-auto p-5 sm:max-w-2xl">
        <SheetHeader className="p-0 pr-8">
          <SheetTitle>{uiT("Compare prices", "核对价格")}</SheetTitle>
          <SheetDescription>{price.model_alias} · {price.currency}</SheetDescription>
        </SheetHeader>
        {price.schedule.kind === 'text' && price.schedule.prompt_rate === '0' && price.schedule.completion_rate === '0' && <p>{uiT("Base input and output are free", "基础输入与输出免费")}</p>}
        {(!price.pricing_health?.checks.some(check => check.rates?.length || check.media_rates) || ['inactive', 'unconfigured'].includes(supplyStateOf(price.pricing_health))) && <section className="space-y-2">
          <h3 className="font-medium">{uiT('Standard price', '标准售价')}</h3>
          <SellingSchedule schedule={price.schedule} currency={price.currency} />
        </section>}
        <PriceComparison health={price.pricing_health} currency={price.currency} />
        <Button asChild variant="outline" className="self-start"><Link to={`/admin/reports?tab=unit-economics&model=${encodeURIComponent(price.model_alias)}`}>
          {uiT("View realized margin", "查看实际毛利")}
        </Link></Button>
        <details onToggle={event => { if (event.currentTarget.open && !history && !active.current) void load(); }}>
          <summary className="cursor-pointer font-medium">{uiT("Price history", "调价记录")}</summary>
          <div className="mt-3 space-y-3">
        {loading && !history && <ListRowsSkeleton rows={3} label={uiT("Loading price history…")} />}
        {error && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{uiT(error)}</span>
              <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load(failed)}>
                {uiT("Retry history")}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {history && (
          <div className="divide-y divide-border/70">
            {history.data.map((row, index) => {
              const rowIsFreeText =
                row.standard_schedule?.kind === 'text' &&
                row.standard_schedule.prompt_rate === '0' &&
                row.standard_schedule.completion_rate === '0';
              return (
                <section key={row.revision} className="space-y-3 py-4 first:pt-1 last:pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {row.action === 'standard_published'
                        ? uiT("Standard published")
                        : row.action === 'promotion_published'
                          ? uiT("Promotion published")
                          : uiT("Promotion retired")}
                    </Badge>
                    {rowIsFreeText && (
                      <Badge variant="destructive" className="font-normal">
                        {uiT("Free ($0.00)", "免费（$0.00）")}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">{date(row.created_at)}</span>
                  </div>
                  {row.reason && (
                    <p className="text-sm text-muted-foreground break-words">
                      <span className="font-medium text-foreground">{uiT("Publication note:", "发布备注：")}</span>{" "}
                      {row.reason}
                    </p>
                  )}
                  {row.standard_schedule && <ScheduleRevision schedule={row.standard_schedule} prior={history.data.slice(index + 1).find(older => older.standard_schedule)?.standard_schedule} currency={price.currency} />}
                  {row.promotion && (
                    <>
                      <p className="text-sm">
                        {row.promotion.scope === 'global'
                          ? uiT("All customers")
                          : row.promotion.customer_name || uiT("Customer name unavailable")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {uiT("Published period:")}{" "}{seconds(row.promotion.effective_from)} – {seconds(row.promotion.effective_until)}
                      </p>
                      <SellingSchedule schedule={row.promotion.schedule} currency={price.currency} />
                    </>
                  )}
                  {row.retirement && (
                    <p className="text-sm text-muted-foreground">
                      {uiT("Eligibility cutoff:")}{" "}{seconds(row.retirement.effective_until)}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <SheetFooter className="p-0">
          <div>
            {history?.next_before && (
              <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load(history.next_before!)}>
                {uiT("Older events")}
              </Button>
            )}
          </div>

        </SheetFooter>
          </div>
        </details>
      </SheetContent>
    </Sheet>
  );
}
