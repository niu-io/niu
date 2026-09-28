import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowUpRight, FlaskConical, Play } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { money } from '@/lib/money';

type Scope = { organizationId: string; projectId: string };
type KeyReceipt = { id: string; token: string };
type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
type ChatResponse = { choices?: Array<{ message?: { content?: unknown }; delta?: { content?: unknown } }>; usage?: Usage };
type RequestLedgerEntry = {
  attempt_id: string;
  cash_nanos: string | null;
  api_equivalent_nanos: string | null;
  currency: string | null;
};
type ComparisonResult = {
  model: string;
  content: string;
  elapsedMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  attemptId: string | null;
  error: string | null;
  phase: 'connecting' | 'streaming' | 'complete' | 'failed' | 'cancelled';
  cashNanos: string | null;
  apiEquivalentNanos: string | null;
  currency: string | null;
};
type PendingKey = { path: string; adminToken: string };
type ComparisonMetric = 'requests' | 'elapsed' | 'prompt' | 'completion' | 'total' | 'cash' | 'api';
const maxComparisonModels = 4;
const minComparisonModels = 2;

const comparisonMetrics: Array<{ key: ComparisonMetric; label: string }> = [
  { key: 'requests', label: 'Client attempts' },
  { key: 'elapsed', label: 'Client round-trip' },
  { key: 'prompt', label: 'Prompt tokens' },
  { key: 'completion', label: 'Output tokens' },
  { key: 'total', label: 'Total tokens' },
  { key: 'cash', label: 'Settled cash cost' },
  { key: 'api', label: 'API-equivalent cost' },
];

function metricValue(result: ComparisonResult, metric: ComparisonMetric) {
  if (metric === 'requests') return '1';
  if (metric === 'elapsed') return `${result.elapsedMs.toLocaleString()} ms${result.phase === 'failed' ? ' · failed' : result.phase === 'cancelled' ? ' · cancelled' : result.phase === 'streaming' || result.phase === 'connecting' ? ' · running' : ''}`;
  if (metric === 'prompt') return result.promptTokens === null ? 'Unknown' : result.promptTokens.toLocaleString();
  if (metric === 'completion') return result.completionTokens === null ? 'Unknown' : result.completionTokens.toLocaleString();
  if (metric === 'total') return result.totalTokens === null ? 'Unknown' : result.totalTokens.toLocaleString();
  const nanos = metric === 'cash' ? result.cashNanos : result.apiEquivalentNanos;
  return nanos !== null && result.currency ? money(nanos, result.currency) : 'Unknown';
}

function numericDelta(baseline: number, candidate: number, unit: 'ms' | 'tokens') {
  if (baseline === candidate) return 'Same';
  const sign = candidate < baseline ? '−' : '+';
  return `${sign}${Math.abs(candidate - baseline).toLocaleString()} ${unit}`;
}

function metricDifference(baseline: ComparisonResult, candidate: ComparisonResult, metric: ComparisonMetric) {
  if (metric === 'requests') return 'Same';
  if (baseline.phase !== 'complete' || candidate.phase !== 'complete') return 'Not comparable';
  if (metric === 'elapsed') return numericDelta(baseline.elapsedMs, candidate.elapsedMs, 'ms');
  if (metric === 'prompt' || metric === 'completion' || metric === 'total') {
    const baselineValue = metric === 'prompt' ? baseline.promptTokens : metric === 'completion' ? baseline.completionTokens : baseline.totalTokens;
    const candidateValue = metric === 'prompt' ? candidate.promptTokens : metric === 'completion' ? candidate.completionTokens : candidate.totalTokens;
    return baselineValue === null || candidateValue === null ? 'Unknown' : numericDelta(baselineValue, candidateValue, 'tokens');
  }

  const baselineValue = metric === 'cash' ? baseline.cashNanos : baseline.apiEquivalentNanos;
  const candidateValue = metric === 'cash' ? candidate.cashNanos : candidate.apiEquivalentNanos;
  if (baselineValue === null || candidateValue === null || !baseline.currency || !candidate.currency) return 'Unknown';
  if (baseline.currency !== candidate.currency) return 'Different currencies';
  const baselineAmount = BigInt(baselineValue);
  const candidateAmount = BigInt(candidateValue);
  if (baselineAmount === candidateAmount) return 'Same';
  const sign = candidateAmount < baselineAmount ? '−' : '+';
  const difference = candidateAmount < baselineAmount ? baselineAmount - candidateAmount : candidateAmount - baselineAmount;
  return `${sign}${money(difference.toString(), baseline.currency)}`;
}

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: { message?: unknown } }).error;
    if (typeof error?.message === 'string' && error.message.trim()) return error.message;
  }
  return fallback;
}

