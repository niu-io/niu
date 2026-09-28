import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Check, CircleDollarSign, ClipboardCopy, Clock3, FlaskConical, Hash, KeyRound, MessageSquarePlus, Plus, Play, Settings2, Square, Timer } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Badge } from '@/components/ui/badge';
import ModalFrame from '@/components/ModalFrame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dropdown, DropdownOption } from '@/components/ui/dropdown';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { money } from '@/lib/money';
import { useConsoleContext } from '@/app/console-context';
import { workspacePathSegment } from '@/app/workspace-route';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity } from '@/lib/providers';
import ReactMarkdown from 'react-markdown';

type Scope = { organizationId: string; workspaceId: string; workspaceName?: string };
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
type SavedComparison = { id: string; prompt: string; results: ComparisonResult[]; createdAt: number };
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

const promptCategories = [
  { id: 'all', label: 'All tasks' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'build', label: 'Build' },
  { id: 'writing', label: 'Writing' },
] as const;

const promptExamples = [
  { id: 'car-wash', category: 'reasoning', title: 'Car wash', summary: 'Should you walk or drive?', text: 'I need to wash my car. The car wash is 50 meters away. Should I walk or drive?' },
  { id: 'context-window', category: 'reasoning', title: 'Context budget', summary: 'How many 8K-token turns fit in 128K?', text: 'A model has a 128K-token context window. If each turn in a conversation uses 8,000 tokens, about how many turns fit? Explain the calculation and what could reduce the usable number.' },
  { id: 'snake-game', category: 'build', title: 'Snake game', summary: 'Build an arrow-key controlled game.', text: 'Build a small snake game controlled with the arrow keys. Include food, collision detection, and a restart option.' },
  { id: 'reaction-test', category: 'build', title: 'Reaction-time test', summary: 'Record the milliseconds for each click.', text: 'Build a reaction-time mini game. Wait a random amount of time before showing a target, record how many milliseconds the user takes to click it, and show the results.' },
  { id: 'file-tree', category: 'build', title: 'Collapsible file tree', summary: 'Use plain HTML and CSS.', text: 'Use plain HTML and CSS to build a collapsible file tree. Make the folder and file hierarchy clear and keep the controls accessible.' },
  { id: 'support-reply', category: 'writing', title: 'Support reply', summary: 'Respond to a frustrated customer with empathy.', text: 'Rewrite this complaint as an empathetic customer-support reply: “Your API has been down for three days, hurting our business. We’ll switch providers if this continues.” Acknowledge the impact, explain the next step, and avoid making promises you cannot verify.' },
  { id: 'job-post', category: 'writing', title: 'Backend engineer job post', summary: 'A Java and MySQL role with clear expectations.', text: 'Write a concise job post for a backend engineer role. The person should be skilled in Java and MySQL, take ownership of their work, and be comfortable with occasional overtime when releases require it.' },
] as const;

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

