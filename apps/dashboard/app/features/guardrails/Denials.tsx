import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { IconListDetails, IconRefresh, IconShieldOff } from '@tabler/icons-react';
import PageHeader from '@/components/PageHeader';
import { TableSkeleton } from '@/components/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { cachedGet, markCachedStale, peekCachedGet } from '@/features/providers/api';

type Denial = {
  stage?: 'preparation' | 'dispatch' | 'batch_admission'; reason: string; key_name: string; workspace_policy_name: string | null; key_policy_name: string | null;
  workspace_revision: number | null; key_policy_revision: number | null; recorded_at: string;
};
const reasons: Record<string, string> = {
  model_denied: 'Model not allowed', provider_denied: 'Provider not allowed', unsupported_policy: 'Policy cannot be enforced',
  input_blocked: 'Input matched a blocking rule', input_unsupported: 'Input format cannot be inspected',
  input_resource_limit: 'Input inspection limit exceeded', input_unavailable: 'Input inspection unavailable',
  detector_blocked: 'External input check blocked the request', detector_unavailable: 'Required external input check unavailable',
  detector_unsupported: 'Input format not supported by the external input check',
  output_incompatible: 'Request incompatible with buffered output rules',
  access_denied: 'Model or Provider not allowed', input_binding_missing: 'Required inspection was missing',
  policy_changed: 'Policy changed before dispatch',
};
const policyLabel = (name: string | null, revision: number | null) => revision ? `${name || 'Saved policy'} · Version ${revision}` : 'None';
const policyEvidence = (name: string | null, revision: number | null) => revision && Number.isSafeInteger(revision) && revision > 0
  ? <Link className="underline underline-offset-4" to={`../history?revision=${revision}&from=blocked`} relative="path">{policyLabel(name, revision)}</Link>
  : 'No saved policy evidence';
