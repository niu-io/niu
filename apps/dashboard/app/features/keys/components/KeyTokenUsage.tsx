import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useState } from 'react';
import { IconRefresh } from '@tabler/icons-react';
import { MetricStripSkeleton } from '@/components/PageSkeletons';
import { Button } from '@/components/ui/button';
import { invalidateQueries, peekQuery, primeQuery } from '@/lib/query-cache';
import { keyRequest } from '../api';
import type { KeyTokenUsageWindow } from '@niu-io/sdk/admin';

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

function readCachedUsage(token: string, usagePath: string): KeyTokenUsageWindow | null {
  try {
    const cached = peekQuery<{ data: KeyTokenUsageWindow }>(token || 'public', usagePath)?.data;
    return cached ? checked(cached) : null;
  } catch {
    return null; // A corrupt cache entry is optional; the fetch below reports failures.
  }
}

export default function KeyTokenUsage(props: { token: string; endpoint: string }) {
  return <UsageWindow key={`${props.token}:${props.endpoint}`} {...props} />;
}
function UsageWindow({ token, endpoint }: { token: string; endpoint: string }) {
  const { t: uiT } = useUILocale();
  const usagePath = `${endpoint}/token-usage-window`;
  const initialUsage = readCachedUsage(token, usagePath);
  const [usage, setUsage] = useState<KeyTokenUsageWindow | null>(() => initialUsage);
  const [loading, setLoading] = useState(() => !initialUsage);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const cached = reload === 0 ? readCachedUsage(token, usagePath) : null;
    if (cached) {
      setUsage(cached);
      setLoading(false);
    } else {
      setLoading(true);
      setUsage(null);
    }
    setError('');
    void keyRequest<{ data: KeyTokenUsageWindow }>(token, usagePath, 'GET', undefined, controller.signal)
      .then(result => {
        const verified = checked(result.data);
        if (!controller.signal.aborted) {
          primeQuery(token || 'public', usagePath, { data: verified });
          setUsage(verified);
        }
      })
      .catch(cause => {
        if (!controller.signal.aborted) {
          invalidateQueries(k => k === `${token || 'public'}::${usagePath}`);
          setUsage(null);
          setError(cause instanceof Error ? cause.message : 'Could not read token usage.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, usagePath, reload]);
  const metrics = usage ? [
    [uiT('Requests'), usage.requests.toLocaleString(readUILocale())],
    [uiT('Total tokens'), usage.unknown_usage_requests > 0 ? uiT('Unknown') : (BigInt(usage.known_prompt_tokens) + BigInt(usage.known_completion_tokens)).toLocaleString(readUILocale())],
    [uiT('Known input'), BigInt(usage.known_prompt_tokens).toLocaleString(readUILocale())],
    [uiT('Known output'), BigInt(usage.known_completion_tokens).toLocaleString(readUILocale())],
  ] : [];
  return <section className="pt-4" aria-label={uiT("Recent token usage")}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="text-sm font-medium">{uiT("Recent token usage")}</h3>
        {usage && <p className="mt-1 text-xs text-muted-foreground">{uiT("60 seconds ending")}{" "}<time dateTime={usage.window_end}>{new Intl.DateTimeFormat(readUILocale(), { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(usage.window_end))}</time></p>}
      </div>
      <Button type="button" variant={error ? 'outline' : 'ghost'} size={error ? 'sm' : 'icon'} disabled={loading} aria-label={error ? uiT("Retry token usage") : uiT("Refresh 60-second token usage")} onClick={() => {invalidateQueries(k => k === `${token || 'public'}::${usagePath}`);setUsage(null);setLoading(true);setReload(current => current + 1);}}>
        {error ? uiT("Retry") : <IconRefresh size={16} aria-hidden="true" />}
      </Button>
    </div>
    {loading ? <div className="mt-3"><MetricStripSkeleton count={4} label={uiT("Loading token usage…")} /></div>
      : error ? <p role="alert" className="mt-3 text-sm text-destructive">{uiT("Token usage unavailable.")}{" "}{uiT(error)}</p>
      : usage && <>
        {usage.requests > 0 && <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-all text-sm font-medium tabular-nums">{value}</dd></div>)}</dl>}
        {usage.unknown_usage_requests > 0 && <p className="mt-3 text-xs text-muted-foreground">{usage.unknown_usage_requests.toLocaleString(readUILocale())} {usage.unknown_usage_requests === 1 ? uiT("request has") : uiT("requests have")}{" "}{uiT("no complete reported token usage. Known subtotals exclude these requests.")}</p>}
        {usage.requests === 0 && <p className="mt-3 text-xs text-muted-foreground">{uiT("No requests dispatched in this window.")}</p>}
        <p className="mt-3 text-xs text-muted-foreground">{uiT("Dispatches in this window; TPM also includes unresolved reservations.")}</p>
      </>}
  </section>;
}
