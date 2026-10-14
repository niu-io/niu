import { useEffect, useRef, useState } from 'react';
import { useDashboardContext } from '@/app/dashboard-context';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { request } from '@/features/vendors/api';
import WorkspacePricing from '@/features/customer-pricing/page';
import { TextStandardEditor } from './text-editor';
import { money } from '@/lib/money';
import type { RetailPriceRecord, RetailPriceHistory, RetailSchedule } from '../../../../../sdks/javascript/src/admin';

const base = '/admin/v1/pricing/standard-prices';
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Date unavailable';
const seconds = (value: string) => /^\d+$/.test(value) ? date(new Date(Number(value) * 1000).toISOString()) : 'Date unavailable';
export default function RetailPricingRoute() {
  const { token } = useDashboardContext();
  return <Tabs defaultValue="standards" className="w-full"><div className="px-6 pt-6"><TabsList><TabsTrigger value="standards">Standard prices</TabsTrigger><TabsTrigger value="workspaces">Workspace tariffs</TabsTrigger></TabsList></div><TabsContent value="standards"><Standards key={token} token={token} /></TabsContent><TabsContent value="workspaces"><WorkspacePricing /></TabsContent></Tabs>;
}
function Standards({ token }: { token: string }) {
  const [rows, setRows] = useState<RetailPriceRecord[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [filter, setFilter] = useState('');
  const [failed, setFailed] = useState<string>(), [selected, setSelected] = useState<RetailPriceRecord | null>(null);
  const [editor, setEditor] = useState<{ previous: RetailPriceRecord | null } | null>(null);
  const [notice, setNotice] = useState('');
  const active = useRef<AbortController | null>(null);
  async function load(after?: string) {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setLoading(true); setError(''); setFailed(undefined);
    try {
      const result = await request<{ data: RetailPriceRecord[]; next_after: string | null }>(token, base + '?limit=50' + (after ? '&after=' + encodeURIComponent(after) : ''), 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (!Array.isArray(result.data) || result.next_after === after) throw new Error('Price page did not advance. Refresh prices.');
      setRows(current => after ? [...current, ...result.data.filter(row => !current.some(item => item.price_id === row.price_id))] : result.data); setCursor(result.next_after);
    } catch (failure) { if (!controller.signal.aborted) { setFailed(after); setError(failure instanceof Error ? failure.message : 'Standard prices unavailable.'); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(); return () => active.current?.abort(); }, [token]);
  const visible = rows.filter(row => row.model_alias.toLowerCase().includes(filter.trim().toLowerCase()));
  return <div className="space-y-6 p-6"><PageHeader title="Standard prices" action={<Button disabled={loading || !!error} onClick={() => setEditor({ previous: null })}>Publish text price</Button>} /><p className="text-sm text-muted-foreground">Platform customer selling prices, independent of Supplier purchase offers. Publication does not establish qualified supply or enroll a workspace. Publish or revise text standards here. Media publication and finite promotion changes currently use the platform API.</p>
    <div className="flex flex-wrap items-center gap-3"><Input aria-label="Filter standard models" placeholder="Filter models" className="max-w-sm" value={filter} onChange={event => setFilter(event.target.value)} /><Button variant="outline" disabled={loading} onClick={() => void load()}>Refresh prices</Button></div>
    {notice && <p role="status">{notice}</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" disabled={loading} onClick={() => void load(failed)}>Retry prices</Button></AlertDescription></Alert>}
    {loading && !rows.length && <p role="status">Loading standard prices…</p>}
    {!!rows.length && <Table aria-label="Platform standard selling prices"><TableHeader><TableRow>{['Model', 'Currency', 'Billing', 'Standard price', 'Published', 'Actions'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{visible.map(row => <TableRow key={row.price_id}><TableCell className="font-medium">{row.model_alias}</TableCell><TableCell>{row.currency}</TableCell><TableCell><Badge variant="outline">{row.schedule.kind === 'text' ? 'Text tokens' : row.schedule.meter}</Badge></TableCell><TableCell><Schedule schedule={row.schedule} currency={row.currency} compact /></TableCell><TableCell className="whitespace-nowrap">{date(row.published_at)}</TableCell><TableCell><div className="flex gap-2"><Button variant="outline" disabled={loading || !!error} onClick={() => setSelected(row)}>Prices &amp; history</Button>{row.schedule.kind === 'text' && <Button variant="outline" disabled={loading || !!error} onClick={() => setEditor({ previous: row })}>Revise standard</Button>}</div></TableCell></TableRow>)}</TableBody></Table>}
    {!loading && !error && !visible.length && <p>{rows.length ? 'No loaded prices match this filter.' : 'No platform standard prices have been published.'}</p>}
    {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>More prices</Button>}
    {editor && <TextStandardEditor token={token} previous={editor.previous} onClose={() => { setEditor(null); void load(); }} onSaved={() => { setEditor(null); setNotice('Text standard price published. Refresh confirmed configuration before the next change.'); void load(); }} />}
    {selected && <History key={selected.price_id} token={token} price={selected} onClose={() => setSelected(null)} />}
  </div>;
}
function Schedule({ schedule, currency, compact = false }: { schedule: RetailSchedule; currency: string; compact?: boolean }) {
  if (schedule.kind === 'media') {
    const amount = `${schedule.amount_units.padStart(schedule.decimal_places + 1, '0')}`;
    const formatted = schedule.decimal_places ? amount.slice(0, -schedule.decimal_places) + '.' + amount.slice(-schedule.decimal_places) : amount;
    return <div className="space-y-1 text-sm"><p>{currency} {formatted} / {schedule.per_quantity.numerator}{schedule.per_quantity.denominator === '1' ? '' : '/' + schedule.per_quantity.denominator} {schedule.meter}</p>{!compact && <><p>{schedule.dimensions.channel} · {schedule.dimensions.resolution} · {schedule.dimensions.reference_video ? 'Reference video' : 'No reference video'}</p><p>Minimum quantity: {schedule.minimum_quantity.numerator}/{schedule.minimum_quantity.denominator} · Rounding: {schedule.rounding}</p></>}</div>;
  }
  const rates = [['Input / 1M tokens', schedule.prompt_rate], ['Output / 1M tokens', schedule.completion_rate], ...(!compact ? [['Cache read / 1M tokens', schedule.cached_prompt_rate], ['Cache write / 1M tokens', schedule.cache_write_prompt_rate], ['Reasoning / 1M tokens', schedule.reasoning_completion_rate], ['Request fee', schedule.request_fee_nanos], ['Minimum charge', schedule.minimum_charge_nanos]] : [])];
  return <div className="space-y-1 text-sm">{rates.map(([label, value]) => <p key={label}>{label}: {value == null ? 'Not separately priced' : money(value, currency)}</p>)}{!compact && schedule.context_tiers.map((tier, index) => <div key={index} className="pt-2"><p>Context tier: {tier.minimum_input_tokens} tokens</p><p>Input: {money(tier.prompt_rate, currency)} / 1M · Output: {money(tier.completion_rate, currency)} / 1M</p>{([['Cache read', tier.cached_prompt_rate], ['Cache write', tier.cache_write_prompt_rate], ['Reasoning', tier.reasoning_completion_rate]] as const).map(([label, rate]) => <p key={label}>{label}: {rate == null ? 'Not separately priced' : money(rate, currency) + ' / 1M'}</p>)}</div>)}</div>;
}
function History({ token, price, onClose }: { token: string; price: RetailPriceRecord; onClose: () => void }) {
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
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Prices &amp; history</DialogTitle><DialogDescription>{price.model_alias} · {price.currency}. Immutable publication events. An event is not proof of a currently applicable promotion; later retirement events or unshown pages may change eligibility.</DialogDescription></DialogHeader><Button variant="outline" disabled={loading} onClick={() => void load()}>Refresh history</Button>
    {loading && !history && <p role="status">Loading price history…</p>}{error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" disabled={loading} onClick={() => void load(failed)}>Retry history</Button></AlertDescription></Alert>}
    {history?.data.map(row => <section key={row.revision} className="space-y-2 border-b py-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{row.action === 'standard_published' ? 'Standard published' : row.action === 'promotion_published' ? 'Promotion published' : 'Promotion retired'}</Badge><span className="text-sm text-muted-foreground">{date(row.created_at)}</span></div><p className="break-words">{row.reason}</p>{row.standard_schedule && <Schedule schedule={row.standard_schedule} currency={price.currency} />}{row.promotion && <><p>{row.promotion.scope === 'global' ? 'All customers' : row.promotion.customer_name || 'Customer name unavailable'}</p><p className="text-sm">Published period: {seconds(row.promotion.effective_from)} – {seconds(row.promotion.effective_until)}</p><Schedule schedule={row.promotion.schedule} currency={price.currency} /></>}{row.retirement && <p>Eligibility cutoff: {seconds(row.retirement.effective_until)}</p>}</section>)}
    {history?.next_before && <Button variant="outline" disabled={loading} onClick={() => void load(history.next_before!)}>Older events</Button>}<div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
  </DialogContent></Dialog>;
}
