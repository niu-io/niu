import { useEffect, useState } from 'react';
import { useRead } from '@/lib/useRead';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

type Named = { id: string; name: string };
type Account = { id: string; provider: string; plan: string; billing_mode: string; authentication_mode: string; health: string; concurrency_limit: number; refreshing: boolean };
type Window = { window_key: string; unit: string; remaining: string | null; maximum: string | null; observed_at_ms: number; valid_until_ms: number; resets_at_ms: number; source: string; fresh: boolean };
function timestamp(value: number) { const date = new Date(value); return Number.isSafeInteger(value) && !Number.isNaN(date.valueOf()) ? date.toLocaleString() : 'Unknown'; }

export default function AccountsPage({ token }: { token: string }) {
  const [organization, setOrganization] = useState('');
  const [project, setProject] = useState('');
  const [account, setAccount] = useState('');
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const organizations = useRead<{ data: Named[] }>(token, '/admin/v1/organizations');
  const projects = useRead<{ data: Named[] }>(token, organization ? `/admin/v1/organizations/${organization}/projects` : null);
  const base = organization && project ? `/admin/v1/organizations/${organization}/projects/${project}/accounts` : null;
  const accounts = useRead<{ data: Account[] }>(token, base ? `${base}?refresh=${revision}` : null);
  const quota = useRead<{ data: Window[] }>(token, base && account ? `${base}/${account}/quota?refresh=${revision}` : null);
  const error = organizations.error || projects.error || accounts.error || quota.error;
  return <>
    <div className="page-heading"><div><p className="eyebrow">OPTIONAL CAPACITY OBSERVATION</p><h1>Supplier accounts</h1><p className="page-subtitle">Inspect subscription and metered accounts without forwarding model requests.</p></div><Button variant="outline" disabled={!project} onClick={() => setRevision(x => x + 1)}>Refresh</Button></div>
    <section className="panel keys-controls"><div className="key-scope-grid">
      <Label htmlFor="accounts-org">Organization<NativeSelect id="accounts-org" value={organization} onChange={e => { setOrganization(e.target.value); setProject(''); setAccount(''); }}><NativeSelectOption value="">Select organization</NativeSelectOption>{organizations.data?.data.map(x => <NativeSelectOption key={x.id} value={x.id}>{x.name}</NativeSelectOption>)}</NativeSelect></Label>
      <Label htmlFor="accounts-project">Project<NativeSelect id="accounts-project" disabled={!organization} value={project} onChange={e => { setProject(e.target.value); setAccount(''); }}><NativeSelectOption value="">Select project</NativeSelectOption>{projects.data?.data.map(x => <NativeSelectOption key={x.id} value={x.id}>{x.name}</NativeSelectOption>)}</NativeSelect></Label>
    </div><p>Accounts are registered through the administration API. Registration does not verify credentials or collect quota automatically. Capacity observations are separate from cash cost and API-equivalent cost.</p></section>
    {error && <p role="alert" className="error-text">{error}</p>}
    {base && !accounts.data && !accounts.error && <p role="status">Loading accounts…</p>}
    {accounts.data && <section className="panel"><Table><TableHeader><TableRow><TableHead>PROVIDER / PLAN</TableHead><TableHead>BILLING</TableHead><TableHead>AUTHENTICATION</TableHead><TableHead>HEALTH</TableHead><TableHead>CONCURRENCY LIMIT</TableHead></TableRow></TableHeader><TableBody>{accounts.data.data.map(x => <TableRow key={x.id}><TableCell><Button variant="link" onClick={() => setAccount(x.id)}>{x.provider} / {x.plan}</Button><small className="price-revision">{x.id}</small></TableCell><TableCell>{x.billing_mode}</TableCell><TableCell>{x.authentication_mode}</TableCell><TableCell><Badge variant="outline">{x.health}</Badge>{x.refreshing && ' · Refresh in progress'}</TableCell><TableCell>{x.concurrency_limit}</TableCell></TableRow>)}</TableBody></Table>
      {!accounts.data.data.length && <p className="empty-state">No registered accounts. Model access does not require this registry.</p>}
      {accounts.data.data.length >= 1000 && <p className="empty-state">Showing the first 1,000 accounts. This is not a complete inventory.</p>}
    </section>}
    {account && <section className="panel keys-controls"><h2>Quota observations</h2><p>Account: {account}</p><p>Values describe observed capacity, not charges. Stale values are historical evidence and cannot establish current availability.</p>
      {!quota.data && !quota.error && <p role="status">Loading quota…</p>}
      {quota.data && !quota.data.data.length && <p>No quota evidence. Remaining capacity is unknown.</p>}
      {quota.data?.data.map(w => <div key={w.window_key}><h3>{w.window_key}</h3><Badge variant="outline">{w.fresh && now < w.valid_until_ms && now < w.resets_at_ms ? 'Fresh at read; within validity window' : 'Stale'}</Badge><p>Remaining: {w.remaining ?? 'Unknown'} / Maximum: {w.maximum ?? 'Unknown'} {w.unit.replaceAll('_', ' ')}</p><p>Observed: {timestamp(w.observed_at_ms)} · Valid until: {timestamp(w.valid_until_ms)} · Resets: {timestamp(w.resets_at_ms)}</p><p>Source: {w.source}</p></div>)}
    </section>}
  </>;
}
