import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { ArrowLeft, CheckCircle2, ChevronDown, Clock3, FlaskConical, RefreshCw, Send, TriangleAlert } from 'lucide-react';
import './style.css';

type Delivery = { attempts: number; delivered: number; last_status: number | null; event_type: string; due: number; retry_allowed: boolean; retried: boolean; history: {sent: number; status: number}[] };
type Checkout = { test: true; amount: number; currency: string; outcome: string; readiness: string; return_url: string; deliveries: Delivery[] };
const scenarios: Record<string, {label: string; detail: string; expected: string}> = {
  success: {label: 'Successful payment', detail: 'Send a signed payment confirmation immediately.', expected: 'Niu should settle the top-up and credit the account exactly once.'},
  failure: {label: 'Payment declined', detail: 'Expire the checkout without payment.', expected: 'No credit. An administrator can reconcile the unpaid order in Niu to close it.'},
  cancel: {label: 'Customer cancels', detail: 'Cancel the checkout without payment.', expected: 'No credit. An administrator can reconcile the cancelled order in Niu to close it.'},
  timeout: {label: 'Payment timeout', detail: 'Leave the checkout open and send no notification.', expected: 'The order should remain pending with no balance change.'},
  delayed: {label: 'Delayed confirmation', detail: 'Schedule a signed payment confirmation for 15 seconds from now.', expected: 'Niu should credit once after verified evidence arrives. Returning to Niu alone must not credit funds.'},
  duplicate: {label: 'Duplicate confirmation', detail: 'Send the same successful event twice, one second apart.', expected: 'Both deliveries may be accepted, but Niu should create only one settlement and credit.'},
  out_of_order: {label: 'Out-of-order events', detail: 'Send success, then a stale unpaid event one second later.', expected: 'The successful credit must remain unchanged. Niu currently rejects the unsupported stale event.'},
};
const eventNames: Record<string, string> = { 'checkout.session.completed': 'Payment confirmed', 'checkout.session.expired': 'Checkout expired', 'checkout.session.async_payment_failed': 'Stale payment failure' };
const time = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
function App() {
  const [checkout, setCheckout] = useState<Checkout>();
  const [scenario, setScenario] = useState('success');
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState<number>();
  const mutating = useRef(false);
  const endpoint = import.meta.env.BASE_URL + 'api/checkouts/' + location.pathname.split('/').pop();
  async function load() {
    if (mutating.current) return;
    try {
      const response = await fetch(endpoint, {cache:'no-store'});
      if (!response.ok) throw new Error(response.status === 404 ? 'Checkout not found. Return to Niu and reopen a saved test top-up.' : 'Cannot reach the test service. Check that it is running, then refresh.');
      const data: Checkout = await response.json();
      if (!mutating.current) { setCheckout(data); setUpdated(Date.now()); setLoadError(''); }
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Could not load checkout.'); }
  }
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 2000); return () => clearInterval(timer); }, []);
  async function act(command: {outcome: string} | {retry: number}) {
    mutating.current = true; setBusy(true); setActionError('');
    try {
      const response = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(command)});
      if (!response.ok) throw new Error('The request could not be completed. Refresh to check the saved result before trying again.');
      setCheckout(await response.json()); setUpdated(Date.now());
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not save the test result.'); }
    finally { mutating.current = false; setBusy(false); }
  }
  const complete = checkout && checkout.outcome !== 'pending';
  const selected = scenarios[complete ? checkout.outcome : scenario];
  const amount = checkout ? new Intl.NumberFormat('en', {style:'currency',currency:checkout.currency.toUpperCase()}).format(checkout.amount/100) : '—';
  const accepted = checkout?.deliveries.filter(item => item.delivered).length ?? 0;
  return <div className="mock-shell">
    <header className="mock-header"><div className="flex items-center gap-3"><strong className="text-lg">Niu</strong><span className="text-muted-foreground">/</span><span>Payment sandbox</span></div><Badge variant="secondary"><FlaskConical aria-hidden="true"/>Test environment</Badge></header>
    <main>
      <Alert className="mock-payment-warning rounded-none"><TriangleAlert aria-hidden="true"/><AlertTitle className="line-clamp-none">Mock payments · Real model costs</AlertTitle><AlertDescription>Only payments are simulated. LLM requests still incur upstream Provider charges. Simulated funds do not pay for upstream model usage.</AlertDescription></Alert>
      <div className="mock-checkout">
        <section className="mock-summary" aria-label="Order summary">
          {checkout && <Button asChild variant="ghost" className="self-start -ml-3"><a href={checkout.return_url}><ArrowLeft/>Back to Niu</a></Button>}
          <div><p className="mock-eyebrow">Account top-up</p><h1 className="mock-amount">{amount}</h1></div>
          <p className="text-sm text-muted-foreground">This top-up is simulated. It does not pay for real upstream model usage.</p>
        </section>
        <section className="mock-action" aria-label="Test payment">
          <div><p className="mock-eyebrow">{complete ? 'Saved scenario' : 'Simulate a payment'}</p><h2>{complete ? selected?.label : 'Choose a test scenario'}</h2><p className="text-muted-foreground mt-2">{complete ? 'The result is saved. Follow delivery progress below.' : 'Run one scenario per order, then verify the outcome in Niu.'}</p></div>
          {(loadError || actionError) && <Alert variant="destructive"><TriangleAlert/><AlertDescription>{loadError || actionError}<Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>Refresh checkout</Button></AlertDescription></Alert>}
          {!checkout && !loadError && <p role="status">Loading saved checkout…</p>}
          {checkout && <>
            {checkout.readiness !== 'ready' && <Alert><TriangleAlert/><AlertDescription>Merchant simulation: {checkout.readiness}. New checkout and reconciliation requests are blocked; existing notifications continue.</AlertDescription></Alert>}
            {!complete && <div className="grid gap-2"><Label htmlFor="scenario">Test scenario</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="scenario" variant="outline" disabled={busy || !!loadError} aria-label="Test scenario" className="justify-between">{selected.label}<ChevronDown/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={scenario} onValueChange={setScenario}>{Object.entries(scenarios).map(([key,value])=><DropdownMenuRadioItem key={key} value={key}>{value.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>}
            <div className="mock-expectation"><p>{selected?.detail}</p><h3>Expected in Niu</h3><p className="text-muted-foreground">{selected?.expected}</p></div>
            {!complete ? <Button className="self-start" disabled={busy || !!loadError} onClick={() => void act({outcome:scenario})}><Send/>{busy ? 'Saving scenario…' : 'Run simulation'}</Button> : <div className="flex flex-wrap items-center gap-3"><Button asChild><a href={checkout.return_url}>Check result in Niu</a></Button><span className="text-sm text-muted-foreground">Create a new top-up to test another scenario.</span></div>}
          </>}
        </section>
      </div>
      <section className="mock-deliveries" aria-labelledby="deliveries-heading">
        <div className="mock-section-heading"><div><h2 id="deliveries-heading">Event deliveries</h2><p className="text-muted-foreground text-sm">{complete ? `${accepted} of ${checkout.deliveries.length} notifications accepted by Niu` : 'Signed notifications will appear here after the simulation starts.'}</p></div><Button variant="ghost" size="sm" disabled={busy} onClick={() => void load()}><RefreshCw/>Refresh</Button></div>
        <p className="text-sm text-muted-foreground">Delivery acceptance confirms the HTTP response. Verify settlement and balance separately in Niu.</p>
        {!checkout?.deliveries.length ? <div className="mock-empty"><Clock3 aria-hidden="true"/><p>{checkout?.outcome === 'timeout' ? 'No notification is sent for a timeout. The order remains pending.' : 'No events yet. Choose a scenario above to begin.'}</p></div> : <div className="mock-events">{checkout.deliveries.map((event,index) => {
          const status = event.delivered ? 'Accepted' : event.retried ? 'Resent' : event.attempts >= 8 ? 'Retries exhausted' : event.attempts ? 'Retry scheduled' : 'Scheduled';
          return <article key={index} className="mock-event" aria-label={`Notification ${index+1}`}>
            <div className="mock-section-heading"><div className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground text-sm">{index+1}.</span><h3>{eventNames[event.event_type] ?? 'Payment notification'}</h3><Badge variant={event.attempts >= 8 && !event.delivered && !event.retried ? 'destructive' : 'secondary'}>{event.delivered ? <CheckCircle2/> : <Clock3/>}{status}</Badge></div>{event.retry_allowed && <Button variant="outline" size="sm" disabled={busy || !!loadError} onClick={() => void act({retry:index+1})}><RefreshCw/>Resend notification {index+1}</Button>}</div>
            <p className="text-sm text-muted-foreground">{event.attempts} {event.attempts === 1 ? 'attempt' : 'attempts'}{!event.delivered && event.attempts < 8 ? ` · Next delivery at ${time(event.due)}` : ''}{event.last_status === 0 ? ' · Could not connect to Niu. Check the gateway before retrying.' : ''}</p>
            {!!event.history.length && <Table><TableHeader><TableRow><TableHead>Attempt</TableHead><TableHead>Time</TableHead><TableHead>Response</TableHead></TableRow></TableHeader><TableBody>{event.history.map((attempt,attemptIndex)=><TableRow key={attemptIndex}><TableCell>{attemptIndex+1}</TableCell><TableCell className="tabular-nums">{time(attempt.sent)}</TableCell><TableCell>{attempt.status ? `HTTP ${attempt.status}` : 'Connection failed'}</TableCell></TableRow>)}</TableBody></Table>}
            {!event.delivered && event.last_status && event.last_status >= 400 ? <p className="text-sm text-muted-foreground">Niu rejected this notification. Compare it with the expected outcome above; unsupported unpaid events require administrator reconciliation.</p> : null}
          </article>;
        })}</div>}
        <p className="text-xs text-muted-foreground mt-4" role="status">{loadError ? checkout ? 'Connection interrupted · showing last saved information' : 'Checkout unavailable' : updated ? `Auto-refresh every 2 seconds · Updated ${time(updated/1000)}` : 'Connecting to test service…'}</p>
      </section>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