const time = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(readUILocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Time unavailable';

export default function GuardrailDenials({ token, endpoint }: { token: string; endpoint: string }) {
  const { t: uiT } = useUILocale();
  const prepPath = `${endpoint}/denials`;
  const dispatchPath = `${endpoint}/dispatch-denials`;
  const readCachedDenials = () => {
    const preparation = peekCachedGet<{ data: Denial[]; coverage: string }>(token, prepPath);
    const dispatch = peekCachedGet<{ data: Denial[]; coverage: string }>(token, dispatchPath);
    if (!preparation || !dispatch) return null;
    if (preparation.coverage !== 'latest_100_preparation_denials' || !Array.isArray(preparation.data)
      || dispatch.coverage !== 'latest_100_dispatch_policy_exceptions' || !Array.isArray(dispatch.data)) return null;
    return [
      ...preparation.data.map(row => ({ ...row, stage: 'preparation' as const })),
      ...dispatch.data,
    ].sort((a, b) => (Date.parse(b.recorded_at) || 0) - (Date.parse(a.recorded_at) || 0)).slice(0, 100);
  };
  const initialRows = readCachedDenials();
  const [rows, setRows] = useState<Denial[]>(() => initialRows ?? []);
  const [loading, setLoading] = useState(() => initialRows === null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const lastReload = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const force = lastReload.current !== reload;
    lastReload.current = reload;
    setLoading(true); setError('');
    if (force) setRows([]);
    void Promise.all([
      cachedGet<{ data: Denial[]; coverage: string }>(token, prepPath, { signal: controller.signal, force }),
      cachedGet<{ data: Denial[]; coverage: string }>(token, dispatchPath, { signal: controller.signal, force }),
    ]).then(([preparation, dispatch]) => {
        if (controller.signal.aborted) return;
        if (preparation.coverage !== 'latest_100_preparation_denials' || !Array.isArray(preparation.data)
          || dispatch.coverage !== 'latest_100_dispatch_policy_exceptions' || !Array.isArray(dispatch.data)) throw new Error('Invalid blocked-request response.');
        setRows([
          ...preparation.data.map(row => ({ ...row, stage: 'preparation' as const })),
          ...dispatch.data,
        ].sort((a, b) => (Date.parse(b.recorded_at) || 0) - (Date.parse(a.recorded_at) || 0)).slice(0, 100));
      })
      .catch(cause => {
        markCachedStale(token, prepPath);
        markCachedStale(token, dispatchPath);
        if (!controller.signal.aborted) {
          setRows([]);
          setError(cause instanceof TypeError ? 'Could not load blocked requests. Check your connection and refresh to try again.' : cause instanceof Error ? cause.message : 'Could not load blocked requests.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, prepPath, dispatchPath, reload]);
  return <div className="guardrails-page">
    <PageHeader title={uiT("Blocked requests")} action={<>
      <Button asChild variant="outline" className="header-icon-action"><Link to="../../executions" relative="path" aria-label={uiT("Open Logs")} title={uiT("Open Logs")}><IconListDetails aria-hidden="true" /><span>{uiT("Open Logs")}</span></Link></Button>
      <Button variant="outline" className="header-icon-action aria-disabled:opacity-50" aria-label={uiT("Refresh")} title={uiT("Refresh")} aria-disabled={loading} onClick={() => {if (!loading) setReload(value => value + 1);}}><IconRefresh aria-hidden="true" /><span>{uiT("Refresh")}</span></Button>
    </>} />
    
    
    <p className="guardrails-intro">{uiT("Latest 100 recorded blocks before model dispatch. Select a saved policy to inspect the rules referenced by a block. A workspace administrator can change policy for future requests. These pre-dispatch events may have no request log. Some admission denials are not recorded. Logs contain output blocks after dispatch.")}</p>
    {loading && !rows.length && !error ? <TableSkeleton columns={5} rows={5} label={uiT("Loading blocked requests…")} /> : error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : !rows.length ? <Empty className="guardrails-empty"><EmptyHeader><EmptyMedia variant="icon"><IconShieldOff aria-hidden="true" /></EmptyMedia><EmptyTitle>{uiT("No recorded blocks in this workspace.")}</EmptyTitle></EmptyHeader></Empty> : <Table className="sm:min-w-[680px] table-fixed">
      <TableHeader><TableRow><TableHead>{uiT("Reason")}</TableHead><TableHead className="hidden sm:table-cell">{uiT("API key")}</TableHead><TableHead className="hidden sm:table-cell">{uiT("Time")}</TableHead><TableHead className="hidden sm:table-cell">{uiT("Workspace policy")}</TableHead><TableHead className="hidden sm:table-cell">{uiT("Key policy")}</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((row, index) => <TableRow key={index}><TableCell className="whitespace-normal break-words">{reasons[row.reason] || uiT("Request blocked by Guardrails")}<div className="text-muted-foreground text-xs mt-1">{row.stage === 'dispatch' ? uiT("Before dispatch") : row.stage === 'batch_admission' ? uiT("During admission") : uiT("Before admission")}</div><dl className="mt-4 grid gap-3 text-sm sm:hidden">
        <div><dt className="text-xs text-muted-foreground">{uiT("API key")}</dt><dd>{row.key_name || uiT("Unnamed key")}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{uiT("Time")}</dt><dd>{time(row.recorded_at)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{uiT("Workspace policy")}</dt><dd>{uiT(policyEvidence(row.workspace_policy_name, row.workspace_revision))}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{uiT("Key policy")}</dt><dd>{uiT(policyEvidence(row.key_policy_name, row.key_policy_revision))}</dd></div>
      </dl></TableCell><TableCell className="hidden sm:table-cell whitespace-normal break-words">{row.key_name || uiT("Unnamed key")}</TableCell><TableCell className="hidden sm:table-cell whitespace-normal break-words">{time(row.recorded_at)}</TableCell><TableCell className="hidden sm:table-cell whitespace-normal break-words">{uiT(policyEvidence(row.workspace_policy_name, row.workspace_revision))}</TableCell><TableCell className="hidden sm:table-cell whitespace-normal break-words">{uiT(policyEvidence(row.key_policy_name, row.key_policy_revision))}</TableCell></TableRow>)}</TableBody>
    </Table>}
  </div>;
}
