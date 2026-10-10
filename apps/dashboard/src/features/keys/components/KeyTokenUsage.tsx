import { useEffect, useState } from 'react';
import { IconRefresh } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { keyRequest } from '../api';
import type { KeyTokenUsageWindow } from '../../../../../../sdks/javascript/src/admin';

const exact = (value: unknown): value is string => typeof value === 'string' && /^\d{1,64}$/.test(value);
function checked(value: KeyTokenUsageWindow) {
  if (!value || value.window_seconds !== 60 || typeof value.window_end !== 'string' || !Number.isFinite(Date.parse(value.window_end))
    || [value.requests, value.known_usage_requests, value.unknown_usage_requests].some(count => !Number.isSafeInteger(count) || count < 0)
    || value.known_usage_requests + value.unknown_usage_requests !== value.requests
    || !exact(value.known_prompt_tokens) || !exact(value.known_completion_tokens)
    || (value.known_usage_requests === 0 && (BigInt(value.known_prompt_tokens) !== 0n || BigInt(value.known_completion_tokens) !== 0n))) {
    throw new Error('The token usage response could not be read.');
  }
  return value;
}

export default function KeyTokenUsage(props: { token: string; endpoint: string }) {
  return <UsageWindow key={`${props.token}:${props.endpoint}`} {...props} />;
}
function UsageWindow({ token, endpoint }: { token: string; endpoint: string }) {
  const [usage, setUsage] = useState<KeyTokenUsageWindow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setUsage(null);
    void keyRequest<{ data: KeyTokenUsageWindow }>(token, `${endpoint}/token-usage-window`, 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setUsage(checked(result.data)); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not read token usage.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, endpoint, reload]);
  const metrics = usage ? [
    ['Requests', usage.requests.toLocaleString()],
    ['Total tokens', usage.unknown_usage_requests > 0 ? 'Unknown' : (BigInt(usage.known_prompt_tokens) + BigInt(usage.known_completion_tokens)).toLocaleString()],
    ['Known input', BigInt(usage.known_prompt_tokens).toLocaleString()],
    ['Known output', BigInt(usage.known_completion_tokens).toLocaleString()],
  ] : [];
  return <section className="pt-4" aria-label="Recent token usage">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="text-sm font-medium">Recent token usage</h3>
        {usage && <p className="mt-1 text-xs text-muted-foreground">60 seconds ending <time dateTime={usage.window_end}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(usage.window_end))}</time></p>}
      </div>
      <Button type="button" variant={error ? 'outline' : 'ghost'} size={error ? 'sm' : 'icon'} disabled={loading} aria-label={error ? 'Retry token usage' : 'Refresh 60-second token usage'} onClick={() => {setUsage(null);setLoading(true);setReload(current => current + 1);}}>
        {error ? 'Retry' : <IconRefresh size={16} aria-hidden="true" />}
      </Button>
    </div>
    {loading ? <p role="status" className="mt-3 text-sm text-muted-foreground">Loading token usage…</p>
      : error ? <p role="alert" className="mt-3 text-sm text-destructive">Token usage unavailable. {error}</p>
      : usage && <>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-all text-sm font-medium tabular-nums">{value}</dd></div>)}</dl>
        {usage.unknown_usage_requests > 0 && <p className="mt-3 text-xs text-muted-foreground">{usage.unknown_usage_requests.toLocaleString()} {usage.unknown_usage_requests === 1 ? 'request has' : 'requests have'} no complete reported token usage. Known subtotals exclude these requests.</p>}
        {usage.requests === 0 && <p className="mt-3 text-xs text-muted-foreground">No requests dispatched in this window.</p>}
        <p className="mt-3 text-xs text-muted-foreground">Dispatches in this window; TPM also includes unresolved reservations.</p>
      </>}
  </section>;
}
