import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { translateUI } from '@/shell/ui-locale';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import LegacyMediaContracts from './legacy-media';
import { PricingHealthNotice, type PricingHealth } from './pricing-health';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { IconCurrencyDollar, IconSearch } from '@tabler/icons-react';
import { ListRowsSkeleton, TableSkeleton } from '@/components/PageSkeletons';
import { fetchQuery, invalidateQueries, peekQuery } from '@/lib/query-cache';
import { useDashboardContext } from '@/shell/dashboard-context';
import { usePlatformCurrency, type BillingMode } from '@/shell/platform-currency';
import PageHeader from '@/components/PageHeader';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity } from '@/lib/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { request } from '@/features/providers/api';
import { TextStandardEditor } from './text-editor';
import { MediaStandardEditor } from './media-editor';
import { PromotionEditor } from './promotion-editor';
import { SellingSchedule } from './schedule';
import { PromotionsManager } from './promotions';
import { BrandedUnitTariffsSection } from './unit-tariffs';
import type { RetailPriceRecord, RetailPriceHistory } from '@niu-io/sdk/admin';

const base = '/api/v1/pricing/standard-prices';
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(readUILocale()) : translateUI('Date unavailable');
const seconds = (value: string) => /^\d+$/.test(value) ? date(new Date(Number(value) * 1000).toISOString()) : translateUI('Date unavailable');
export default function RetailPricingRoute() {
  const { token } = useDashboardContext();
  return <Standards key={token} token={token} />;
}
function Standards({ token }: { token: string }) {
  const { t: uiT, format: uiF } = useUILocale();
  const { billingMode, currency } = usePlatformCurrency();
  const [viewMode, setViewMode] = useState<BillingMode | null>(null);
  const activeMode: BillingMode = billingMode ?? 'currency';
  const mode = viewMode ?? activeMode;
  const modeLabel = mode === 'credits' ? uiT("Branded Credits") : uiT("Settlement Currency");
  const scope = token || 'public';
  const firstPagePath = base + '?limit=50';
  const initialPage = peekQuery<{ data: (RetailPriceRecord & { pricing_health?: PricingHealth })[]; next_after: string | null }>(scope, firstPagePath);
  const [rows, setRows] = useState<(RetailPriceRecord & { pricing_health?: PricingHealth })[]>(() => Array.isArray(initialPage?.data) ? initialPage.data : []);
  const [cursor, setCursor] = useState<string | null>(() => initialPage?.next_after ?? null);
  const [loading, setLoading] = useState(() => !initialPage), [error, setError] = useState(''), [filter, setFilter] = useState('');
  const [failed, setFailed] = useState<string>(), [selected, setSelected] = useState<RetailPriceRecord | null>(null);
  const [editor, setEditor] = useState<{ kind: 'text' | 'media'; previous: RetailPriceRecord | null } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [notice, setNotice] = useState('');
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
  const reloadFresh = () => { invalidateQueries(base); void load(undefined, true); };
  useEffect(() => { void load(); return () => active.current?.abort(); }, [token]);
  const visible = rows.filter(row => row.model_alias.toLowerCase().includes(filter.trim().toLowerCase()));
  return <div className="empty-region space-y-6"><PageHeader title={uiT("Pricing")} /><p className="text-sm text-muted-foreground">{uiT("Set the customer prices charged across workspaces. Settlement currency and Branded Credits use separate pricing tables; choose a tab to review or prepare either mode. Promotions apply to currency prices. Models also need available supply and permission to be used.")}</p>
    {editor && !editorOpen && <Alert><AlertDescription className="flex flex-wrap items-center gap-2"><span>{uiT("A price publication is awaiting confirmation. Reopen it to check or retry before leaving this page.")}</span><Button type="button" variant="outline" onClick={() => setEditorOpen(true)}>{uiT("Return to publication")}</Button></AlertDescription></Alert>}
    <Tabs value={mode} onValueChange={value => setViewMode(value as BillingMode)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TabsList aria-label={uiT("Pricing mode")}><TabsTrigger value="currency">{uiT("Settlement Currency")}</TabsTrigger><TabsTrigger value="credits">{uiT("Branded Credits")}</TabsTrigger></TabsList>
          <Badge variant={mode === activeMode ? 'default' : 'outline'}>{mode === activeMode ? uiF("Active billing mode: {0}", [modeLabel]) : uiF("Preparing prices for {0}", [modeLabel])}</Badge>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 sm:max-w-sm"><IconSearch size={16} className="shrink-0" aria-hidden="true" /><Input type="search" aria-label={uiT("Filter model prices")} placeholder={uiT("Filter by model name…")} value={filter} onChange={event => setFilter(event.target.value)} /></div>
      </div>
      <TabsContent value="currency" className="space-y-4">
        {!currency && <Alert><AlertDescription className="flex flex-wrap items-center gap-2"><span>{uiT("Configure the platform currency in Admin Settings before publishing currency prices. If it is already configured, refresh this page.")}</span><Button asChild variant="link" className="h-auto p-0"><Link to="/admin/settings">{uiT("Open Settings")}</Link></Button></AlertDescription></Alert>}
        <div className="flex flex-wrap items-center gap-2"><Button variant="outline" disabled={loading} onClick={reloadFresh}>{uiT("Refresh prices")}</Button><Button disabled={(loading && !rows.length) || !!error || !!editor} onClick={() => { setEditor({ kind: 'text', previous: null }); setEditorOpen(true); }}>{uiT("Publish text price")}</Button><Button variant="outline" disabled={(loading && !rows.length) || !!error || !!editor} onClick={() => { setEditor({ kind: 'media', previous: null }); setEditorOpen(true); }}>{uiT("Publish media price")}</Button><Button ref={legacyOpener} variant="link" className="h-auto p-0" onClick={() => setLegacyOpen(true)}>{uiT("Existing media contracts")}</Button></div>
        {notice && <p role="status">{notice}</p>}
        {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" disabled={loading} onClick={() => void load(failed, true)}>{uiT("Retry prices")}</Button></AlertDescription></Alert>}
        {loading && !rows.length && <TableSkeleton columns={4} rows={5} label={uiT("Loading standard prices…")} />}
        {!!rows.length && <Table aria-label={uiT("Platform standard selling prices")}><TableHeader><TableRow>{[uiT('Model'), uiT('Standard price'), uiT('Price checks'), uiT('Actions')].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{visible.map(row => <TableRow key={row.price_id}><TableCell className="max-w-64 whitespace-normal"><p className="inline-flex items-center gap-2 font-medium break-words"><ProviderLogo provider={modelIdentity({ id: row.model_alias })} size="small" /><span>{row.model_alias}</span></p><p className="mt-1 text-xs text-muted-foreground">{row.currency} · {row.schedule.kind === 'text' ? uiT("Text tokens") : row.schedule.meter}</p><p className="mt-1 text-xs text-muted-foreground">{uiT("Published")}{" "}{date(row.published_at)}</p></TableCell><TableCell className="whitespace-normal"><SellingSchedule schedule={row.schedule} currency={row.currency} compact /></TableCell><TableCell><PricingHealthNotice health={row.pricing_health} /></TableCell><TableCell><div className="flex flex-col items-start gap-1"><Button variant="outline" disabled={loading || !!error} onClick={() => setSelected(row)}>{uiT("Prices & history")}</Button>{<Button variant="outline" disabled={loading || !!error || !!editor} onClick={() => { setEditor({ kind: row.schedule.kind, previous: row }); setEditorOpen(true); }}>{uiT("Revise standard")}</Button>}<Button variant="outline" disabled={loading || !!error} onClick={() => setManaged(row)}>{uiT("Promotions")}</Button></div></TableCell></TableRow>)}</TableBody></Table>}
        {!loading && !error && !visible.length && <Empty className="min-h-48"><EmptyHeader><EmptyMedia variant="icon"><IconCurrencyDollar size={20} aria-hidden="true" /></EmptyMedia><EmptyTitle>{rows.length ? uiT("No matching prices") : uiT("No standard prices yet")}</EmptyTitle><EmptyDescription>{rows.length ? uiT("No loaded prices match this filter.") : uiT("No platform standard prices have been published.")}</EmptyDescription></EmptyHeader></Empty>}
        {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>{uiT("More prices")}</Button>}
      </TabsContent>
      <TabsContent value="credits" className="space-y-4"><BrandedUnitTariffsSection token={token} filter={filter} /></TabsContent>
    </Tabs>
    {legacyOpen && <LegacyMediaContracts token={token} returnFocus={legacyOpener} onClose={() => setLegacyOpen(false)}/>}
    {editor?.kind === 'text' && <TextStandardEditor token={token} previous={editor.previous} open={editorOpen} onClose={pending => { setEditorOpen(false); if (!pending) { setEditor(null); reloadFresh(); } }} onSaved={() => { setEditor(null); setNotice(uiT("Text standard price published.")); reloadFresh(); }} />}
    {editor?.kind === 'media' && <MediaStandardEditor token={token} previous={editor.previous} open={editorOpen} onClose={pending => { setEditorOpen(false); if (!pending) { setEditor(null); reloadFresh(); } }} onSaved={() => { setEditor(null); setNotice(uiT("Media standard price published.")); reloadFresh(); }} />}
    {managed && <PromotionsManager token={token} price={managed} onClose={() => { setManaged(null); reloadFresh(); }} onPublish={baseline => { setManaged(null); setPromotion(baseline); }} />}
    {promotion && <PromotionEditor token={token} baseline={promotion} onClose={() => { setPromotion(null); reloadFresh(); }} onSaved={() => { setPromotion(null); setNotice('Finite promotion published. Existing request prices are unchanged.'); reloadFresh(); }} />}
    {selected && <History key={selected.price_id} token={token} price={selected} onClose={() => setSelected(null)} />}
  </div>;
}
function History({ token, price, onClose }: { token: string; price: RetailPriceRecord; onClose: () => void }) {
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
  useEffect(() => { void load(); return () => active.current?.abort(); }, [token, price.price_id]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{uiT("Prices & history")}</DialogTitle><DialogDescription>{price.model_alias} · {price.currency}{uiT(". Immutable publication events. An event is not proof of a currently applicable promotion; later retirement events or unshown pages may change eligibility.")}</DialogDescription></DialogHeader><Button variant="outline" disabled={loading} onClick={() => void load()}>{uiT("Refresh history")}</Button>
    {loading && !history && <ListRowsSkeleton rows={3} label={uiT("Loading price history…")} />}{error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" disabled={loading} onClick={() => void load(failed)}>{uiT("Retry history")}</Button></AlertDescription></Alert>}
    {history?.data.map(row => <section key={row.revision} className="space-y-2 border-b py-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{row.action === 'standard_published' ? uiT("Standard published") : row.action === 'promotion_published' ? uiT("Promotion published") : uiT("Promotion retired")}</Badge><span className="text-sm text-muted-foreground">{date(row.created_at)}</span></div>{row.reason && <p className="break-words">{row.reason}</p>}{row.standard_schedule && <><SellingSchedule schedule={row.standard_schedule} currency={price.currency} /></>}{row.promotion && <><p>{row.promotion.scope === 'global' ? uiT("All customers") : row.promotion.customer_name || uiT("Customer name unavailable")}</p><p className="text-sm">{uiT("Published period:")}{" "}{seconds(row.promotion.effective_from)} – {seconds(row.promotion.effective_until)}</p><SellingSchedule schedule={row.promotion.schedule} currency={price.currency} /></>}{row.retirement && <p>{uiT("Eligibility cutoff:")}{" "}{seconds(row.retirement.effective_until)}</p>}</section>)}
    {history?.next_before && <Button variant="outline" disabled={loading} onClick={() => void load(history.next_before!)}>{uiT("Older events")}</Button>}<div className="flex justify-end"><Button variant="outline" onClick={onClose}>{uiT("Close")}</Button></div>
  </DialogContent></Dialog>;
}
