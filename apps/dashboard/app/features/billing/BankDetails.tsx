import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { request } from '@/features/providers/api';
import { useLocale } from '@/shell/ui-locale';

type Details = { beneficiary: string; bank: string; account: string; currency: string };
type Configuration = { revision: string; details: Details | null };
const empty: Details = { beneficiary: '', bank: '', account: '', currency: '' };
const fields = [
  ['beneficiary', 'Account holder', '收款户名'], ['bank', 'Bank name', '开户行'],
  ['account', 'Account number', '收款账号'], ['currency', 'Currency', '币种'],
] as const;
const endpoint = '/api/v1/admin/payments/bank';

export function BankConfiguration({ token }: { token: string }) {
  const { t } = useLocale();
  const [config, setConfig] = useState<Configuration | null>(null);
  const [draft, setDraft] = useState(empty);
  const [action, setAction] = useState<'edit' | 'remove' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const edit = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    request<{ data: Configuration }>(token, endpoint, 'GET', undefined, controller.signal)
      .then(r => { if (!controller.signal.aborted) setConfig(r.data); })
      .catch(() => { if (!controller.signal.aborted) setError(t('Could not load bank details.', '无法读取收款资料。')); });
    return () => controller.abort();
  }, [token, refresh]);
  async function save() {
    if (!config || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await request<{ data: Configuration }>(token, endpoint, 'PUT', {
        revision: config.revision, details: action === 'remove' ? null : draft,
      });
      setConfig(result.data);
      setAction(null);
    } catch {
      setError(t('Could not save bank details. Close and refresh before retrying.', '无法保存收款资料，请关闭并刷新后重试。'));
    } finally { setBusy(false); }
  }
  return <section className="space-y-2" aria-label={t('Bank transfer', '对公转账')}>
    <h2 className="font-medium">{t('Bank transfer', '对公转账')}</h2>
    {!(error && !config) && <p className="text-sm text-muted-foreground">{config?.details ? [config.details.beneficiary, config.details.bank, config.details.currency].join(' · ') :
      config ? t('Hidden from customers until configured.', '配置后才会向客户展示。') : t('Loading…', '加载中…')}</p>}
    <div className="flex gap-2">
      <Button ref={edit} variant="outline" disabled={!config} onClick={e => {
        trigger.current=e.currentTarget; setDraft(config?.details ?? empty); setError(''); setAction('edit');
      }}>{t('Configure bank details', '配置收款资料')}</Button>
      {config?.details && <Button variant="ghost" onClick={e => { trigger.current=e.currentTarget; setError(''); setAction('remove'); }}>{t('Remove details', '移除资料')}</Button>}
    </div>
    {error && !action && <p role="alert">{error} <Button variant="ghost" onClick={() => setRefresh(v => v+1)}>{t('Refresh', '刷新')}</Button></p>}
    <Dialog open={action !== null} onOpenChange={open => { if (!open && !busy) setAction(null); }}>
      <DialogContent  onCloseAutoFocus={e => {
        e.preventDefault(); (trigger.current?.isConnected ? trigger.current : edit.current)?.focus();
      }}>
        <DialogHeader><DialogTitle>{action === 'remove' ? t('Remove bank details?', '移除收款资料？') : t('Bank details', '收款资料')}</DialogTitle>
          <DialogDescription>{action === 'remove' ? t('Customers will no longer see these transfer instructions.', '客户将不再看到这组汇款指引。') :
            t('These details will appear on the customer billing page.', '这些资料将显示在客户账单页。')}</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={e => { e.preventDefault(); void save(); }}>
          {action === 'edit' && fields.map(([field,en,zh]) => <div className="grid gap-2" key={field}>
            <Label htmlFor={'bank-'+field}>{t(en,zh)}</Label>
            <Input id={'bank-'+field} required maxLength={field === 'currency' ? 3 : 200} pattern={field === 'currency' ? '[A-Z]{3}' : undefined} value={draft[field]}
              onChange={e => setDraft({...draft,[field]:field === 'currency' ? e.target.value.toUpperCase() : e.target.value})}/>
          </div>)}
          {error && <p role="alert">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setAction(null)}>{t('Cancel','取消')}</Button>
            <Button disabled={busy} type="submit">{action === 'remove' ? t('Remove','移除') : t('Save','保存')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>;
}

export function CustomerBankDetails({ token, organization, revision }: {token: string; organization: string; revision: number}) {
  const { t } = useLocale();
  const [details, setDetails] = useState<(Details & {memo:string}) | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setDetails(null);
    request<{data: (Details & {memo:string}) | null}>(token, '/api/v1/organizations/'+organization+'/billing/bank', 'GET', undefined, controller.signal)
      .then(r => { if (!controller.signal.aborted) setDetails(r.data); }).catch(() => { /* Transfer instructions stay hidden when they cannot be loaded. */ });
    return () => controller.abort();
  },[token,organization,revision]);
  if (!details) return null;
  return <section className="grid gap-2"><h3 className="font-medium">{t('Bank transfer','对公转账')}</h3>
    <dl className="grid gap-2 text-sm">{[...fields,['memo','Transfer memo','汇款备注'] as const].map(([field,en,zh]) =>
      <div key={field} className="grid gap-1 sm:grid-cols-[10rem_1fr]"><dt className="text-muted-foreground">{t(en,zh)}</dt>
      <dd className="select-all break-words">{details[field]}</dd></div>)}</dl>
    <p className="text-sm text-muted-foreground">{t('Include the transfer memo so your payment can be matched to your account.', '汇款时请填写此备注，以便核对您的账户。')}</p>
  </section>;
}