async function responseData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as { data?: T } | null;
  if (!response.ok) throw new Error(errorMessage(payload, `Request failed (${response.status}).`));
  return (payload && 'data' in payload ? payload.data : payload) as T;
}

function responseText(value: unknown) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(part => part && typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : '').filter(Boolean).join('\n');
  }
  return value == null ? '' : JSON.stringify(value, null, 2);
}

function tokenCount(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function runModel(
  model: string,
  apiKey: string,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  maxTokens: number,
  temperature: number,
  signal: AbortSignal,
  onUpdate: (result: ComparisonResult) => void,
): Promise<ComparisonResult> {
  const startedAt = performance.now();
  let attemptId: string | null = null;
  let content = '';
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let totalTokens: number | null = null;
  const result = (phase: ComparisonResult['phase'], error: string | null = null): ComparisonResult => ({
    model,
    content,
    elapsedMs: Math.round(performance.now() - startedAt),
    promptTokens,
    completionTokens,
    totalTokens,
    attemptId,
    error,
    phase,
    cashNanos: null,
    apiEquivalentNanos: null,
    currency: null,
  });

  function applyUsage(usage: Usage | undefined) {
    promptTokens = tokenCount(usage?.prompt_tokens) ?? promptTokens;
    completionTokens = tokenCount(usage?.completion_tokens) ?? completionTokens;
    totalTokens = tokenCount(usage?.total_tokens) ?? (promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : totalTokens);
  }

  try {
    const response = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ model, messages, max_completion_tokens: maxTokens, temperature, stream: true }),
      signal,
    });
    attemptId = response.headers.get('x-niu-attempt-id');
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const failed = result('failed', errorMessage(payload, `Niu returned ${response.status}.`));
      onUpdate(failed);
      return failed;
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      const payload = await response.json().catch(() => null) as ChatResponse | null;
      content = responseText(payload?.choices?.[0]?.message?.content);
      applyUsage(payload?.usage);
      const complete = result('complete');
      onUpdate(complete);
      return complete;
    }
    if (!response.body) throw new Error('Niu returned an empty streaming response.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    let completed = false;
    const consumeEvent = (event: string) => {
      const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim();
      if (!data || data === '[DONE]') return;
      let payload: ChatResponse;
      try { payload = JSON.parse(data) as ChatResponse; }
      catch { throw new Error('Niu returned malformed streaming data.'); }
      const choice = payload.choices?.[0];
      content += responseText(choice?.delta?.content);
      applyUsage(payload.usage);
      onUpdate(result('streaming'));
    };

    while (!completed) {
      const chunk = await reader.read();
      buffered += decoder.decode(chunk.value, { stream: !chunk.done });
      let boundary = buffered.search(/\r?\n\r?\n/);
      while (boundary >= 0) {
        const event = buffered.slice(0, boundary);
        const separator = buffered.slice(boundary).match(/^\r?\n\r?\n/)?.[0].length ?? 2;
        buffered = buffered.slice(boundary + separator);
        consumeEvent(event);
        boundary = buffered.search(/\r?\n\r?\n/);
      }
      completed = chunk.done;
    }
    if (buffered.trim()) consumeEvent(buffered);
    const complete = result('complete');
    onUpdate(complete);
    return complete;
  } catch (cause) {
    const cancelled = signal.aborted || (cause instanceof DOMException && cause.name === 'AbortError');
    const failed = result(cancelled ? 'cancelled' : 'failed', cancelled ? null : cause instanceof Error ? cause.message : 'The request could not reach Niu.');
    onUpdate(failed);
    return failed;
  }
}

