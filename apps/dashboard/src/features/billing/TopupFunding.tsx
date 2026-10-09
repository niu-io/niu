import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { IconRefresh, IconReceipt } from '@tabler/icons-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { request } from '@/features/vendors/api';
import { amountToNanos, money } from '@/lib/money';

type PaymentGateway = 'epay' | 'stripe' | 'zhifux';
type Availability = { currency: string; payment_gateway: PaymentGateway | null; available: boolean; payment_methods: string[]; unavailable_reason: string | null };
type Topup = { id: string; currency: string; amount_nanos: string; payment_method: string; status: 'pending' | 'paid' | 'closed' | 'reconciliation_required'; checkout_url: string | null; created_at?: string };
const names = { pending: 'Awaiting payment', paid: 'Paid', closed: 'Closed', reconciliation_required: 'Checking payment' };
const methodName = (method: string) => ({ wxpaynative: 'WeChat Pay', alipay: 'Alipay' }[method] ?? method);
function checkoutLink(order: Topup) {
  if (order.status !== 'pending' || !order.checkout_url) return null;
  try {
    const url = new URL(order.checkout_url);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash ? url.href : null;
  } catch { return null; }
}

/** Company payment workflow; the backend owns intent, history and settlement. */
export default function TopupFunding({ token, organization, canCreate, currencies, onPaid }: { token: string; organization: string; canCreate: boolean; currencies?: string[]; onPaid: () => void }) {
  const currencyChoices = [...new Set(currencies?.filter(currency => ['CNY', 'USD'].includes(currency)) ?? [])].sort();
  const currencyStamp = currencyChoices.join('|');
  const [currency, setCurrency] = useState(currencyChoices[0] ?? '');
  useEffect(() => { setCurrency(current => currencyChoices.includes(current) ? current : currencyChoices[0] ?? ''); }, [currencyStamp]);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [orders, setOrders] = useState<Topup[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<'latest' | 'older' | null>(null);
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
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
    void Promise.all([
      request<{ data: Availability }>(token, `/admin/v1/organizations/${organization}/billing/payment-methods${currency ? '?currency=' + encodeURIComponent(currency) : ''}`, 'GET', undefined, controller.signal),
      request<{ data: Topup[]; next_cursor: string | null }>(token, `/admin/v1/organizations/${organization}/billing/topups`, 'GET', undefined, controller.signal),
    ]).then(([methods, history]) => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(methods.data?.payment_methods) || typeof methods.data.available !== 'boolean' || !Array.isArray(history.data) || history.next_cursor === undefined) throw new Error('Invalid payment response');
      if (!['CNY', 'USD'].includes(methods.data.currency) || (methods.data.available && !['epay', 'stripe', 'zhifux'].includes(methods.data.payment_gateway ?? ''))) throw new Error('Invalid payment integration');
      if (currency && methods.data.currency !== currency) throw new Error('Mismatched payment currency');
      setAvailability(methods.data); setOrders(history.data); setNext(history.next_cursor);
      setMethod(current => methods.data.payment_methods.includes(current) ? current : methods.data.payment_methods[0] ?? '');
      for (const order of history.data) if (order.status === 'paid' && !paidSeen.current.has(order.id)) { paidSeen.current.add(order.id); onPaid(); }
      setResult(current => current ? history.data.find(order => order.id === current.id) ?? current : current);
    }).catch(() => { if (!controller.signal.aborted) { setAvailability(null); setLoadFailure('latest'); setLoadError('Could not load payment options and saved top-ups.'); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
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
      const response = await request<{ data: Topup }>(token, `/admin/v1/organizations/${organization}/billing/topups`, 'POST', intent.current, controller.signal);
      if (!controller.signal.aborted) { setResult(response.data); setRevision(value => value + 1); }
    } catch {
      if (!controller.signal.aborted) { setError('Checkout was not confirmed. Check saved top-ups before starting another payment.'); setRevision(value => value + 1); }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const loadOlder = async () => {
    if (!next || busy) return;
    const controller = new AbortController(); older.current = controller; setBusy(true); setLoadError(''); setLoadFailure(null);
    try {
      const page = await request<{ data: Topup[]; next_cursor: string | null }>(token, `/admin/v1/organizations/${organization}/billing/topups?before=${encodeURIComponent(next)}`, 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
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
      const response = await request<{ data: Topup }>(token, `/admin/v1/organizations/${organization}/billing/topups/${result.id}`, 'GET', undefined, controller.signal);
      if (!controller.signal.aborted) { setResult(response.data); setRevision(value => value + 1); if (response.data.status === 'paid') onPaid(); }
    } catch { if (!controller.signal.aborted) setError('Could not check payment status. Try again.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const begin = () => { if (busy) return; intent.current = null; setResult(null); setAmount(''); setError(''); setOpen(true); };
  const link = result && checkoutLink(result);
  return <section aria-label="Account top-ups" className="grid gap-3" aria-busy={loading}>
    <div className="flex flex-wrap items-center gap-3">
      {canCreate && currencyChoices.length > 1 && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" aria-label="Funding currency" disabled={busy || open}>{currency}</Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={currency} onValueChange={value => { if (busy || open) return; setAvailability(null); setAmount(''); setMethod(''); setResult(null); intent.current = null; setCurrency(value); }}>{currencyChoices.map(value => <DropdownMenuRadioItem key={value} value={value}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}
      {canCreate && availability?.available && <Button disabled={busy} onClick={begin}>Add funds</Button>}
      {canCreate && availability && !availability.available && <p className="text-sm text-muted-foreground">{availability.unavailable_reason === 'currency_account_missing' ? `Online top-ups require a ${availability.currency} account.` : 'Online top-ups are currently unavailable.'}</p>}
      <Button variant="ghost" size="icon-sm" aria-label="Refresh top-ups" title="Refresh top-ups" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}><IconRefresh size={16}/></Button>
    </div>
    {loadError && <Alert variant="destructive"><AlertDescription>{loadError}<Button variant="outline" disabled={busy} onClick={() => loadFailure === 'older' ? void loadOlder() : setRevision(value => value + 1)}>Retry top-ups</Button></AlertDescription></Alert>}
    {loading && !availability && <p role="status" className="text-sm text-muted-foreground">Loading payments…</p>}
    {!loading && !loadError && orders.length === 0 && <section aria-labelledby="topup-history-title" className="flex min-h-60 flex-1 flex-col gap-3"><h3 id="topup-history-title" className="font-medium">Top-up history</h3><Empty><EmptyHeader><EmptyMedia variant="icon"><IconReceipt aria-hidden="true"/></EmptyMedia><EmptyTitle>No top-ups yet</EmptyTitle><EmptyDescription>Pending and completed top-ups appear here.</EmptyDescription></EmptyHeader></Empty></section>}
    {orders.length > 0 && <><h3 className="font-medium">Top-up history</h3><Table><TableHeader><TableRow><TableHead>Date (UTC)</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{orders.map(order => <TableRow key={order.id}><TableCell>{order.created_at ? new Date(order.created_at).toLocaleDateString(undefined, { timeZone: 'UTC' }) : '—'}</TableCell><TableCell>{money(order.amount_nanos, order.currency)}</TableCell><TableCell>{names[order.status]}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" disabled={busy} onClick={() => resume(order)}>{checkoutLink(order) ? 'Continue payment' : 'View details'}</Button></TableCell></TableRow>)}</TableBody></Table>{next && <Button variant="ghost" disabled={busy} onClick={() => void loadOlder()}>Older top-ups</Button>}</>}
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent><DialogHeader><DialogTitle>{result ? 'Top-up' : 'Add funds'}</DialogTitle><DialogDescription>{result ? money(result.amount_nanos, result.currency) : `Add funds to your ${availability?.currency ?? ''} account balance, shared across workspaces.`}</DialogDescription></DialogHeader>
      {result ? <><p>{names[result.status]}</p>{link && <Button asChild><a href={link} target="_blank" rel="noopener noreferrer">Continue to payment</a></Button>}{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<Button variant="outline" disabled={busy} onClick={() => void checkResult()}>{busy ? 'Checking…' : 'Check payment status'}</Button></> : <form onSubmit={event => { event.preventDefault(); void create(); }} className="grid gap-4">
        <div className="grid gap-2"><Label htmlFor="topup-amount">Amount ({availability?.currency})</Label><Input id="topup-amount" inputMode="decimal" autoComplete="off" value={amount} disabled={busy || !!intent.current} onChange={event => setAmount(event.target.value)} /></div>
        <div className="grid gap-2"><Label>Payment method</Label><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={busy || !!intent.current} aria-label="Payment method">{method ? methodName(method) : 'Choose a payment method'}</Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={method} onValueChange={setMethod}>{availability?.payment_methods.map(value => <DropdownMenuRadioItem key={value} value={value}>{methodName(value)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <DialogFooter><Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Close</Button>{intent.current ? <Button type="button" variant="outline" disabled={busy} onClick={() => { setOpen(false); setRevision(value => value + 1); }}>{busy ? 'Preparing checkout…' : 'Check saved top-ups'}</Button> : <Button type="submit" disabled={busy || !canCreate || !availability?.available}>Continue</Button>}</DialogFooter>
      </form>}
    </DialogContent></Dialog>
  </section>;
}