export default function PlaygroundView({ token, models, initialScope }: {
  token: string;
  models: string[];
  initialScope: Scope | null;
}) {
  const location = useLocation();
  const comparisonController = useRef<AbortController | null>(null);
  const customizedModels = useRef(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const { chatKeys, workspace, workspaces } = useConsoleContext();
  const organization = initialScope?.organizationId ?? '';
  const workspaceId = initialScope?.workspaceId ?? '';
  const modelSignature = models.join('\u0000');
  const modelAliases = useMemo(() => [...new Set(models)], [modelSignature]);
  const [selectedModels, setSelectedModels] = useState<string[]>(() => modelAliases.slice(0, minComparisonModels));
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const [modelCategory, setModelCategory] = useState('popular');
  const [promptCategory, setPromptCategory] = useState<(typeof promptCategories)[number]['id']>('all');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [prompt, setPrompt] = useState('');
  const [maxTokens, setMaxTokens] = useState(512);
  const [temperature, setTemperature] = useState(0.7);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [results, setResults] = useState<ComparisonResult[] | null>(null);
  const [history, setHistory] = useState<SavedComparison[]>([]);
  const [activeComparisonId, setActiveComparisonId] = useState<string | null>(null);
  const [copiedResponse, setCopiedResponse] = useState('');

  const workspaceRoot = workspace
    ? `/workspaces/${workspacePathSegment(workspace, workspaces)}`
    : '/workspaces/default';
  const sessionKeys = chatKeys.filter(key => key.organizationId === organization && key.projectId === workspaceId);
  const selectedKey = sessionKeys.find(key => key.id === selectedKeyId);
  const usableModels = selectedKey ? modelAliases.filter(model => selectedKey.allowedModels.includes(model)) : modelAliases;
  const apiKey = selectedKey?.token ?? manualKey.trim();
  const keyIds = sessionKeys.map(key => key.id).join('\u0000');

  useEffect(() => {
    const preferred = new URLSearchParams(location.search).get('key');
    if (preferred && sessionKeys.some(key => key.id === preferred)) setSelectedKeyId(preferred);
    else if (!selectedKeyId || !sessionKeys.some(key => key.id === selectedKeyId)) setSelectedKeyId(sessionKeys[0]?.id ?? 'manual');
  }, [location.search, keyIds]);

  useEffect(() => {
    const preferred = new URLSearchParams(location.search).get('model');
    if (!preferred || !usableModels.includes(preferred)) return;
    customizedModels.current = true;
    setSelectedModels(current => current.includes(preferred)
      ? current
      : [preferred, ...current.filter(model => model !== preferred)].slice(0, maxComparisonModels));
  }, [location.search, usableModels]);

  useEffect(() => {
    setSelectedModels(current => {
      if (!customizedModels.current) return usableModels.slice(0, minComparisonModels);
      const available = current.filter(model => usableModels.includes(model));
      return available.length < minComparisonModels && usableModels.length >= minComparisonModels
        ? [...available, ...usableModels.filter(model => !available.includes(model))].slice(0, minComparisonModels)
        : available;
    });
  }, [usableModels, selectedKeyId]);

  useEffect(() => () => comparisonController.current?.abort(), []);

  function clearComparison() {
    setResults(null);
    setNotice('');
    setError('');
    setActiveComparisonId(null);
  }

  function startNewComparison() {
    comparisonController.current?.abort();
    if (transcriptRef.current) transcriptRef.current.scrollTop = 0;
    setPrompt('');
    setSystemPrompt('');
    setPromptCategory('all');
    setResults(null);
    setNotice('');
    setError('');
    setActiveComparisonId(null);
    setRunning(false);
  }

  function openComparison(item: SavedComparison) {
    if (running) comparisonController.current?.abort();
    setRunning(false);
    setActiveComparisonId(item.id);
    setPrompt(item.prompt);
    setResults(item.results);
    setNotice('');
    setError('');
  }

  function toggleModel(model: string) {
    customizedModels.current = true;
    setSelectedModels(current => {
      if (current.includes(model)) return current.filter(selected => selected !== model);
      if (current.length >= maxComparisonModels) return current;
      return [...current, model];
    });
    clearComparison();
  }

  const modelCategories = useMemo(() => {
    const coding = usableModels.filter(model => /(?:^|[\/_ .-])(?:code|coder|codex|codestral|devstral|starcoder)(?:$|[\/_ .:-])/i.test(model));
    const reasoning = usableModels.filter(model => /reason|thinking|deepseek-r1|qwq|(?:^|[\/_ .-])o[134](?:$|[\/_ .:-])/i.test(model));
    return [
      { id: 'popular', label: 'Popular', models: usableModels.slice(0, 8) },
      ...(coding.length >= 2 ? [{ id: 'coding', label: 'Coding', models: coding }] : []),
      ...(reasoning.length >= 2 ? [{ id: 'reasoning', label: 'Reasoning', models: reasoning }] : []),
      { id: 'all', label: 'All routes', models: usableModels },
    ];
  }, [usableModels]);
  const activeModelCategory = modelCategories.find(category => category.id === modelCategory) ?? modelCategories[0];
  const filteredModelAliases = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();
    const source = query ? usableModels : activeModelCategory?.models ?? usableModels;
    return source.filter(model => !query || model.toLowerCase().includes(query)).slice(0, 80);
  }, [usableModels, modelQuery, activeModelCategory]);

  async function loadCharges(attemptIds: string[]) {
    if (!attemptIds.length) return new Map<string, RequestLedgerEntry>();
    const base = '/admin/v1/organizations/' + encodeURIComponent(organization) + '/projects/' + encodeURIComponent(workspaceId);
    const response = await fetch(base + '/requests?limit=100', { headers: { authorization: 'Bearer ' + token } });
    const entries = await responseData<RequestLedgerEntry[]>(response);
    return new Map(entries.filter(entry => attemptIds.includes(entry.attempt_id)).map(entry => [entry.attempt_id, entry]));
  }

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    setError('');
    if (!organization || !workspaceId || !prompt.trim() || selectedModels.length < minComparisonModels || selectedModels.length > maxComparisonModels) return;
    if (!apiKey) {
      setApiSettingsOpen(true);
      return;
    }
    if (usableModels.length < minComparisonModels) {
      setApiSettingsOpen(true);
      return;
    }

    const comparisonId = (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + '-' + Math.random().toString(36).slice(2));
    const startedAt = Date.now();
    const initialResults: ComparisonResult[] = selectedModels.map(model => ({
      model, content: '', elapsedMs: 0, promptTokens: null, completionTokens: null, totalTokens: null,
      attemptId: null, error: null, phase: 'connecting', cashNanos: null, apiEquivalentNanos: null, currency: null,
    }));
    setActiveComparisonId(comparisonId);
    setResults(initialResults);
    setHistory(current => [{ id: comparisonId, prompt: prompt.trim(), results: initialResults, createdAt: startedAt }, ...current].slice(0, 20));
    setRunning(true);
    const controller = new AbortController();
    comparisonController.current = controller;
    try {
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (systemPrompt.trim()) messages.push({ role: 'system', content: systemPrompt.trim() });
      messages.push({ role: 'user', content: prompt.trim() });
      const updateResult = (next: ComparisonResult) => {
        setResults(current => current?.map(item => item.model === next.model ? { ...item, ...next } : item) ?? current);
        setHistory(current => current.map(item => item.id === comparisonId
          ? { ...item, results: item.results.map(result => result.model === next.model ? { ...result, ...next } : result) }
          : item));
      };
      const completed = await Promise.all(selectedModels.map(model => runModel(model, apiKey, messages, maxTokens, temperature, controller.signal, updateResult)));
      const attemptIds = completed.flatMap(result => result.attemptId ? [result.attemptId] : []);
      try {
        const charges = await loadCharges(attemptIds);
        const priced = completed.map(result => {
          const entry = result.attemptId ? charges.get(result.attemptId) : undefined;
          return {
            ...result,
            cashNanos: entry?.cash_nanos ?? null,
            apiEquivalentNanos: entry?.api_equivalent_nanos ?? null,
            currency: entry?.currency ?? null,
          };
        });
        setResults(priced);
        setHistory(current => current.map(item => item.id === comparisonId ? { ...item, results: priced } : item));
      } catch {
        setResults(completed);
        setHistory(current => current.map(item => item.id === comparisonId ? { ...item, results: completed } : item));
        setNotice('Responses are ready. Settled cost is not available yet.');
      }
    } catch (cause) {
      if (controller.signal.aborted) {
        setResults(current => {
          const cancelled = current?.map(item => item.phase === 'connecting' || item.phase === 'streaming' ? { ...item, phase: 'cancelled' as const } : item) ?? null;
          if (cancelled) setHistory(items => items.map(item => item.id === comparisonId ? { ...item, results: cancelled } : item));
          return cancelled;
        });
      } else {
        setError(cause instanceof Error ? cause.message : 'Niu could not start this comparison.');
      }
    } finally {
      if (comparisonController.current === controller) comparisonController.current = null;
      setRunning(false);
    }
  }

  function cancelComparison() {
    comparisonController.current?.abort();
  }

  async function copyResponse(model: string, content: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
      await navigator.clipboard.writeText(content);
      setCopiedResponse(model);
      window.setTimeout(() => setCopiedResponse(current => current === model ? '' : current), 1800);
    } catch {
      setNotice('Clipboard access is unavailable. Select the response text to copy it.');
    }
  }

  const canSubmit = Boolean(organization && workspaceId && prompt.trim() && selectedModels.length >= minComparisonModels && selectedModels.length <= maxComparisonModels && temperature >= 0 && temperature <= 2 && !running);
  const selectedKeyLabel = selectedKey?.name ?? (manualKey ? 'Workspace key added' : 'Choose API key');
  const visiblePromptExamples = promptExamples.filter(item => promptCategory === 'all' || item.category === promptCategory);

  return <div className="playground-view">
    <div className="playground-chat-layout">
      <aside className="playground-history" aria-label="Recent comparisons">
        <div className="playground-history-heading"><h2>Recent</h2><Button type="button" variant="ghost" size="sm" onClick={startNewComparison} disabled={running}><MessageSquarePlus size={16} />New</Button></div>
        <div className="playground-history-list">
          {history.length === 0
            ? <p className="playground-history-empty">No comparisons yet</p>
            : history.map(item => <button key={item.id} type="button" disabled={running} className={'playground-history-item' + (activeComparisonId === item.id ? ' is-active' : '')} onClick={() => openComparison(item)}>
              <span>{item.prompt.split('\n')[0]}</span>
            </button>)}
        </div>
      </aside>

      <section className="playground-chat-main" aria-label="Model comparison chat">
        <header className="playground-chat-toolbar">
          <div className="playground-toolbar-models">
            <span className="playground-toolbar-label">Models</span>
            <div className="playground-toolbar-chips">
              {selectedModels.length
                ? selectedModels.map((model, index) => <span className={'playground-toolbar-chip model-' + (index % 2)} key={model}><span className="playground-model-mark">{String.fromCharCode(65 + index)}</span>{model}</span>)
                : <span className="playground-toolbar-unselected">Select at least two</span>}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setModelQuery(''); setModelPickerOpen(true); }} disabled={running || modelAliases.length === 0}><Plus size={15} />Choose models</Button>
          </div>
          <div className="playground-toolbar-actions">
            <Button type="button" variant="outline" className="playground-key-trigger" onClick={() => setApiSettingsOpen(true)} aria-label={'API key: ' + selectedKeyLabel}>
              <KeyRound size={16} /><span>{selectedKeyLabel}</span>
            </Button>
            <Button type="button" variant="outline" size="icon" className="playground-chat-settings-trigger" onClick={() => setChatSettingsOpen(true)} disabled={running} aria-label="Chat settings" title="Chat settings"><Settings2 size={17} /></Button>
          </div>
        </header>

        <div ref={transcriptRef} className="playground-transcript" aria-live="polite">
          {!initialScope
            ? <div className="playground-chat-empty"><FlaskConical size={26} /><h2>Set up a workspace</h2><p>Create a workspace before connecting providers and comparing model routes.</p><Button asChild variant="outline"><Link to={`${workspaceRoot}/organization`}>Manage workspaces</Link></Button></div>
            : modelAliases.length < minComparisonModels
              ? <div className="playground-chat-empty"><FlaskConical size={26} /><h2>{modelAliases.length === 0 ? 'Connect a provider to start' : 'Add another model'}</h2><p>{modelAliases.length === 0 ? 'Add a provider and model route, then compare responses here.' : 'Chat compares at least two enabled model routes on the same prompt.'}</p><Button asChild variant="outline"><Link to={workspaceRoot + '/vendors'}>{modelAliases.length === 0 ? 'Connect provider' : 'Add model route'}<ArrowUpRight size={15} /></Link></Button></div>
              : !results && !prompt.trim()
                ? <div className="playground-first-run">
                  <div className="playground-first-run-heading"><h1>Same task. Different models.</h1><p>Compare responses, elapsed time, tokens, and cost.</p></div>
                  <div className="playground-starter-picker" aria-label="Example tasks">
                    <Tabs value={promptCategory} onValueChange={value => setPromptCategory(value as typeof promptCategory)} className="playground-starter-tabs">
                      <TabsList aria-label="Task category" className="playground-starter-categories">
                        {promptCategories.map(category => <TabsTrigger key={category.id} value={category.id} className="playground-starter-category">{category.label}</TabsTrigger>)}
                      </TabsList>
                    </Tabs>
                    <div className="playground-starters" aria-label="Example prompts">
                      {visiblePromptExamples.map(item => <button key={item.id} type="button" className="playground-starter" onClick={() => { setPrompt(item.text); setResults(null); setNotice(''); setError(''); setActiveComparisonId(null); }}><strong>{item.title}</strong><span>{item.summary}</span><ArrowRight size={16} aria-hidden="true" /></button>)}
                    </div>
                  </div>
                </div>
                : !results
                ? null
                : <div className="playground-comparison-thread">
                  <div className="playground-user-prompt"><span>You</span><p>{prompt}</p></div>
                  {error && <p role="alert" className="playground-chat-error">{error}</p>}
                  <section className="playground-results" aria-labelledby="playground-results-title">
                    <div className="playground-results-heading"><h2 id="playground-results-title">Responses</h2><span>{results.length} models</span></div>
                    <div className="playground-result-grid" data-model-count={results.length}>{results.map((result, index) => <article className="panel playground-result-card" key={result.model + '-' + index}>
                      <div className="playground-result-card-heading"><div><ProviderLogo provider={modelIdentity({ id: result.model })} size="small" /><h3>{result.model}</h3></div><Badge variant={result.phase === 'failed' ? 'destructive' : 'secondary'}>{result.phase === 'failed' ? 'Failed' : result.phase === 'cancelled' ? 'Cancelled' : result.phase === 'connecting' ? 'Connecting' : result.phase === 'streaming' ? 'Generating' : 'Complete'}</Badge></div>
                      {result.phase === 'failed' ? <p className="playground-response-error">{result.error}</p> : result.content ? <div className="playground-response"><ReactMarkdown>{result.content}</ReactMarkdown></div> : result.phase === 'cancelled' ? <p className="playground-response-error">Cancelled before any output arrived.</p> : <div className="playground-response playground-response-pending">{result.phase === 'streaming' ? 'Waiting for more output…' : 'Waiting for a response…'}</div>}
                      <div className="playground-result-footer">
                        <div className="playground-card-metrics">
                          <div><Clock3 size={15} /><span>Time</span><strong>{result.elapsedMs.toLocaleString()} ms</strong></div>
                          <div><Hash size={15} /><span>Tokens</span><strong>{result.totalTokens === null ? 'Unknown' : result.totalTokens.toLocaleString()}</strong></div>
                          <div><CircleDollarSign size={15} /><span>Settled cost</span><strong>{result.cashNanos !== null && result.currency ? money(result.cashNanos, result.currency) : 'Unknown'}</strong></div>
                        </div>
                        <div className="playground-result-actions">
                          {result.content && <Button type="button" variant="ghost" size="sm" aria-label={'Copy ' + result.model + ' response'} onClick={() => void copyResponse(result.model, result.content)}><ClipboardCopy size={14} />{copiedResponse === result.model ? 'Copied' : 'Copy'}</Button>}
                          {result.attemptId && <Link className="playground-attempt-link" to={workspaceRoot + '/executions?modelAlias=' + encodeURIComponent(result.model) + '#gateway-attempt-' + encodeURIComponent(result.attemptId)}>Inspect request<ArrowUpRight size={13} /></Link>}
                        </div>
                      </div>
                    </article>)}</div>
                    <details className="playground-measurement-details">
                      <summary><Timer size={16} />Compare measured usage</summary>
                      <div className="playground-measurements">
                        <div className="playground-metric-table-wrap"><table className="playground-metric-table" style={{ minWidth: (516 + (results.length - 2) * 224) + 'px' }}><caption className="playground-table-caption">Each value comes from these requests. Missing gateway evidence remains unknown.</caption><thead><tr>
                          <th scope="col">Measure</th>
                          {results.map((result, index) => <Fragment key={result.model}>
                            <th scope="col" className={index === 0 ? 'playground-baseline-column' : undefined}>{index === 0 ? <>Baseline<br /><span>{result.model}</span></> : result.model}</th>
                            {index > 0 && <th scope="col" className="playground-delta-heading" aria-label={'Difference for ' + result.model + ' versus baseline'}>Δ vs baseline</th>}
                          </Fragment>)}
                        </tr></thead><tbody>{comparisonMetrics.map(metric => <tr key={metric.key}>
                          <th scope="row">{metric.label}</th>
                          {results.map((result, index) => <Fragment key={result.model}>
                            <td className={index === 0 ? 'playground-baseline-column' : undefined}>{metricValue(result, metric.key)}</td>
                            {index > 0 && <td className="playground-delta-cell">{results[0] ? metricDifference(results[0], result, metric.key) : 'Not comparable'}</td>}
                          </Fragment>)}
                        </tr>)}</tbody></table></div>
                      </div>
                    </details>
                  </section>
                </div>}
          {error && !results && <p role="alert" className="playground-chat-error">{error}</p>}
          {notice && <p className="playground-result-notice" role="status">{notice}</p>}
        </div>

        {initialScope && modelAliases.length >= minComparisonModels && <form onSubmit={compare} className="playground-composer">
          <div className="playground-composer-surface">
            <Label htmlFor="playground-user-prompt" className="sr-only">Prompt for all selected models</Label>
            <textarea id="playground-user-prompt" rows={3} maxLength={12000} required disabled={running} value={prompt} onChange={event => { setPrompt(event.target.value); setResults(null); setNotice(''); setError(''); setActiveComparisonId(null); }} placeholder="Write a task to compare across models" />
            <div className="playground-composer-actions">
              {running
                ? <Button type="button" variant="outline" onClick={cancelComparison}><Square size={14} />Stop</Button>
                : <Button type="submit" disabled={!canSubmit}><span>Compare {selectedModels.length} models</span><Play size={15} /></Button>}
            </div>
          </div>
        </form>}
      </section>
    </div>

    <ModalFrame open={modelPickerOpen} onOpenChange={setModelPickerOpen} title="Choose models" description="Select two to four enabled routes. Each receives the same prompt." className="playground-model-dialog">
      <div className="playground-model-picker">
        <label className="model-search"><span className="sr-only">Search models</span><Input autoFocus value={modelQuery} onChange={event => setModelQuery(event.target.value)} placeholder="Search model routes" /></label>
        <div className="playground-model-categories" role="tablist" aria-label="Model categories">
          {modelCategories.map(category => <button key={category.id} type="button" role="tab" aria-selected={activeModelCategory?.id === category.id} className="playground-model-category" onClick={() => { setModelCategory(category.id); setModelQuery(''); }}>{category.label}<span>{category.models.length}</span></button>)}
        </div>
        <div className="playground-model-picker-list">{filteredModelAliases.map(model => {
          const selected = selectedModels.includes(model);
          return <button key={model} type="button" className="playground-model-picker-option" aria-pressed={selected} disabled={!selected && selectedModels.length >= maxComparisonModels} onClick={() => toggleModel(model)}>
            <span>{model}</span>{selected && <Check size={16} />}
          </button>;
        })}{filteredModelAliases.length === 0 && <p className="model-no-results">No model routes found.</p>}</div>
        {((modelQuery ? usableModels.length : activeModelCategory?.models.length ?? usableModels.length) > filteredModelAliases.length) && <p className="playground-model-picker-hint">Showing {filteredModelAliases.length} routes. Search to find another.</p>}
      </div>
    </ModalFrame>

    <ModalFrame open={chatSettingsOpen} onOpenChange={setChatSettingsOpen} title="Chat settings" description="Adjust options shared by every selected model." className="playground-chat-settings-dialog">
      <div className="playground-chat-settings">
        <Label htmlFor="playground-max-tokens">Max output<Dropdown id="playground-max-tokens" aria-label="Max output" disabled={running} value={String(maxTokens)} onChange={event => setMaxTokens(Number(event.target.value))}><DropdownOption value="256">256 tokens</DropdownOption><DropdownOption value="512">512 tokens</DropdownOption><DropdownOption value="1024">1,024 tokens</DropdownOption></Dropdown></Label>
        <Label htmlFor="playground-temperature">Temperature<Input id="playground-temperature" type="number" min="0" max="2" step="0.1" disabled={running} value={temperature} onChange={event => setTemperature(Number(event.target.value))} /></Label>
        <Label htmlFor="playground-system-prompt" className="playground-system-prompt-label">System instructions<textarea id="playground-system-prompt" rows={4} maxLength={12000} disabled={running} value={systemPrompt} onChange={event => setSystemPrompt(event.target.value)} placeholder="Optional instructions applied to every model" /></Label>
        <div className="playground-chat-settings-actions"><Button type="button" onClick={() => setChatSettingsOpen(false)}>Done</Button></div>
      </div>
    </ModalFrame>

    <ModalFrame open={apiSettingsOpen} onOpenChange={setApiSettingsOpen} title="API key" description="Choose the key Chat sends with model requests." className="playground-api-dialog">
      <div className="playground-api-settings">
        {sessionKeys.length > 0
          ? <Label htmlFor="playground-api-key">API key
            <Dropdown id="playground-api-key" aria-label="API key" disabled={running} value={selectedKey ? selectedKey.id : 'manual'} onChange={event => { setSelectedKeyId(event.target.value); setManualKey(''); setResults(null); setError(''); }}>
              {sessionKeys.map(key => <DropdownOption key={key.id} value={key.id}>{key.name}</DropdownOption>)}
              <DropdownOption value="manual">Use another key</DropdownOption>
            </Dropdown>
          </Label>
          : <div className="playground-key-empty">
            <KeyRound size={20} aria-hidden="true" />
            <div><strong>Create a workspace API key</strong><p>Grant it access to the model routes you want to compare.</p></div>
            <Button asChild><Link to={workspaceRoot + '/keys'}>Create key<ArrowUpRight size={14} /></Link></Button>
          </div>}
        {!selectedKey && sessionKeys.length > 0 && <Label htmlFor="playground-existing-key">API key
          <Input id="playground-existing-key" type="password" autoComplete="off" spellCheck={false} disabled={running} value={manualKey} onChange={event => { setManualKey(event.target.value); setError(''); }} placeholder="Paste a Niu workspace key" />
        </Label>}
        {sessionKeys.length === 0 && <details className="playground-key-paste">
          <summary>Already have a Niu API key?</summary>
          <Label htmlFor="playground-existing-key">API key
            <Input id="playground-existing-key" type="password" autoComplete="off" spellCheck={false} disabled={running} value={manualKey} onChange={event => { setManualKey(event.target.value); setError(''); }} placeholder="Paste a Niu workspace key" />
          </Label>
        </details>}
        {selectedKey && usableModels.length < minComparisonModels && <p role="alert" className="playground-api-warning">This key allows fewer than two of this workspace’s model routes.</p>}
        <div className="playground-api-dialog-actions"><Button type="button" variant="outline" onClick={() => setApiSettingsOpen(false)}>Done</Button>{sessionKeys.length > 0 && <Button asChild variant="ghost"><Link to={workspaceRoot + '/keys'}>Manage keys<ArrowUpRight size={15} /></Link></Button>}</div>
      </div>
    </ModalFrame>
  </div>;
}
