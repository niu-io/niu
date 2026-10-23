import { useMockPayments } from '@/app/mock-payments';
import { TriangleAlert } from 'lucide-react';
import { currencySymbol } from '@/lib/money';
import { usePlatformCurrency } from '@/app/platform-currency';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { IconRefresh, IconReceipt } from '@tabler/icons-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { request } from '@/features/providers/api';
import { amountToNanos, money } from '@/lib/money';

type PaymentGateway = 'epay' | 'stripe' | 'zhifux';
type Availability = { currency: string; payment_gateway: PaymentGateway | null; available: boolean; payment_methods: string[]; unavailable_reason: string | null };
type Topup = { id: string; currency: string; amount_nanos: string; payment_method: string; status: 'pending' | 'paid' | 'closed' | 'reconciliation_required'; checkout_url: string | null; created_at?: string };
const names = { pending: 'Awaiting payment', paid: 'Paid', closed: 'Closed', reconciliation_required: 'Checking payment' };
const statusHelp = {
  pending: 'Payment has not been confirmed. Continue the saved checkout if available, or check its status before starting another top-up.',
  paid: 'Payment is confirmed. The credits are recorded in your shared account balance.',
  closed: 'This checkout is closed. If you completed a payment before it closed, check its status before starting another top-up.',
  reconciliation_required: 'The payment is being verified. Credits may not yet be available. Check its status before starting another top-up.',
};
const methodName = (method: string) => ({ card: 'Card', wxpaynative: 'WeChat Pay', alipay: 'Alipay' }[method] ?? method);
function checkedTopup(value: Topup): Topup {
  if (!value || typeof value.id !== 'string' || !value.id || typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)
    || typeof value.amount_nanos !== 'string' || !/^[0-9]{1,19}$/.test(value.amount_nanos)
    || BigInt(value.amount_nanos) <= 0n || BigInt(value.amount_nanos) > 9_223_372_036_854_775_807n
    || typeof value.payment_method !== 'string' || !value.payment_method
    || !Object.hasOwn(names, value.status)
    || (value.checkout_url !== null && typeof value.checkout_url !== 'string')
    || (value.created_at !== undefined && (typeof value.created_at !== 'string' || !Number.isFinite(Date.parse(value.created_at))))) {
    throw new Error('Invalid saved top-up');
  }
  return value;
}
function checkedHistory(page: { data: Topup[]; next_cursor: string | null }) {
  if (!Array.isArray(page.data) || (page.next_cursor !== null && (typeof page.next_cursor !== 'string' || !page.next_cursor))) throw new Error('Invalid payment history');
  page.data.forEach(checkedTopup);
  return page;
}
function checkoutLink(order: Topup) {
  if (order.status !== 'pending' || !order.checkout_url) return null;
  try {
    const url = new URL(order.checkout_url);
    const mock = import.meta.env.DEV && url.protocol === 'http:' && url.hostname === '127.0.0.1' && !!url.port && /^\/checkout\/[a-f0-9]{48}$/.test(url.pathname) && !url.search;
    return (url.protocol === 'https:' || mock) && !url.username && !url.password && !url.hash ? url.href : null;
  } catch { return null; }
}

