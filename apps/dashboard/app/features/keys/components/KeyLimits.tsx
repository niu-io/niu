import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import KeyTokenUsage from './KeyTokenUsage';
import KeyCapacity from './KeyCapacity';
import type { ProjectKey } from '../api';

/** Read-only usage and capacity context. Editing lives in the single key settings surface. */
export default function KeyLimits({ token, projectKey, keyPath, onInspectRequest }: {
  token: string;
  projectKey: ProjectKey;
  keyPath: string;
  onInspectRequest?: (attempt: string, opener: HTMLElement | null) => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const concurrency = projectKey.concurrency_limit;
  const tokenRate = projectKey.token_rate_limit;
  const activeRequests = concurrency?.active_requests ?? 0;
  const unboundedRequests = tokenRate?.unbounded_requests ?? 0;
  const reservedTokens = typeof tokenRate?.reserved_tokens === 'string' && /^\d+$/.test(tokenRate.reserved_tokens) ? BigInt(tokenRate.reserved_tokens) : 0n;
  const showConcurrency = activeRequests > 0;
  const showTokens = unboundedRequests > 0 || reservedTokens > 0n;
  return <Card>
    <CardHeader><CardTitle>{uiT("Usage")}</CardTitle></CardHeader>
    <CardContent>
      <KeyTokenUsage token={token} endpoint={keyPath} />
      {concurrency && activeRequests > 0 && <p className="mt-3 text-xs text-muted-foreground">{activeRequests.toLocaleString(readUILocale())}{" "}{uiT("unresolved requests at last refresh.")}</p>}
      {tokenRate && <p className="mt-1 text-xs text-muted-foreground">{tokenRate.committed_tokens === null ? uiT("Committed usage unknown") : uiF("{0} tokens committed", [BigInt(tokenRate.committed_tokens).toLocaleString(readUILocale())])}{" "}{uiT("at last refresh.")}{unboundedRequests > 0 ? uiF(" {0} {1} no usage estimate.", [unboundedRequests, unboundedRequests === 1 ? uiT("request has") : uiT("requests have")]) : ''}</p>}
      {(showConcurrency || showTokens) && <div className="mt-2 flex flex-wrap gap-x-4">
        {showConcurrency && <KeyCapacity onInspectRequest={onInspectRequest} token={token} endpoint={keyPath} kind="concurrency" />}
        {showTokens && <KeyCapacity onInspectRequest={onInspectRequest} token={token} endpoint={keyPath} kind="tokens" />}
      </div>}
    </CardContent>
  </Card>;
}
