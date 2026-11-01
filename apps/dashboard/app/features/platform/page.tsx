import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { MetricStripSkeleton } from '@/components/PageSkeletons';
import { fetchQuery, invalidateQueries, peekQuery } from '@/lib/query-cache';
import { TriangleAlert, FlaskConical, CheckCircle2, CircleDashed, PauseCircle, Settings2 } from 'lucide-react';
import { IconBrandStripe, IconBrandAlipay, IconBrandWechat } from '@tabler/icons-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NavLink } from 'react-router';
import { useDashboardContext } from '@/shell/dashboard-context';
import { request } from '@/features/providers/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Settings = {revision: string; enabled: boolean; merchant_id: string; has_key: boolean; endpoint: string; notify_url: string; return_url: string; methods: string[]};
type GatewayVerification = {gateway:string;checkout_enabled:boolean;currency_supported:boolean;account_verified:boolean|null;callback_verified:boolean;ready:boolean};
type Configuration = { payment_gateways: {name: string; configured: boolean}[]; verification?: {currency_configured:boolean;gateways:GatewayVerification[]} };
export default function PlatformConfiguration() {
  const { token } = useDashboardContext();
  return <PaymentConfiguration key={token} token={token}/>;
}
function PaymentConfiguration({token}: {token: string}) {
  const { t: uiT, format: uiF } = useUILocale();
  const scope = token || 'public';
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);
  const initialConfig = peekQuery<{data: Configuration}>(scope, '/api/v1/platform/configuration')?.data ?? null;
  const initialPayment = peekQuery<{data: Settings}>(scope, '/api/v1/platform/payments/epay')?.data ?? null;
  const initialMock = peekQuery<{data: {available:boolean; enabled:boolean; readiness?:string}}>(scope, '/api/v1/platform/payments/mock')?.data ?? null;
  const [mock, setMock] = useState<{available:boolean; enabled:boolean; readiness?:string} | null>(() => initialMock);
  const [mockOpen, setMockOpen] = useState(false);
  const [mockEnabled, setMockEnabled] = useState(false);
  const [mockBusy, setMockBusy] = useState(false);
  const [mockError, setMockError] = useState('');
  const [configuration, setConfiguration] = useState<Configuration | null>(() => initialConfig);
  const [settings, setSettings] = useState<Settings | null>(() => initialPayment);
  const [savedSettings, setSavedSettings] = useState<Settings | null>(() => initialPayment);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(() => !initialConfig || !initialPayment);
  const stripeCheck = useRef<AbortController | null>(null);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeResult, setStripeResult] = useState('');
  const [stripeError, setStripeError] = useState('');
  const verificationRequest = useRef<AbortController|null>(null);
  const [verificationBusy,setVerificationBusy]=useState(false);
  const [verificationError,setVerificationError]=useState('');
  useEffect(()=>()=>verificationRequest.current?.abort(),[]);
  async function refreshVerification() {
    if(verificationRequest.current)return;
    const controller=new AbortController();verificationRequest.current=controller;setVerificationBusy(true);setVerificationError('');
    try {
      const result=await request<{data:Configuration}>(token,'/api/v1/platform/configuration','GET',undefined,controller.signal);
      if(!controller.signal.aborted)setConfiguration(result.data);
    } catch {
      if(!controller.signal.aborted){setVerificationError('Verification status could not be refreshed. Try again.');setConfiguration(previous=>previous?{...previous,verification:undefined}:previous);}
    } finally {
      if(verificationRequest.current===controller){verificationRequest.current=null;if(!controller.signal.aborted)setVerificationBusy(false);}
    }
  }
  useEffect(()=>{
    if(!configuration||open||mockOpen||stripeBusy)return;
    const refresh=()=>void refreshVerification();
    const timer=window.setInterval(refresh,30000);window.addEventListener('focus',refresh);
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[Boolean(configuration),open,mockOpen,stripeBusy,token]);

  useEffect(() => () => stripeCheck.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setKey('');
    const cachedCfg = peekQuery<{data: Configuration}>(scope, '/api/v1/platform/configuration')?.data;
    const cachedPay = peekQuery<{data: Settings}>(scope, '/api/v1/platform/payments/epay')?.data;
    const cachedMock = peekQuery<{data: {available:boolean; enabled:boolean; readiness?:string}}>(scope, '/api/v1/platform/payments/mock')?.data;
    if (cachedCfg && cachedPay) {
      setConfiguration(cachedCfg);
      setSettings(cachedPay);
      setSavedSettings(cachedPay);
      setLoading(false);
    } else if (!configuration) {
      setLoading(true);
    }
    if (cachedMock) setMock(cachedMock);
    const force = revision > 0;
    void Promise.all([
      fetchQuery(scope, '/api/v1/platform/configuration', signal => request<{data: Configuration}>(token, '/api/v1/platform/configuration', 'GET', undefined, signal), { signal: controller.signal, force, awaitRevalidate: true }),
      fetchQuery(scope, '/api/v1/platform/payments/epay', signal => request<{data: Settings}>(token, '/api/v1/platform/payments/epay', 'GET', undefined, signal), { signal: controller.signal, force, awaitRevalidate: true }),
    ])
      .then(([status, payment]) => { if (!controller.signal.aborted) {setConfiguration(status.data); setSettings(payment.data);setSavedSettings(payment.data);setKey('');} })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Payment gateways could not be loaded.'); })
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    void fetchQuery(scope, '/api/v1/platform/payments/mock', signal => request<{data:{available:boolean;enabled:boolean;readiness?:string}}>(token, '/api/v1/platform/payments/mock', 'GET', undefined, signal), { signal: controller.signal, force, awaitRevalidate: true })
      .then(result => {if (!controller.signal.aborted) setMock(result.data);})
      .catch(() => {if (!controller.signal.aborted) setMockError('Mock gateway status could not be loaded.');});
    return () => controller.abort();
  }, [scope, token, revision]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!settings || busy) return;
    const controller = new AbortController(); mutation.current = controller;
    setBusy(true); setError('');
    const {revision: expected_revision, has_key: _hasKey, ...input} = settings;
    try {
      const result = await request<{data: Settings}>(token, '/api/v1/platform/payments/epay', 'PUT', {...input, key, expected_revision}, controller.signal);
      if (controller.signal.aborted) return;
      invalidateQueries('/api/v1/platform/');
      setSettings(result.data);setSavedSettings(result.data);setKey('');setOpen(false);setRevision(value => value + 1);
    } catch (reason) {if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Payment configuration could not be saved.');}
    finally {if (mutation.current === controller) {mutation.current = null; if (!controller.signal.aborted) setBusy(false);}}
  }
  async function saveMock() {
    setMockBusy(true); setMockError('');
    const controller = new AbortController(); mutation.current = controller;
    try {
      const result = await request<{data:{available:boolean;enabled:boolean;readiness?:string}}>(token, '/api/v1/platform/payments/mock', 'PUT', {enabled:mockEnabled}, controller.signal);
      if (controller.signal.aborted) return;
      invalidateQueries('/api/v1/platform/');
      setMock(result.data);setMockOpen(false);setRevision(value => value+1);
      window.dispatchEvent(new Event('niu:payment-mode'));
    } catch (error) { if (!controller.signal.aborted) setMockError(error instanceof Error ? error.message : 'Mock gateway could not be saved.'); }
    finally {if (!controller.signal.aborted) setMockBusy(false);}
  }
  async function checkStripeAccount() {
    if (stripeCheck.current) return;
    const controller = new AbortController(); stripeCheck.current = controller;
    setStripeBusy(true); setStripeError(''); setStripeResult('');
    try {
      const response = await request<{data:{result:'account_enabled'|'account_disabled'|'credentials_rejected'|'check_unavailable'}}>(token, '/api/v1/platform/payments/stripe/verification', 'POST', undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (response.data.result === 'account_enabled') setStripeResult('Stripe reports that this account can accept charges. This check does not test checkout or payment notifications.');
      else if (response.data.result === 'account_disabled') setStripeError('Stripe has not enabled charges for this account. Complete the account requirements in Stripe, then check again.');
      else if (response.data.result === 'credentials_rejected') setStripeError('Stripe rejected the configured credentials. Ask your server administrator to update them, then check again.');
      else setStripeError('The account could not be checked. Ask your server administrator to check the Stripe credentials and connection, then retry.');
      await refreshVerification();
      if(!controller.signal.aborted)window.dispatchEvent(new Event('niu:payment-mode'));
    } catch (reason) {
      if (!controller.signal.aborted) {setStripeError(reason instanceof Error ? reason.message : 'The account could not be checked. Please retry.');await refreshVerification();}
    } finally {
      if (stripeCheck.current === controller) {stripeCheck.current = null;if (!controller.signal.aborted) setStripeBusy(false);}
    }
  }
  return <section className="@container space-y-5">
    {configuration && <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{uiT("Verify payment setup before offering a gateway to customers.")}</p><Button variant="outline" size="sm" disabled={verificationBusy} onClick={()=>void refreshVerification()}>{verificationBusy?uiT("Refreshing status…"):uiT("Refresh verification")}</Button></div>}
    {verificationError && <p role="alert" className="text-sm text-destructive">{verificationError}</p>}

    {mockError && !mockOpen && <p role="alert">{mockError}<Button variant="ghost" onClick={() => {setMockError('');setRevision(value => value+1);}}>{uiT("Retry mock gateway")}</Button></p>}
    {error && !open && <p role="alert">{error}<Button variant="ghost" onClick={() => setRevision(value => value + 1)}>{uiT("Retry")}</Button></p>}
    {loading && !configuration ? <MetricStripSkeleton count={2} label={uiT("Loading payment gateways…")} /> : configuration ? <div className="grid grid-cols-1 gap-4 @min-[42rem]:grid-cols-2" aria-label={uiT("Supported payment gateways")}>
      {configuration.payment_gateways.map(gateway => {
        const epay = gateway.name === 'EPay';
        const configured = gateway.configured && !(gateway.name === 'Stripe' && mock?.available);
        const enabled = configured && epay && savedSettings?.enabled === true;
        const proof=configuration.verification?.gateways.find(item=>item.gateway===gateway.name.toLowerCase());
        const status = !configured ? uiT("Not configured") : epay&&!enabled ? uiT("Disabled") : proof?.ready ? uiT("Verified") : proof ? uiT("Needs attention") : uiT("Configured");
        const StatusIcon = !configured ? CircleDashed : status==='Verified' ? CheckCircle2 : PauseCircle;
        return <Card key={gateway.name} className="gap-5 shadow-none" role="article" aria-label={gateway.name === 'Zhifux' ? uiT("ZhifuX") : gateway.name}>
          <CardHeader>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className={`flex h-12 items-center gap-2 rounded-xl px-3 ${gateway.name === 'Zhifux' ? 'bg-[#4f26c3]' : 'bg-muted'}`} aria-hidden="true">{epay ? <><IconBrandAlipay className="size-7 text-[#1677ff]"/><IconBrandWechat className="size-7 text-[#07a940]"/></> : gateway.name === 'Stripe' ? <IconBrandStripe className="size-8 text-[#635bff]"/> : <img src={`${import.meta.env.BASE_URL}payment-gateways/zhifux.png`} alt="" width={89} height={24} className="h-6 w-auto"/>}</div>
              <Badge variant="secondary" className={`gap-1.5 font-normal ${status==='Verified' ? 'text-[var(--success)]' : ''}`}><StatusIcon className="size-3.5"/>{status}</Badge>
            </div>
            <CardTitle className="text-base leading-6">{gateway.name === 'Zhifux' ? uiT("ZhifuX") : gateway.name}</CardTitle>
            <CardDescription>{epay ? uiT("Alipay and WeChat Pay through an EPay-compatible merchant.") : gateway.name === 'Stripe' ? uiT("Hosted checkout with your Stripe merchant account.") : uiT("Account top-ups through the ZhifuX native API.")}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-3 text-sm text-muted-foreground">{(!configured||!proof||(epay&&!enabled)) && <p>{epay ? configured ? enabled ? uiT("Enabled for checkout. Verify a payment before offering it to customers.") : uiT("Your configuration is saved. Enable it to accept payments.") : uiT("Add your merchant details and choose payment methods to get started.") : configured ? uiT("Managed by your deployment. Verify checkout and payment notifications before use.") : uiT("Merchant credentials must be configured in your deployment before checkout is available.")}</p>}{configured && <>{proof ? <><dl className="space-y-2" aria-label={uiF("{0} verification", [gateway.name])}>{gateway.name==='Stripe' && <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt>{uiT("Stripe account")}</dt><dd className="font-medium text-foreground">{proof.account_verified===true?uiT("Verified"):uiT("Check required")}</dd></div>}<div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt>{uiT("Payment notifications")}</dt><dd className="font-medium text-foreground">{proof.callback_verified?uiT("Verified"):uiT("Not verified")}</dd></div></dl>{!configuration.verification?.currency_configured ? <p>{uiT("Set the platform currency in")}{" "}<NavLink className="underline underline-offset-4" to="/admin/settings">{uiT("Admin Settings")}</NavLink>.</p> : !proof.currency_supported ? <p>{uiT("The checkout currency does not match the platform currency. Update this gateway’s checkout configuration.")}</p> : !proof.checkout_enabled ? <p>{uiT("Complete checkout configuration and enable a payment method.")}</p> : !proof.callback_verified ? <p>{uiT("Ask an account owner to complete a top-up in")}{" "}<NavLink className="underline underline-offset-4" to="?settings=billing">{uiT("Credits")}</NavLink>{uiT(", then refresh this status. Payment notifications must reach Niu and the top-up must settle. Use test credentials in a test installation.")}</p> : <p>{uiT("Payment delivery is verified for the current configuration.")}</p>}</> : <p>{uiT("Verification status is unavailable. Refresh verification before relying on this gateway.")}</p>}</>}{gateway.name === 'Stripe' && configured && <>{!proof?.account_verified && <p>{uiT("Check whether Stripe allows this account to accept charges. No payment is created.")}</p>}{stripeResult && <p role="status">{stripeResult}</p>}{stripeError && <p role="alert" className="text-destructive">{stripeError}</p>}</>}</CardContent>
          <CardFooter>{epay ? <Button variant="outline" size="sm" disabled={!savedSettings} onClick={() => {setSettings(savedSettings);setKey('');setError('');setOpen(true);}}><Settings2 aria-hidden="true"/>{uiT("Configure")}</Button> : gateway.name === 'Stripe' && configured ? <Button variant="outline" size="sm" disabled={stripeBusy || !mock} onClick={() => void checkStripeAccount()}>{stripeBusy ? uiT("Checking account…") : uiT("Check Stripe account")}</Button> : <span className="text-xs text-muted-foreground">{uiT("Configured by your server administrator")}</span>}</CardFooter>
        </Card>;
      })}
      <Card className="gap-5 shadow-none" role="article" aria-label={uiT("Mock payments")}>
        <CardHeader><div className="mb-3 flex items-center justify-between gap-3"><div className="flex size-12 items-center justify-center rounded-xl bg-muted text-primary"><FlaskConical className="size-7" aria-hidden="true"/></div><Badge variant="secondary" className={`gap-1.5 font-normal ${mock?.enabled ? 'text-[var(--warning)]' : ''}`}>{mock?.enabled ? <CheckCircle2 className="size-3.5"/> : <PauseCircle className="size-3.5"/>}{mock?.enabled ? uiT("Enabled") : mock?.available ? uiT("Disabled") : mock ? uiT("Unavailable") : mockError ? uiT("Status unavailable") : uiT("Loading…")}</Badge></div><CardTitle className="text-base leading-6">{uiT("Mock payments")}</CardTitle><CardDescription>{uiT("Simulated top-ups, checkout and payment notifications.")}</CardDescription></CardHeader>
        <CardContent className="flex-1 space-y-3 text-sm text-muted-foreground"><p>{mock?.available ? uiT("Test payment outcomes without a real merchant or moving money.") : uiT("Install and configure the mock payment plugin to make it available.")}</p><div className="mock-payment-warning rounded-lg border p-3"><p className="flex items-center gap-2 font-medium"><TriangleAlert className="size-4 shrink-0" aria-hidden="true"/>{uiT("Real model costs still apply")}</p><p className="mt-1 text-xs leading-5">{uiT("LLM calls incur upstream charges. Simulated funds do not pay for upstream usage.")}</p></div></CardContent>
        <CardFooter><Button variant="outline" size="sm" aria-label={uiT("Configure mock payments")} disabled={!mock?.available} onClick={() => {setMockEnabled(mock?.enabled ?? false);setMockError('');setMockOpen(true);}}><Settings2 aria-hidden="true"/>{uiT("Configure")}</Button></CardFooter>
      </Card>
    </div> : null}

    <Dialog open={mockOpen} onOpenChange={value => {if (!mockBusy) setMockOpen(value);}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{uiT("Configure mock payments")}</DialogTitle><DialogDescription>{uiT("Test checkout, notifications and account funding without a real payment merchant. Saved changes apply immediately and persist across restarts.")}</DialogDescription></DialogHeader><Alert className="mock-payment-warning"><TriangleAlert aria-hidden="true"/><AlertTitle className="line-clamp-none">{uiT("LLM calls still cost real money")}</AlertTitle><AlertDescription>{uiT("Only payments are simulated. LLM requests still incur upstream Provider charges. Simulated funds do not pay for upstream usage.")}</AlertDescription></Alert><div className="flex items-center gap-2"><Checkbox id="mock-enabled" checked={mockEnabled} disabled={mockBusy} onCheckedChange={value => setMockEnabled(value === true)}/><Label htmlFor="mock-enabled">{uiT("Enable mock payments")}</Label></div><p className="text-sm text-muted-foreground">{uiT("Disable other payment gateways before enabling. Turning this off stops new mock checkouts; notifications for existing test orders continue.")}</p>{mockError && <p role="alert" className="text-destructive">{mockError}</p>}<DialogFooter><Button variant="outline" disabled={mockBusy} onClick={() => setMockOpen(false)}>{uiT("Cancel")}</Button><Button disabled={mockBusy} onClick={() => void saveMock()}>{mockBusy ? uiT("Saving…") : uiT("Save")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={open} onOpenChange={value => {if (!busy) {setOpen(value);setKey('');}}}><DialogContent className="niu-modal max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{uiT("Configure EPay")}</DialogTitle><DialogDescription>{uiT("Connect your domestic payment gateway to company balance top-ups.")}</DialogDescription></DialogHeader>{settings && <form className="space-y-4" onSubmit={event => void save(event)}>
      <div className="flex items-center gap-2"><Checkbox id="epay-enabled" checked={settings.enabled} disabled={busy} onCheckedChange={value => setSettings({...settings, enabled:value === true})}/><Label htmlFor="epay-enabled">{uiT("Enable EPay")}</Label></div>
      {([['merchant_id','Merchant ID'],['endpoint','Gateway URL'],['notify_url','Notification URL'],['return_url','Return URL']] as const).map(([field,label]) => <div className="space-y-2" key={field}><Label htmlFor={'epay-' + field}>{uiT(label)}</Label><Input id={'epay-' + field} type={field === 'merchant_id' ? 'text' : 'url'} maxLength={2048} required={settings.enabled} disabled={busy} value={settings[field]} onChange={event => setSettings({...settings,[field]:event.target.value})}/></div>)}
      <div className="space-y-2"><Label htmlFor="epay-key">{uiT("Merchant key")}</Label><Input id="epay-key" type="password" autoComplete="new-password" maxLength={512} required={settings.enabled && !settings.has_key} disabled={busy} value={key} placeholder={settings.has_key ? uiT("Leave blank to keep the saved key") : ''} onChange={event => setKey(event.target.value)}/></div>
      <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium">{uiT("Enabled payment methods")}</legend>{[['alipay','Alipay'],['wxpay','WeChat Pay']].map(([method,label]) => <div className="flex items-center gap-2" key={method}><Checkbox id={'epay-' + method} checked={settings.methods.includes(method)} disabled={busy} onCheckedChange={checked => setSettings({...settings,methods:checked === true ? [...settings.methods,method] : settings.methods.filter(value => value !== method)})}/><Label htmlFor={'epay-' + method}>{label}</Label></div>)}</fieldset>
      {error && <p role="alert" className="text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => {setOpen(false);setRevision(value => value + 1);}}>{uiT("Cancel")}</Button><Button disabled={busy}>{busy ? uiT("Saving…") : uiT("Save")}</Button></DialogFooter>
    </form>}</DialogContent></Dialog>
  </section>;
}