/** Company payment workflow; the backend owns intent, history and settlement. */
export default function TopupFunding({ token, organization, canCreate, onPaid }: { token: string; organization: string; canCreate: boolean; currencies?: string[]; onPaid: () => void }) {
  const {currency} = usePlatformCurrency();
  const mockEnabled = useMockPayments();
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [orders, setOrders] = useState<Topup[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<'latest' | 'older' | null>(null);
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Topup | null>(null);
  const intent = useRef<{ currency: string; payment_gateway: PaymentGateway; amount_nanos: string; payment_method: string; idempotency_key: string } | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const older = useRef<AbortController | null>(null);
  const paidSeen = useRef(new Set<string>());
  useEffect(() => () => { mutation.current?.abort(); older.current?.abort(); }, [token, organization]);
  useEffect(() => {
    const controller = new AbortController();
    setLoadError(''); setLoadFailure(null); setLoading(true);
    void Promise.allSettled([
      request<{ data: Availability }>(token, `/api/v1/organizations/${organization}/billing/payment-methods${currency ? '?currency=' + encodeURIComponent(currency) : ''}`, 'GET', undefined, controller.signal),
      request<{ data: Topup[]; next_cursor: string | null }>(token, `/api/v1/organizations/${organization}/billing/topups`, 'GET', undefined, controller.signal),
    ]).then(([methodsResult, historyResult]) => {
      if (controller.signal.aborted) return;
      let failed = false;
      try {
        if (methodsResult.status === 'rejected') throw methodsResult.reason;
        const methods = methodsResult.value;
        if (!Array.isArray(methods.data?.payment_methods) || typeof methods.data.available !== 'boolean') throw new Error('Invalid payment response');
        if (typeof methods.data.currency !== 'string' || !/^[A-Z]{3}$/.test(methods.data.currency) || (methods.data.available && !['epay', 'stripe', 'zhifux'].includes(methods.data.payment_gateway ?? ''))) throw new Error('Invalid payment integration');
        if (currency && methods.data.currency !== currency) throw new Error('Mismatched payment currency');
        setAvailability(methods.data);
        setMethod(current => methods.data.payment_methods.includes(current) ? current : methods.data.payment_methods[0] ?? '');
      } catch { failed = true; setAvailability(null); }
      try {
        if (historyResult.status === 'rejected') throw historyResult.reason;
        const history = checkedHistory(historyResult.value);
        setOrders(history.data); setNext(history.next_cursor);
        for (const order of history.data) if (order.status === 'paid' && !paidSeen.current.has(order.id)) { paidSeen.current.add(order.id); onPaid(); }
        setResult(current => current ? history.data.find(order => order.id === current.id) ?? current : current);
      } catch { failed = true; }
      if (failed) { setLoadFailure('latest'); setLoadError('Could not load payment options and saved top-ups.'); }
      setLoading(false);
    });
    return () => controller.abort();
  }, [token, organization, currency, revision]);
  const create = async () => {
    if (!canCreate || !availability?.available || !availability.payment_gateway || busy || intent.current) return;
    setError('');
    try {
      if (!/^\d+(?:\.\d{1,2})?$/.test(amount.trim())) throw new Error('Invalid amount');
      const amount_nanos = amountToNanos(amount);
      if (!availability.payment_methods.includes(method)) throw new Error('Choose an available payment method.');
      intent.current = { currency: availability.currency, payment_gateway: availability.payment_gateway, amount_nanos, payment_method: method, idempotency_key: crypto.randomUUID() };
    } catch { setError(`Enter a positive ${availability.currency} amount with at most two decimal places and choose a payment method.`); return; }
    const controller = new AbortController(); mutation.current = controller; setBusy(true);
    try {
      const response = await request<{ data: Topup }>(token, `/api/v1/organizations/${organization}/billing/topups`, 'POST', intent.current, controller.signal);
      checkedTopup(response.data);
      if (response.data.currency !== intent.current.currency || response.data.amount_nanos !== intent.current.amount_nanos || response.data.payment_method !== intent.current.payment_method) throw new Error('Mismatched checkout intent');
      if (!controller.signal.aborted) { setResult(response.data); setRevision(value => value + 1); }
    } catch {
      if (!controller.signal.aborted) { setError('Checkout was not confirmed. Check saved top-ups before starting another payment.'); setRevision(value => value + 1); }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const loadOlder = async () => {
    if (!next || busy) return;
    const controller = new AbortController(); older.current = controller; setBusy(true); setLoadError(''); setLoadFailure(null);
    try {
      const page = await request<{ data: Topup[]; next_cursor: string | null }>(token, `/api/v1/organizations/${organization}/billing/topups?before=${encodeURIComponent(next)}`, 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      checkedHistory(page);
      if (!Array.isArray(page.data) || page.next_cursor === undefined || page.next_cursor === next) throw new Error('Invalid payment history');
      setOrders(current => [...current, ...page.data.filter(order => !current.some(saved => saved.id === order.id))]); setNext(page.next_cursor);
    } catch { if (!controller.signal.aborted) { setLoadFailure('older'); setLoadError('Could not load older top-ups.'); } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const resume = (order: Topup) => { if (busy) return; setResult(order); setError(''); setOpen(true); };
  const checkResult = async () => {
    if (!result || busy) return;
    const controller = new AbortController(); mutation.current = controller; setBusy(true); setError('');
    try {
      const response = await request<{ data: Topup }>(token, `/api/v1/organizations/${organization}/billing/topups/${result.id}`, 'GET', undefined, controller.signal);
      checkedTopup(response.data);
      if (response.data.id !== result.id || response.data.currency !== result.currency || response.data.amount_nanos !== result.amount_nanos) throw new Error('Mismatched saved top-up');
      if (!controller.signal.aborted) { setResult(response.data); setRevision(value => value + 1); if (response.data.status === 'paid') onPaid(); }
    } catch { if (!controller.signal.aborted) setError('Could not check payment status. Try again.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const begin = () => { if (busy) return; intent.current = null; setResult(null); setAmount(''); setError(''); setOpen(true); };
  const link = result && checkoutLink(result);
  return <section aria-label="Account top-ups" className="grid gap-3" aria-busy={loading}>
    <div className="flex flex-wrap items-center gap-3">

      {canCreate && availability?.available && <Button disabled={busy} onClick={event => { opener.current = event.currentTarget; begin(); }}>Add credits</Button>}
      {canCreate && availability && !availability.available && <p className="text-sm text-muted-foreground">{availability.unavailable_reason === 'currency_account_missing' ? `Online top-ups require a ${availability.currency} account.` : 'Online top-ups are currently unavailable.'}</p>}
      <Button variant="ghost" size="icon-sm" aria-label="Refresh top-ups" title="Refresh top-ups" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}><IconRefresh size={16}/></Button>
    </div>
    {import.meta.env.DEV && (mockEnabled || orders.some(order => order.checkout_url?.startsWith('http://127.0.0.1:'))) && <Alert className="mock-payment-warning"><TriangleAlert aria-hidden="true"/><AlertTitle className="line-clamp-none">Mock payments · Real model costs</AlertTitle><AlertDescription>Top-ups are simulated. LLM requests still incur upstream Provider charges. Do not share this environment’s API keys publicly.</AlertDescription></Alert>}
    {loadError && <Alert variant="destructive"><AlertDescription>{loadError}<Button variant="outline" disabled={busy} onClick={() => loadFailure === 'older' ? void loadOlder() : setRevision(value => value + 1)}>Retry top-ups</Button></AlertDescription></Alert>}
    {loading && !availability && <p role="status" className="text-sm text-muted-foreground">Loading payments…</p>}
    {!loading && !loadError && orders.length === 0 && <section aria-labelledby="topup-history-title" className="flex min-h-60 flex-1 flex-col gap-3"><h3 id="topup-history-title" className="font-medium">Payment orders</h3><Empty><EmptyHeader><EmptyMedia variant="icon"><IconReceipt aria-hidden="true"/></EmptyMedia><EmptyTitle>No top-ups yet</EmptyTitle><EmptyDescription>Track pending, completed and unsuccessful top-ups here.</EmptyDescription></EmptyHeader></Empty></section>}
    {orders.length > 0 && <><h3 className="font-medium">Payment orders</h3><Table className="table-fixed" aria-label="Payment orders"><TableHeader><TableRow><TableHead className="hidden sm:table-cell">Date (UTC)</TableHead><TableHead>Amount</TableHead><TableHead className="w-40 sm:w-64">Status</TableHead></TableRow></TableHeader><TableBody>{orders.map(order => <TableRow key={order.id}><TableCell className="hidden sm:table-cell">{order.created_at ? new Date(order.created_at).toLocaleDateString(undefined, { timeZone: 'UTC' }) : '—'}</TableCell><TableCell className="whitespace-normal [overflow-wrap:anywhere]"><div>{money(order.amount_nanos, order.currency)}</div><div className="mt-1 text-xs text-muted-foreground sm:hidden">{order.created_at ? new Date(order.created_at).toLocaleDateString(undefined, { timeZone: 'UTC' }) : '—'} (UTC)</div></TableCell><TableCell className="whitespace-normal"><div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3"><span>{names[order.status]}</span><Button variant="ghost" size="sm" className="h-auto max-w-full whitespace-normal py-2 text-left" disabled={busy} onClick={event => { opener.current = event.currentTarget; resume(order); }}>{checkoutLink(order) ? 'Continue payment' : 'View details'}</Button></div></TableCell></TableRow>)}</TableBody></Table>{next && <Button variant="ghost" disabled={busy} onClick={() => void loadOlder()}>Older top-ups</Button>}</>}
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent onCloseAutoFocus={event => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } }}><DialogHeader><DialogTitle>{result ? 'Top-up' : 'Add credits'}</DialogTitle><DialogDescription>{result ? money(result.amount_nanos, result.currency) : `Add credits to your ${availability?.currency ?? ''} account balance, shared across workspaces.`}</DialogDescription></DialogHeader>
      {import.meta.env.DEV && (mockEnabled || !!result?.checkout_url?.startsWith('http://127.0.0.1:')) && <Alert className="mock-payment-warning"><TriangleAlert aria-hidden="true"/><AlertTitle className="line-clamp-none">Simulated funds do not cover real model costs</AlertTitle><AlertDescription>LLM requests still incur upstream Provider charges. Keep Niu API keys and upstream Provider keys private; do not offer public access to this test environment.</AlertDescription></Alert>}
      {result ? <><p>{names[result.status]}</p><p className="text-sm text-muted-foreground">{statusHelp[result.status]}</p>{link && <Button asChild><a href={link} target="_blank" rel="noopener noreferrer">Continue to payment</a></Button>}{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<Button variant="outline" disabled={busy} onClick={() => void checkResult()}>{busy ? 'Checking…' : 'Check payment status'}</Button></> : <form onSubmit={event => { event.preventDefault(); void create(); }} className="grid gap-4">
        <div className="grid gap-2"><Label htmlFor="topup-amount">Amount ({currencySymbol(availability?.currency ?? '')})</Label><Input id="topup-amount" inputMode="decimal" autoComplete="off" value={amount} disabled={busy || !!intent.current} onChange={event => setAmount(event.target.value)} /></div>
        <div className="grid gap-2"><Label>Payment method</Label><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={busy || !!intent.current} aria-label="Payment method">{method ? methodName(method) : 'Choose a payment method'}</Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={method} onValueChange={setMethod}>{availability?.payment_methods.map(value => <DropdownMenuRadioItem key={value} value={value}>{methodName(value)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <DialogFooter><Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Close</Button>{intent.current ? <Button type="button" variant="outline" disabled={busy} onClick={() => { setOpen(false); setRevision(value => value + 1); }}>{busy ? 'Preparing checkout…' : 'Check saved top-ups'}</Button> : <Button type="submit" disabled={busy || !canCreate || !availability?.available}>Continue</Button>}</DialogFooter>
      </form>}
    </DialogContent></Dialog>
  </section>;
}
