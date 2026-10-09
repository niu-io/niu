import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { IconListDetails, IconRefresh, IconShieldOff } from '@tabler/icons-react';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { request } from '@/features/vendors/api';

type Denial = {
  stage?: 'preparation' | 'dispatch' | 'batch_admission'; reason: string; key_name: string; workspace_policy_name: string | null; key_policy_name: string | null;
  workspace_revision: number | null; key_policy_revision: number | null; recorded_at: string;
};
const reasons: Record<string, string> = {
  model_denied: 'Model not allowed', provider_denied: 'Provider not allowed', unsupported_policy: 'Policy cannot be enforced',
  input_blocked: 'Input matched a blocking rule', input_unsupported: 'Input format cannot be inspected',
  input_resource_limit: 'Input inspection limit exceeded', input_unavailable: 'Input inspection unavailable',
  detector_blocked: 'External detector matched input', detector_unavailable: 'Required external detector unavailable',
  detector_unsupported: 'Input format not supported by external detector',
  output_incompatible: 'Request incompatible with buffered output rules',
  access_denied: 'Model or Provider not allowed', input_binding_missing: 'Required inspection was missing',
  policy_changed: 'Policy changed before dispatch',
};
const policyLabel = (name: string | null, revision: number | null) => revision ? `${name || 'Saved policy'} · Version ${revision}` : 'None';
const time = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Time unavailable';

export default function GuardrailDenials({ token, endpoint }: { token: string; endpoint: string }) {
  const [rows, setRows] = useState<Denial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setRows([]);
    void Promise.all([
      request<{ data: Denial[]; coverage: string }>(token, `${endpoint}/denials`, 'GET', undefined, controller.signal),
      request<{ data: Denial[]; coverage: string }>(token, `${endpoint}/dispatch-denials`, 'GET', undefined, controller.signal),
    ]).then(([preparation, dispatch]) => {
        if (controller.signal.aborted) return;
        if (preparation.coverage !== 'latest_100_preparation_denials' || !Array.isArray(preparation.data)
          || dispatch.coverage !== 'latest_100_dispatch_policy_exceptions' || !Array.isArray(dispatch.data)) throw new Error('Invalid blocked-request response.');
        setRows([
          ...preparation.data.map(row => ({ ...row, stage: 'preparation' as const })),
          ...dispatch.data,
        ].sort((a, b) => (Date.parse(b.recorded_at) || 0) - (Date.parse(a.recorded_at) || 0)).slice(0, 100));
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof TypeError ? 'Could not load blocked requests. Check your connection and refresh to try again.' : cause instanceof Error ? cause.message : 'Could not load blocked requests.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, endpoint, reload]);
  return <div className="guardrails-page">
    <PageHeader title="Blocked requests" action={<>
      <Button asChild variant="outline" className="header-icon-action"><Link to="../../executions" relative="path" aria-label="Open Logs" title="Open Logs"><IconListDetails aria-hidden="true" /><span>Open Logs</span></Link></Button>
      <Button variant="outline" className="header-icon-action aria-disabled:opacity-50" aria-label="Refresh" title="Refresh" aria-disabled={loading} onClick={() => {if (!loading) setReload(value => value + 1);}}><IconRefresh aria-hidden="true" /><span>Refresh</span></Button>
    </>} />
    
    
    <p className="guardrails-intro">Latest 100 recorded blocks before model dispatch. Some admission denials are not recorded. For output blocks, open request details in Logs.</p>
    {loading ? <p role="status">Loading blocked requests…</p> : error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : !rows.length ? <Empty className="guardrails-empty"><EmptyHeader><EmptyMedia variant="icon"><IconShieldOff aria-hidden="true" /></EmptyMedia><EmptyTitle>No recorded blocks in this workspace.</EmptyTitle></EmptyHeader></Empty> : <Table className="sm:min-w-[680px] table-fixed">
      <TableHeader><TableRow><TableHead>Reason</TableHead><TableHead className="hidden sm:table-cell">API key</TableHead><TableHead className="hidden sm:table-cell">Time</TableHead><TableHead className="hidden sm:table-cell">Workspace policy</TableHead><TableHead className="hidden sm:table-cell">Key policy</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((row, index) => <TableRow key={index}><TableCell className="whitespace-normal break-words">{reasons[row.reason] || 'Request blocked by Guardrails'}<div className="text-muted-foreground text-xs mt-1">{row.stage === 'dispatch' ? 'Before dispatch' : row.stage === 'batch_admission' ? 'During admission' : 'Before admission'}</div><dl className="mt-4 grid gap-3 text-sm sm:hidden">
        <div><dt className="text-xs text-muted-foreground">API key</dt><dd>{row.key_name || 'Unnamed key'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Time</dt><dd>{time(row.recorded_at)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Workspace policy</dt><dd>{policyLabel(row.workspace_policy_name, row.workspace_revision)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Key policy</dt><dd>{policyLabel(row.key_policy_name, row.key_policy_revision)}</dd></div>
      </dl></TableCell><TableCell className="hidden sm:table-cell whitespace-normal break-words">{row.key_name || 'Unnamed key'}</TableCell><TableCell className="hidden sm:table-cell whitespace-normal break-words">{time(row.recorded_at)}</TableCell><TableCell className="hidden sm:table-cell whitespace-normal break-words">{policyLabel(row.workspace_policy_name, row.workspace_revision)}</TableCell><TableCell className="hidden sm:table-cell whitespace-normal break-words">{policyLabel(row.key_policy_name, row.key_policy_revision)}</TableCell></TableRow>)}</TableBody>
    </Table>}
  </div>;
}
