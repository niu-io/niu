import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Activity, ArrowUpRight, Clock3, Database, Plus, RefreshCw, Trash2, Upload, WalletCards } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { ScopeFocus } from '../types';

type Named = { id: string; name: string };
type Account = {
  id: string; provider: string; plan: string; authentication_mode: string;
  billing_mode: string; credential_revision: number; health: string;
  concurrency_limit: number; refreshing: boolean;
};
type LinkedExecution = { id: string; task_id: string; source: string; record_id: string; imported_at: string };
type QuotaWindow = {
  window_key: string; unit: string; remaining: string | null; maximum: string | null;
  observed_at_ms: number; valid_until_ms: number; resets_at_ms: number; source: string;
  previous_remaining: string | null; previous_observed_at_ms: number | null; fresh: boolean;
};
type AccountWindows = { account: Account; windows: QuotaWindow[]; executions: LinkedExecution[] };
type AccountDraft = {
  provider: string; plan: string; authentication_mode: 'api_key' | 'oauth_refresh';
  billing_mode: 'subscription' | 'metered_api'; credential_reference: string; concurrency_limit: string;
};

function projectPath(organization: string, project: string) {
  return `/admin/v1/organizations/${organization}/projects/${project}`;
}

async function readJson<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (init?.body) headers.set('content-type', 'application/json');
  const response = await fetch(path, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed (${response.status}).`);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

function instant(timestamp: number) {
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown';
}

function quantity(value: string | null, unit: string) {
  if (value == null) return 'Unknown';
  try {
    const formatted = BigInt(value).toLocaleString();
    return unit === 'millionths_of_window' ? `${(Number(BigInt(value)) / 10_000).toFixed(2)}%` : `${formatted} ${unit}`;
  } catch { return 'Unknown'; }
}

function changeLabel(window: QuotaWindow) {
  if (window.remaining == null) return 'Change unknown';
  if (window.previous_remaining == null) return 'No comparable earlier sample';
  try {
    const change = BigInt(window.previous_remaining) - BigInt(window.remaining);
    if (change === 0n) return 'No change since prior sample';
    const amount = quantity(change < 0n ? (-change).toString() : change.toString(), window.unit);
    return `${change > 0n ? 'Decreased' : 'Increased'} ${amount} · unattributed`;
  } catch { return 'Change unknown'; }
}

function capacityPercent(window: QuotaWindow) {
  if (window.remaining == null || window.maximum == null) return null;
  try {
    const maximum = BigInt(window.maximum);
    if (maximum <= 0n) return null;
    return Number(BigInt(window.remaining) * 10_000n / maximum) / 100;
  } catch { return null; }
}

export default function SubscriptionsView({ token, initialScope, onOpenExecution }: {
  token: string;
  initialScope?: ScopeFocus | null;
  onOpenExecution?: (organizationId: string, projectId: string, executionId: string) => void;
}) {
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    const timer = window.setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); };
  }, []);
  const isFresh = (sample: QuotaWindow) => sample.fresh && sample.remaining != null && clock < sample.valid_until_ms && clock < sample.resets_at_ms;
  const [organizations, setOrganizations] = useState<Named[]>([]);
  const [projects, setProjects] = useState<Named[]>([]);
  const [organization, setOrganization] = useState(initialScope?.organizationId ?? '');
  const [project, setProject] = useState(initialScope?.projectId ?? '');
  const [data, setData] = useState<AccountWindows[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const [quotaAccount, setQuotaAccount] = useState('');
  const [quotaDraft, setQuotaDraft] = useState('');
  const [accountDraft, setAccountDraft] = useState<AccountDraft>({
    provider: '', plan: '', authentication_mode: 'oauth_refresh', billing_mode: 'subscription',
    credential_reference: '', concurrency_limit: '1',
  });
  const [dialogError, setDialogError] = useState('');
  const accountDialog = useRef<HTMLDialogElement>(null);
  const quotaDialog = useRef<HTMLDialogElement>(null);
  const focusedAccountRow = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void readJson<{ data: Named[] }>('/admin/v1/organizations', token, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setOrganizations(value.data); })
      .catch(e => { if (!controller.signal.aborted) setError((e as Error).message); });
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    setProjects([]);
    if (!organization) return () => controller.abort();
    void readJson<{ data: Named[] }>(`/admin/v1/organizations/${organization}/projects`, token, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setProjects(value.data); })
      .catch(e => { if (!controller.signal.aborted) setError((e as Error).message); });
    return () => controller.abort();
  }, [token, organization]);

  useEffect(() => {
    const controller = new AbortController();
    setError(''); setData([]);
    if (!organization || !project) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    async function load() {
      const base = projectPath(organization, project);
      const result = await readJson<{ data: Account[] }>(`${base}/accounts`, token, { signal: controller.signal });
      const accounts = await Promise.all(result.data.map(async account => {
        const [quota, executions] = await Promise.all([
          readJson<{ data: QuotaWindow[] }>(`${base}/accounts/${account.id}/quota`, token, { signal: controller.signal }),
          readJson<{ data: LinkedExecution[] }>(`${base}/accounts/${account.id}/executions`, token, { signal: controller.signal }),
        ]);
        return { account, windows: quota.data, executions: executions.data };
      }));
      if (!controller.signal.aborted) setData(accounts);
    }
    void load().catch(e => { if (!controller.signal.aborted) setError((e as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, organization, project, revision]);

  useEffect(() => {
    if (initialScope?.accountId && data.some(item => item.account.id === initialScope.accountId)) {
      const row = focusedAccountRow.current;
      if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [data, initialScope?.accountId]);

  useEffect(() => {
    const dialog = accountDialog.current;
    if (accountOpen && dialog && !dialog.open) dialog.showModal();
    else if (!accountOpen && dialog?.open) dialog.close();
  }, [accountOpen]);
  useEffect(() => {
    const dialog = quotaDialog.current;
    if (quotaAccount && dialog && !dialog.open) dialog.showModal();
    else if (!quotaAccount && dialog?.open) dialog.close();
  }, [quotaAccount]);

  const windows = useMemo(() => data.flatMap(({ account, windows }) => windows.map(window => ({ account, window }))), [data]);
  const freshCount = windows.filter(item => isFresh(item.window)).length;
  const unlinkedChanges = windows.filter(({ window }) => window.previous_remaining != null && window.remaining != null && window.previous_remaining !== window.remaining).length;
  const subscriptionAccounts = data.filter(item => item.account.billing_mode === 'subscription').length;
  const accountForImport = data.find(item => item.account.id === quotaAccount)?.account;

  function openQuota(accountId: string) {
    const now = Date.now();
    setDialogError(''); setError(''); setNotice(''); setQuotaAccount(accountId);
    setQuotaDraft(JSON.stringify({ schema_version: 1, window_key: 'weekly', unit: 'tokens', remaining: null, maximum: null, observed_at_ms: now, valid_until_ms: now + 3600000, resets_at_ms: now + 604800000, source: 'provider-export' }, null, 2));
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setDialogError('');
    try {
      await readJson<{ id: string }>(`${projectPath(organization, project)}/accounts`, token, {
        method: 'POST', body: JSON.stringify({ ...accountDraft, concurrency_limit: Number(accountDraft.concurrency_limit) }),
      });
      setAccountOpen(false); setAccountDraft({ provider: '', plan: '', authentication_mode: 'oauth_refresh', billing_mode: 'subscription', credential_reference: '', concurrency_limit: '1' });
      setNotice('Account registered as unverified. Registration does not enable inference.'); setRevision(value => value + 1);
    } catch (e) { setDialogError((e as Error).message); }
  }

  async function importQuota(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setDialogError('');
    let body: string;
    try {
      JSON.parse(quotaDraft);
      body = quotaDraft; // Keep large integer tokens exact; PostgreSQL stores BIGINT values.
    } catch { setDialogError('Enter a valid JSON quota observation.'); return; }
    try {
      await readJson<{ id: string }>(`${projectPath(organization, project)}/accounts/${quotaAccount}/quota`, token, { method: 'POST', body });
      setQuotaAccount(''); setNotice('Quota observation imported. No provider call or allowance reset was triggered.'); setRevision(value => value + 1);
    } catch (e) { setDialogError((e as Error).message); }
  }

  async function deleteQuotaHistory(accountId: string, windowKey: string) {
    if (!window.confirm(`Permanently delete all imported snapshots for the ${windowKey} window?`)) return;
    setError(''); setNotice('');
    try {
      const result = await readJson<{ deleted_count: number }>(
        `${projectPath(organization, project)}/accounts/${accountId}/quota?window_key=${encodeURIComponent(windowKey)}`,
        token,
        { method: 'DELETE' },
      );
      const count = result.deleted_count;
      setNotice(`Deleted ${count} quota snapshot${count === 1 ? '' : 's'} for ${windowKey}.`);
      setRevision(value => value + 1);
    } catch (e) { setError((e as Error).message); }
  }

  return <>
    <div className="page-heading execution-page-heading">
      <div><p className="eyebrow">CAPACITY OBSERVABILITY</p><h1>Subscriptions</h1><p className="page-subtitle">Review provider-reported quota windows and resets.</p></div>
      <div className="execution-page-actions">
        <Button variant="outline" disabled={!project || loading} onClick={() => { setNotice(''); setRevision(value => value + 1); }}><RefreshCw />Refresh</Button>
        <Button disabled={!project} onClick={() => { setAccountOpen(true); setDialogError(''); }}><Plus />Register account</Button>
      </div>
    </div>

    <section className="execution-scope panel">
      <div className="key-scope-grid">
        <Label htmlFor="subscription-organization">Organization<NativeSelect id="subscription-organization" value={organization} onChange={e => { setOrganization(e.target.value); setProject(''); }}>
          <NativeSelectOption value="">Select organization</NativeSelectOption>{organizations.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}
        </NativeSelect></Label>
        <Label htmlFor="subscription-project">Project<NativeSelect id="subscription-project" disabled={!organization} value={project} onChange={e => setProject(e.target.value)}>
          <NativeSelectOption value="">Select project</NativeSelectOption>{projects.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}
        </NativeSelect></Label>
      </div>
      {!project && <p className="execution-scope-note">Choose a project to review registered supplier accounts and observed capacity.</p>}
    </section>

    {error && <p role="alert" className="error-text execution-feedback">{error}</p>}
    {notice && <p role="status" className="success-text execution-feedback">{notice}</p>}
    {loading && <p role="status" className="execution-loading">Loading account observations…</p>}

    {project && !loading && !error && <>
      <section className="subscription-metrics" aria-label="Subscription summary">
        <article className="subscription-metric"><span className="subscription-metric-icon"><WalletCards size={16} /></span><div><small>Supplier accounts</small><strong>{data.length}</strong><span>In this project</span></div></article>
        <article className="subscription-metric"><span className="subscription-metric-icon is-violet"><Database size={16} /></span><div><small>Subscription plans</small><strong>{subscriptionAccounts}</strong><span>Separate from metered keys</span></div></article>
        <article className="subscription-metric"><span className="subscription-metric-icon is-green"><Activity size={16} /></span><div><small>Fresh windows</small><strong>{freshCount}<em> / {windows.length}</em></strong><span>Before validity and reset deadlines</span></div></article>
        <article className="subscription-metric"><span className="subscription-metric-icon is-amber"><Clock3 size={16} /></span><div><small>Unattributed changes</small><strong>{unlinkedChanges}</strong><span>Between provider snapshots</span></div></article>
      </section>

      <section className="subscription-explainer panel">
        <span className="subscription-explainer-mark"><Activity size={16} /></span>
        <div><strong>Provider observations stay separate from task accounting</strong><p>Changes between samples are marked unattributed. A snapshot does not prove which task consumed capacity, and this view never refreshes a provider account or resets an allowance.</p></div>
      </section>

      <section className="subscription-window-panel panel">
        <div className="panel-heading"><div><h2>Observed quota windows</h2><p>Latest sample per account and provider window. Values retain the provider's reported unit.</p></div><span className="subscription-window-total">{windows.length} windows</span></div>
        {windows.length === 0 ? <div className="empty-state"><div className="empty-icon"><Upload size={17} /></div><strong>No quota snapshots yet</strong><span>Register an account, then import an authorized provider observation.</span></div> : <div className="subscription-window-list">
          {windows.map(({ account, window }) => {
            const percent = capacityPercent(window);
            return <article className="subscription-window" key={account.id + ':' + window.window_key}>
              <div className="subscription-window-account"><span className="subscription-provider-mark"><WalletCards size={16} /></span><div><strong>{account.provider} <span>·</span> {account.plan}</strong><small>{account.billing_mode.replace('_', ' ')} <span aria-hidden="true">/</span> {window.window_key} <span aria-hidden="true">/</span> {window.source}</small></div></div>
              <div className="subscription-window-capacity"><div className="subscription-capacity-heading"><span>Remaining capacity</span><Badge variant={isFresh(window) ? 'secondary' : 'destructive'}>{isFresh(window) ? 'Fresh' : 'Stale or unknown'}</Badge></div><strong>{quantity(window.remaining, window.unit)}{window.maximum != null && window.unit !== 'millionths_of_window' ? <small> of {quantity(window.maximum, window.unit)}</small> : null}</strong>{percent != null && <div className="subscription-meter" role="meter" aria-label="Remaining capacity" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>}</div>
              <div className="subscription-window-times"><span>Observed<strong>{instant(window.observed_at_ms)}</strong></span><span>Resets<strong>{instant(window.resets_at_ms)}</strong></span><span className="subscription-window-change">Change<strong>{changeLabel(window)}</strong></span></div>
              <div className="subscription-window-action"><Button variant="outline" size="sm" onClick={() => openQuota(account.id)}><Upload />Import update</Button><Button variant="ghost" size="icon" aria-label={`Delete quota history for ${window.window_key}`} title="Delete all snapshots for this window" onClick={() => void deleteQuotaHistory(account.id, window.window_key)}><Trash2 /></Button></div>
            </article>;
          })}
        </div>}
      </section>

    <section className="subscription-account-panel panel">
        <div className="panel-heading"><div><h2>Registered accounts</h2><p>Metadata only. Credentials remain in the configured secret source.</p></div><span className="subscription-window-total">{data.length} accounts</span></div>
        {data.length === 0 ? <div className="empty-state"><div className="empty-icon"><Plus size={17} /></div><strong>No supplier accounts</strong><span>Register an account to begin importing quota observations.</span></div> : <div className="subscription-account-list">{data.map(({ account, executions }) => <div className={`subscription-account-row${initialScope?.accountId === account.id ? ' is-focused' : ''}`} key={account.id} data-account-id={account.id} ref={initialScope?.accountId === account.id ? focusedAccountRow : undefined}><span className="subscription-provider-mark"><WalletCards size={16} /></span><div className="subscription-account-name"><strong>{account.provider} <span>·</span> {account.plan}</strong><small>{account.id} <span aria-hidden="true">/</span> {account.authentication_mode.replace('_', ' ')} <span aria-hidden="true">/</span> {account.billing_mode.replace('_', ' ')}</small>{executions.length > 0 && <div className="subscription-related-tasks"><small>Related tasks</small>{executions.map(execution => <button type="button" key={execution.id} onClick={() => onOpenExecution?.(organization, project, execution.id)}>{execution.task_id}<ArrowUpRight size={12} /></button>)}</div>}</div><span className="subscription-account-concurrency">{account.concurrency_limit} concurrent</span><Badge variant={account.health === 'ready' ? 'secondary' : 'outline'}>{account.health.replaceAll('_', ' ')}</Badge></div>)}</div>}
      </section>
    </>}

    <dialog ref={accountDialog} className="subscription-dialog" onCancel={event => { event.preventDefault(); setAccountOpen(false); }}>
      <form className="subscription-dialog-form" onSubmit={event => void createAccount(event)}>
        <header className="execution-import-head"><div><p className="eyebrow">SUPPLIER SETUP</p><h2>Register account</h2><p>Registration stores metadata and an opaque secret reference. It does not enable inference.</p></div><Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={() => setAccountOpen(false)}>×</Button></header>
        {dialogError && <p role="alert" className="error-text">{dialogError}</p>}
        <label>Provider<input required maxLength={100} value={accountDraft.provider} onChange={e => setAccountDraft({ ...accountDraft, provider: e.target.value })} placeholder="Provider name" /></label>
        <label>Plan<input required maxLength={200} value={accountDraft.plan} onChange={e => setAccountDraft({ ...accountDraft, plan: e.target.value })} placeholder="Plan label" /></label>
        <div className="subscription-dialog-grid"><label>Authentication<select value={accountDraft.authentication_mode} onChange={e => setAccountDraft({ ...accountDraft, authentication_mode: e.target.value as AccountDraft['authentication_mode'] })}><option value="oauth_refresh">OAuth refresh</option><option value="api_key">API key</option></select></label><label>Billing<select value={accountDraft.billing_mode} onChange={e => setAccountDraft({ ...accountDraft, billing_mode: e.target.value as AccountDraft['billing_mode'] })}><option value="subscription">Subscription</option><option value="metered_api">Metered API</option></select></label></div>
        <label>Credential reference<input required value={accountDraft.credential_reference} onChange={e => setAccountDraft({ ...accountDraft, credential_reference: e.target.value })} placeholder="env:PROVIDER_ACCOUNT" autoComplete="off" /><small>Use an env: or secret: reference. Never paste the secret itself.</small></label>
        <label>Concurrency limit<input required type="number" min="1" max="10000" value={accountDraft.concurrency_limit} onChange={e => setAccountDraft({ ...accountDraft, concurrency_limit: e.target.value })} /></label>
        <footer className="execution-import-actions"><Button variant="outline" type="button" onClick={() => setAccountOpen(false)}>Cancel</Button><Button type="submit">Register account</Button></footer>
      </form>
    </dialog>

    <dialog ref={quotaDialog} className="subscription-dialog" onCancel={event => { event.preventDefault(); setQuotaAccount(''); }}>
      <form className="subscription-dialog-form" onSubmit={event => void importQuota(event)}>
        <header className="execution-import-head"><div><p className="eyebrow">VERSIONED OBSERVATION</p><h2>Import quota snapshot</h2><p>{accountForImport ? `${accountForImport.provider} · ${accountForImport.plan}` : 'Provider-reported window'}</p></div><Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={() => setQuotaAccount('')}>×</Button></header>
        {dialogError && <p role="alert" className="error-text">{dialogError}</p>}
        <label>Quota observation JSON<textarea required spellCheck={false} value={quotaDraft} onChange={e => setQuotaDraft(e.target.value)} /></label>
        <p className="execution-import-privacy">Use schema version 1. Report the provider's unit, observation time, validity and reset time. Raw credentials and content do not belong in this record; duplicate samples are idempotent and conflicting replays are rejected.</p>
        <footer className="execution-import-actions"><Button variant="outline" type="button" onClick={() => setQuotaAccount('')}>Cancel</Button><Button type="submit"><Upload />Import snapshot</Button></footer>
      </form>
    </dialog>
  </>;
}