export default function PlaygroundView({ token, models, canCreateKeys, initialScope }: {
  token: string;
  models: string[];
  canCreateKeys: boolean;
  initialScope: Scope | null;
}) {
  const location = useLocation();
  const pendingKey = useRef<PendingKey | null>(null);
  const comparisonController = useRef<AbortController | null>(null);
  const organization = initialScope?.organizationId ?? '';
  const project = initialScope?.projectId ?? '';
  const modelSignature = models.join('\u0000');
  const modelAliases = useMemo(() => [...new Set(models)], [modelSignature]);
  const [selectedModels, setSelectedModels] = useState<string[]>(() => modelAliases.slice(0, minComparisonModels));
  const [systemPrompt, setSystemPrompt] = useState('');
  const [prompt, setPrompt] = useState('');
  const [maxTokens, setMaxTokens] = useState(512);
  const [temperature, setTemperature] = useState(0.7);
  const [existingKey, setExistingKey] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [keyWarning, setKeyWarning] = useState('');
  const [results, setResults] = useState<ComparisonResult[] | null>(null);

  const workspaceRoot = location.pathname.match(/^\/workspaces\/[^/]+/)?.[0] ?? '/workspaces/default';

  useEffect(() => {
    setSelectedModels(current => {
      const available = current.filter(model => modelAliases.includes(model));
      return available.length === 0 && modelAliases.length >= minComparisonModels
        ? modelAliases.slice(0, minComparisonModels)
        : available;
    });
  }, [modelAliases]);

  useEffect(() => {
    const cleanup = () => {
      comparisonController.current?.abort();
      comparisonController.current = null;
      const pending = pendingKey.current;
      if (!pending) return;
      void fetch(pending.path, { method: 'DELETE', headers: { authorization: `Bearer ${pending.adminToken}` }, keepalive: true });
      pendingKey.current = null;
    };
    window.addEventListener('pagehide', cleanup);
    return () => { window.removeEventListener('pagehide', cleanup); cleanup(); };
  }, []);

  function clearComparison() {
    setResults(null);
    setNotice('');
    setError('');
    setKeyWarning('');
  }

  function toggleModel(model: string) {
    setSelectedModels(current => {
      if (current.includes(model)) return current.filter(selected => selected !== model);
      if (current.length >= maxComparisonModels) return current;
      return [...current, model];
    });
    clearComparison();
  }

  async function loadCharges(attemptIds: string[]) {
    if (!attemptIds.length) return new Map<string, RequestLedgerEntry>();
    const base = `/admin/v1/organizations/${encodeURIComponent(organization)}/projects/${encodeURIComponent(project)}`;
    const response = await fetch(`${base}/requests?limit=100`, { headers: { authorization: `Bearer ${token}` } });
    const entries = await responseData<RequestLedgerEntry[]>(response);
    return new Map(entries.filter(entry => attemptIds.includes(entry.attempt_id)).map(entry => [entry.attempt_id, entry]));
  }

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearComparison();
    if (!organization || !project || !prompt.trim() || selectedModels.length < minComparisonModels || selectedModels.length > maxComparisonModels) return;
    if (!canCreateKeys && !existingKey.trim()) {
      setError('Enter a project-scoped API key to use with this read-only session.');
      return;
    }

    setRunning(true);
    setResults(selectedModels.map(model => ({
      model, content: '', elapsedMs: 0, promptTokens: null, completionTokens: null, totalTokens: null,
      attemptId: null, error: null, phase: 'connecting', cashNanos: null, apiEquivalentNanos: null, currency: null,
    })));
    const base = `/admin/v1/organizations/${encodeURIComponent(organization)}/projects/${encodeURIComponent(project)}`;
    let apiKey = existingKey.trim();
    let issuedKeyId: string | null = null;
    const controller = new AbortController();
    comparisonController.current = controller;
    try {
      if (canCreateKeys) {
        const response = await fetch(`${base}/keys`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Niu Playground comparison', allowed_models: selectedModels, ttl_seconds: 900 }),
          signal: controller.signal,
        });
        const issued = await responseData<KeyReceipt>(response);
        if (!issued.token || !issued.id) throw new Error('Niu did not issue a temporary project key.');
        apiKey = issued.token;
        issuedKeyId = issued.id;
        pendingKey.current = { path: `${base}/keys/${encodeURIComponent(issued.id)}`, adminToken: token };
      }

      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (systemPrompt.trim()) messages.push({ role: 'system', content: systemPrompt.trim() });
      messages.push({ role: 'user', content: prompt.trim() });
      const updateResult = (next: ComparisonResult) => setResults(current => current?.map(item => item.model === next.model ? { ...item, ...next } : item) ?? current);
      const completed = await Promise.all(selectedModels.map(model => runModel(model, apiKey, messages, maxTokens, temperature, controller.signal, updateResult)));
      const attemptIds = completed.flatMap(result => result.attemptId ? [result.attemptId] : []);
      try {
        const charges = await loadCharges(attemptIds);
        setResults(completed.map(result => {
          const entry = result.attemptId ? charges.get(result.attemptId) : undefined;
          return {
            ...result,
            cashNanos: entry?.cash_nanos ?? null,
            apiEquivalentNanos: entry?.api_equivalent_nanos ?? null,
            currency: entry?.currency ?? null,
          };
        }));
      } catch {
        setResults(completed);
        setNotice('Responses are ready. Niu could not retrieve settled cost for this comparison; check Usage & cost or try again later.');
      }
    } catch (cause) {
      if (controller.signal.aborted) {
        setResults(current => current?.map(item => item.phase === 'connecting' || item.phase === 'streaming' ? { ...item, phase: 'cancelled' } : item) ?? current);
      } else {
        setError(cause instanceof Error ? cause.message : 'Niu could not start this comparison.');
      }
    } finally {
      if (issuedKeyId) {
        try {
          const response = await fetch(`${base}/keys/${encodeURIComponent(issuedKeyId)}`, {
            method: 'DELETE', headers: { authorization: `Bearer ${token}` },
          });
          if (!response.ok) throw new Error('Niu could not revoke the temporary key.');
          pendingKey.current = null;
        } catch {
          setKeyWarning('The temporary project key could not be revoked. Niu will expire it automatically within 15 minutes.');
        }
      }
      if (comparisonController.current === controller) comparisonController.current = null;
      setRunning(false);
    }
  }

  function cancelComparison() {
    comparisonController.current?.abort();
  }

  const canCompare = canCreateKeys || existingKey.trim().length > 0;
  const ready = Boolean(organization && project && prompt.trim() && selectedModels.length >= minComparisonModels && selectedModels.length <= maxComparisonModels && temperature >= 0 && temperature <= 2 && canCompare && !running);

  return <div className="playground-view">
    <div className="page-heading playground-page-heading">
      <div><p className="page-subtitle">Send the same prompt through Niu and compare model responses, latency, tokens and known cost side by side.</p></div>
      <Badge variant="outline"><Play size={13} />Live requests</Badge>
    </div>

    <div className="playground-live-note" role="note"><AlertTriangle size={18} /><p><strong>Live comparison:</strong> one request per model; provider charges may apply. Both providers receive your prompt. Niu stores request metadata, not prompt or response content.</p></div>

    {!initialScope
      ? <section className="panel playground-empty"><FlaskConical size={22} /><h2>Choose a workspace</h2><p>Select or create a project from the workspace switcher to compare models.</p></section>
      : modelAliases.length < 2
      ? <section className="panel playground-empty"><FlaskConical size={22} /><h2>{modelAliases.length === 0 ? 'Connect a provider to start' : 'Add a model to compare'}</h2><p>{modelAliases.length === 0 ? 'Connect a provider and add a model route. Your route will appear here.' : 'Add one more enabled model route to compare responses side by side.'}</p><Button asChild variant="outline"><Link to={`${workspaceRoot}/vendors`}>{modelAliases.length === 0 ? 'Connect provider' : 'Add model route'}<ArrowUpRight /></Link></Button></section>
      : <section className="panel playground-composer-panel" aria-labelledby="playground-composer-title">
      <div className="playground-panel-heading"><div><h2 id="playground-composer-title">Compare models</h2><p>One shared prompt, sent to 2–4 models in parallel.</p></div></div>
        <form onSubmit={compare} className="playground-composer">
          <fieldset className="playground-model-roster" disabled={running} aria-describedby="playground-roster-help">
            <legend><span>Models</span><span className="playground-model-count">{selectedModels.length} selected · up to {maxComparisonModels}</span></legend>
            <div className="playground-model-options">
              {modelAliases.map(model => {
                const selected = selectedModels.includes(model);
                return <button
                  key={model}
                  type="button"
                  className="playground-model-option"
                  aria-pressed={selected}
                  disabled={!selected && selectedModels.length >= maxComparisonModels}
                  onClick={() => toggleModel(model)}
                >
                  <span>{model}</span><span className="playground-model-option-state">{selected ? 'Selected' : 'Add'}</span>
                </button>;
              })}
            </div>
            <p id="playground-roster-help" className="playground-roster-help">
              {selectedModels.length < minComparisonModels ? 'Select one more model to compare.' : 'One parallel request per selected model.'}
            </p>
          </fieldset>
          <details className="playground-system-prompt">
            <summary>System instructions <span>Optional · applied to both models</span></summary>
            <Label htmlFor="playground-system-prompt">Instructions<textarea id="playground-system-prompt" rows={3} maxLength={12000} disabled={running} value={systemPrompt} onChange={event => { setSystemPrompt(event.target.value); clearComparison(); }} placeholder="Give both models the same role or constraints…" /></Label>
          </details>
          <Label htmlFor="playground-user-prompt">Prompt<textarea id="playground-user-prompt" rows={7} maxLength={12000} required disabled={running} value={prompt} onChange={event => { setPrompt(event.target.value); clearComparison(); }} placeholder="Describe what you want both models to do…" /></Label>
          <div className="playground-composer-footer">
            <Label htmlFor="playground-max-tokens">Maximum output tokens<NativeSelect id="playground-max-tokens" disabled={running} value={String(maxTokens)} onChange={event => { setMaxTokens(Number(event.target.value)); clearComparison(); }}><NativeSelectOption value="256">256</NativeSelectOption><NativeSelectOption value="512">512</NativeSelectOption><NativeSelectOption value="1024">1,024</NativeSelectOption></NativeSelect></Label>
            <Label htmlFor="playground-temperature">Temperature<Input id="playground-temperature" type="number" min="0" max="2" step="0.1" disabled={running} value={temperature} onChange={event => { setTemperature(Number(event.target.value)); clearComparison(); }} /></Label>
            {!canCreateKeys && <Label htmlFor="playground-existing-key">Project API key<Input id="playground-existing-key" type="password" autoComplete="off" spellCheck={false} disabled={running} value={existingKey} onChange={event => { setExistingKey(event.target.value); clearComparison(); }} placeholder="Paste a scoped Niu key" /></Label>}
            {running
              ? <Button type="button" variant="outline" onClick={cancelComparison}>Cancel comparison</Button>
              : <Button type="submit" disabled={!ready}>{`Compare ${selectedModels.length} model${selectedModels.length === 1 ? '' : 's'}`}<Play size={15} /></Button>}
          </div>
          <p className="playground-key-note">{canCreateKeys ? 'A temporary project key is limited to the selected aliases and revoked after the comparison.' : 'The project key stays in this page’s memory and is sent only to Niu.'}</p>
          {error && <p role="alert" className="error-text">{error}</p>}
        </form>
      </section>}

    {keyWarning && <p className="playground-key-warning" role="status">{keyWarning}</p>}
    {notice && <p className="playground-result-notice" role="status">{notice}</p>}
    {results && <section className="playground-results" aria-labelledby="playground-results-title">
      <div className="playground-results-heading"><div><p>Same instructions, prompt, temperature, and output limit</p><h2 id="playground-results-title">Comparison</h2></div><span>Baseline: {results[0]?.model} · no winner inferred</span></div>
      <div className="playground-measurements">
        <div className="playground-measurements-heading"><h3>Measured comparison</h3><p>Client round-trip · provider-reported tokens · settled prices when available</p></div>
        <div className="playground-metric-table-wrap"><table className="playground-metric-table" style={{ minWidth: `${516 + (results.length - 2) * 224}px` }}><caption className="playground-table-caption">Δ is each model’s value minus the baseline. Positive means more; negative means less.</caption><thead><tr>
          <th scope="col">Measure</th>
          {results.map((result, index) => <Fragment key={result.model}>
            <th scope="col" className={index === 0 ? 'playground-baseline-column' : undefined}>{index === 0 ? <>Baseline<br /><span>{result.model}</span></> : result.model}</th>
            {index > 0 && <th scope="col" className="playground-delta-heading" aria-label={`Difference for ${result.model} versus baseline`}>Δ vs baseline</th>}
          </Fragment>)}
        </tr></thead><tbody>{comparisonMetrics.map(metric => <tr key={metric.key}>
          <th scope="row">{metric.label}</th>
          {results.map((result, index) => <Fragment key={result.model}>
            <td className={index === 0 ? 'playground-baseline-column' : undefined}>{metricValue(result, metric.key)}</td>
            {index > 0 && <td className="playground-delta-cell">{results[0] ? metricDifference(results[0], result, metric.key) : 'Not comparable'}</td>}
          </Fragment>)}
        </tr>)}</tbody></table></div>
      </div>
      <div className="playground-result-grid">{results.map((result, index) => <article className="panel playground-result-card" key={`${result.model}-${index}`}>
        <div className="playground-result-card-heading"><div><span className={`playground-model-mark model-${index % 2}`}>{String.fromCharCode(65 + index)}</span><h3>{result.model}</h3></div><Badge variant={result.phase === 'failed' ? 'destructive' : 'secondary'}>{result.phase === 'failed' ? 'Request failed' : result.phase === 'cancelled' ? 'Cancelled' : result.phase === 'connecting' ? 'Connecting…' : result.phase === 'streaming' ? 'Streaming…' : 'Response received'}</Badge></div>
        {result.phase === 'failed' ? <p className="playground-response-error">{result.error}</p> : result.content ? <div className="playground-response">{result.content}</div> : result.phase === 'cancelled' ? <p className="playground-response-error">Cancelled before any output arrived.</p> : <div className="playground-response playground-response-pending">{result.phase === 'streaming' ? 'Waiting for the first token…' : 'Waiting for a response…'}</div>}
        {result.attemptId && <>
          <details className="playground-attempt-details"><summary>Gateway attempt</summary><code>{result.attemptId}</code></details>
          <Link className="playground-attempt-link" to={`${workspaceRoot}/executions?modelAlias=${encodeURIComponent(result.model)}#gateway-attempt-${encodeURIComponent(result.attemptId)}`}>
            Use this model in Niu<ArrowUpRight size={13} />
          </Link>
        </>}
      </article>)}</div>
      <p className="playground-evidence-note">Unknown means no settled cost was returned for that request. This prompt comparison does not measure task acceptance or establish quality or savings. <Link to={`${workspaceRoot}/executions`}>View gateway activity<ArrowUpRight size={13} /></Link><Link to={`${workspaceRoot}/benchmarks`}>Open Benchmarks<ArrowUpRight size={13} /></Link></p>
    </section>}
  </div>;
}
