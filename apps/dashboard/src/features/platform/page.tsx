import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useDashboardContext } from '@/app/dashboard-context';
import { request } from '@/features/vendors/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

type Settings = {revision: string; enabled: boolean; merchant_id: string; has_key: boolean; endpoint: string; notify_url: string; return_url: string; methods: string[]};
type Configuration = { payment_gateways: {name: string; configured: boolean}[] };
export default function PlatformConfiguration() {
  const { token } = useDashboardContext();
  return <PaymentConfiguration key={token} token={token}/>;
}
function PaymentConfiguration({token}: {token: string}) {
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savedSettings, setSavedSettings] = useState<Settings | null>(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController(); setError('');setLoading(true);
    setConfiguration(null);setSettings(null);setSavedSettings(null);setKey('');
    void Promise.all([request<{data: Configuration}>(token, '/admin/v1/platform/configuration', 'GET', undefined, controller.signal),request<{data: Settings}>(token, '/admin/v1/platform/payments/epay', 'GET', undefined, controller.signal)])
      .then(([status, payment]) => { if (!controller.signal.aborted) {setConfiguration(status.data); setSettings(payment.data);setSavedSettings(payment.data);setKey('');} }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Payment gateways could not be loaded.'); }).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [token, revision]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!settings || busy) return;
    const controller = new AbortController(); mutation.current = controller;
    setBusy(true); setError('');
    const {revision: expected_revision, has_key: _hasKey, ...input} = settings;
    try {
      const result = await request<{data: Settings}>(token, '/admin/v1/platform/payments/epay', 'PUT', {...input, key, expected_revision}, controller.signal);
      if (controller.signal.aborted) return;
      setSettings(result.data);setSavedSettings(result.data);setKey('');setOpen(false);setRevision(value => value + 1);
    } catch (reason) {if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Payment configuration could not be saved.');}
    finally {if (mutation.current === controller) {mutation.current = null; if (!controller.signal.aborted) setBusy(false);}}
  }
  return <section className="space-y-5 py-5">
    {error && !open && <p role="alert">{error}<Button variant="ghost" onClick={() => setRevision(value => value + 1)}>Retry</Button></p>}
    {loading ? <p role="status">Loading payment gateways…</p> : configuration ? <Table className="payment-gateway-table">
      <TableHeader><TableRow><TableHead>Gateway</TableHead><TableHead className="hidden sm:table-cell">Status</TableHead><TableHead className="w-28"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
      <TableBody>{configuration.payment_gateways.filter(gateway => gateway.name === 'EPay' || gateway.configured).map(gateway => {
        const status = gateway.name === 'EPay' ? savedSettings?.enabled ? 'Enabled' : 'Disabled' : gateway.configured ? 'Configured' : 'Not configured';
        return <TableRow key={gateway.name}>
          <TableCell className="whitespace-normal">{gateway.name === 'EPay' ? 'EPay · Alipay / WeChat Pay' : gateway.name}<dl className="mt-2 sm:hidden"><dt className="text-xs text-muted-foreground">Status</dt><dd>{status}</dd></dl></TableCell>
          <TableCell className="hidden sm:table-cell">{status}</TableCell>
          <TableCell className="text-right align-top sm:align-middle">{gateway.name === 'EPay' && <Button variant="outline" size="sm" disabled={!savedSettings} onClick={() => {setSettings(savedSettings);setKey('');setError('');setOpen(true);}}>Configure</Button>}</TableCell>
        </TableRow>;
      })}</TableBody>
    </Table> : null}

    <Dialog open={open} onOpenChange={value => {if (!busy) {setOpen(value);setKey('');}}}><DialogContent className="niu-modal max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Configure EPay</DialogTitle><DialogDescription>Connect your domestic payment gateway to company balance top-ups.</DialogDescription></DialogHeader>{settings && <form className="space-y-4" onSubmit={event => void save(event)}>
      <div className="flex items-center gap-2"><Checkbox id="epay-enabled" checked={settings.enabled} disabled={busy} onCheckedChange={value => setSettings({...settings, enabled:value === true})}/><Label htmlFor="epay-enabled">Enable EPay</Label></div>
      {([['merchant_id','Merchant ID'],['endpoint','Gateway URL'],['notify_url','Notification URL'],['return_url','Return URL']] as const).map(([field,label]) => <div className="space-y-2" key={field}><Label htmlFor={'epay-' + field}>{label}</Label><Input id={'epay-' + field} type={field === 'merchant_id' ? 'text' : 'url'} maxLength={2048} required={settings.enabled} disabled={busy} value={settings[field]} onChange={event => setSettings({...settings,[field]:event.target.value})}/></div>)}
      <div className="space-y-2"><Label htmlFor="epay-key">Merchant key</Label><Input id="epay-key" type="password" autoComplete="new-password" maxLength={512} required={settings.enabled && !settings.has_key} disabled={busy} value={key} placeholder={settings.has_key ? 'Leave blank to keep the saved key' : ''} onChange={event => setKey(event.target.value)}/></div>
      <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium">Enabled payment methods</legend>{[['alipay','Alipay'],['wxpay','WeChat Pay']].map(([method,label]) => <div className="flex items-center gap-2" key={method}><Checkbox id={'epay-' + method} checked={settings.methods.includes(method)} disabled={busy} onCheckedChange={checked => setSettings({...settings,methods:checked === true ? [...settings.methods,method] : settings.methods.filter(value => value !== method)})}/><Label htmlFor={'epay-' + method}>{label}</Label></div>)}</fieldset>
      {error && <p role="alert" className="text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => {setOpen(false);setRevision(value => value + 1);}}>Cancel</Button><Button disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></DialogFooter>
    </form>}</DialogContent></Dialog>
  </section>;
}
