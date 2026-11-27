import { promptCategories, promptExamples } from '../starter-prompts';
import { authenticatedFetch as fetch } from '@/lib/authenticated-fetch';
import { Empty, EmptyHeader, EmptyDescription, EmptyMedia, EmptyTitle, EmptyContent } from '@/components/ui/empty';
import { cachedKeyGet } from '@/features/keys/api';
import { peekQuery, primeQuery, invalidateForMutation } from '@/lib/query-cache';
import { formatLocalizedMessage, translateUI, readLocale as readUILocale, useLocale as useUILocale } from '@/shell/ui-locale';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ListRowsSkeleton, TableSkeleton } from '@/components/PageSkeletons';
import { generationOutcome } from '../generation-outcome';
import { useGenerationKeys } from '@/features/generations/useGenerationKeys';
import { GenerationSessionBindings } from '@/features/generations/GenerationsLayout';
import GenerationComposer, { GenerationComposerCover } from '@/features/generations/GenerationComposer';
import { buildChatContextPanelData, openGenerationsContextRun } from '@/features/generations/GenerationsContextPanel';
import VideoArchivedSessions from '@/features/generations/VideoArchivedSessions';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { SidebarMenuAction, useSidebar } from '@/components/ui/sidebar';
import { Textarea } from '@/components/ui/textarea';
import { Table as ShadcnTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNewChatAction } from '../useNewChatAction';
import { useDraftNavigation } from '../useDraftNavigation';
import { useChatDraft, prefetchChatDraft, clearPrefetchedChatDraft, type ChatDraft, type ChatDraftSnapshot } from '../useChatDraft';
import { IconX as X, IconDots as MoreHorizontal, IconPencil as Pencil, IconTrash as Trash, IconArchive as Archive, IconDownload as Download, IconPaperclip as Paperclip, IconFlask as FlaskConical, IconArrowRight as ArrowRight, IconArrowUp as ArrowUp, IconCoin as CircleDollarSign, IconCopy as ClipboardCopy, IconClock as Clock3, IconHash as Hash, IconKey as KeyRound, IconPlus as Plus, IconAdjustmentsHorizontal as Settings2, IconSquare as Square, IconStopwatch as Timer, IconMessageChatbot, IconVideo as Video } from "@tabler/icons-react";
import PlaygroundModelPickerDialog from './PlaygroundModelPickerDialog';
import GenerationKeyPicker from '@/features/generations/GenerationKeyPicker';
import { QuickKeyDialog, useQuickKeyProvisioner } from '@/features/generations/QuickKeyDialog';
import ChatTurnAttachments, { type ChatAttachment } from './ChatTurnAttachments';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { requestCharges } from '@/lib/customer-tariff';
import { formatExactUnitAtoms, money } from '@/lib/money';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { useWorkspaceVideo } from '@/features/provider-modules/useWorkspaceVideo';
import { useDashboardContext } from '@/shell/dashboard-context';
import { workspacePathSegment } from '@/shell/workspace-route';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity, catalogTitle, disambiguatedCatalogTitle } from '@/lib/providers';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { mathDelimiters } from '../math-delimiters';
import { branchMessages, userMessage, type ConversationMessage } from '../conversation';

type Scope = { organizationId: string; workspaceId: string; workspaceName?: string };
type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
type ChatResponse = { choices?: Array<{ message?: { content?: unknown }; delta?: { content?: unknown }; finish_reason?: unknown }>; usage?: Usage };
type RequestLedgerEntry = {
  attempt_id: string;
  reference?: string;
  customer_charge_nanos: string | null;
  customer_charge_status: string;
  customer_charge_currency: string | null;
};
type ComparisonResult = {
  httpStatus?: number;
  model: string;
  content: string;
  elapsedMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  attemptId: string | null;
  attemptReference?: string;
  error: string | null;
  finishReason?: string | null;
  phase: 'connecting' | 'streaming' | 'complete' | 'failed' | 'cancelled';
  customerChargeNanos: string | null;
  customerChargeStatus: string;
  customerChargeCurrency: string | null;
};
type SavedTurn = { prompt: string; results: ComparisonResult[]; attachments?: ChatAttachment[] };
type SavedComparison = SavedTurn & { title?: string; id: string; reference?: string; createdAt: number; turns?: SavedTurn[]; settings?: { systemPrompt: string; maxTokens: number; temperature: number; logPayloads?: boolean } };
type ComparisonMetric = 'requests' | 'elapsed' | 'prompt' | 'completion' | 'total' | 'cash';
const maxComparisonModels = 4;
const minComparisonModels = 1;

const comparisonMetrics: Array<{ key: ComparisonMetric; label: string }> = [
  { key: 'requests', label: 'Client attempts' },
  { key: 'elapsed', label: 'Client round-trip' },
  { key: 'prompt', label: 'Prompt tokens' },
  { key: 'completion', label: 'Output tokens' },
  { key: 'total', label: 'Total tokens' },
  { key: 'cash', label: 'Customer charge' },
];

function customerCharge(result: ComparisonResult) {
  if (result.customerChargeStatus === 'charged' && result.customerChargeNanos != null && result.customerChargeCurrency) return money(result.customerChargeNanos, result.customerChargeCurrency);
  switch (result.customerChargeStatus) {
    case 'owner_funded': return translateUI('No Niu charge');
    case 'pending': return translateUI('Unresolved');
    case 'unpriced': return translateUI('No rate');
    case 'not_charged': return translateUI('Not charged');
    default: return translateUI('Unknown');
  }
}

function metricValue(result: ComparisonResult, metric: ComparisonMetric) {
  if (metric === 'requests') return '1';
  if (metric === 'elapsed') return formatLocalizedMessage('{0} ms{1}', [result.elapsedMs.toLocaleString(readUILocale()), result.phase === 'failed' ? ' · '+translateUI('Failed') : result.phase === 'cancelled' ? ' · '+translateUI('Cancelled') : result.phase === 'streaming' || result.phase === 'connecting' ? ' · '+translateUI('Running') : ''], readUILocale());
  if (metric === 'prompt') return result.promptTokens == null ? translateUI('Unknown') : result.promptTokens.toLocaleString(readUILocale());
  if (metric === 'completion') return result.completionTokens == null ? translateUI('Unknown') : result.completionTokens.toLocaleString(readUILocale());
  if (metric === 'total') return result.totalTokens == null ? translateUI('Unknown') : result.totalTokens.toLocaleString(readUILocale());
  return customerCharge(result);
}

function numericDelta(baseline: number, candidate: number, unit: 'ms' | 'tokens') {
  if (baseline === candidate) return translateUI('Same');
  const sign = candidate < baseline ? '−' : '+';
  return `${sign}${Math.abs(candidate - baseline).toLocaleString(readUILocale())} ${unit}`;
}

function metricDifference(baseline: ComparisonResult, candidate: ComparisonResult, metric: ComparisonMetric) {
  if (metric === 'requests') return translateUI('Same');
  if (baseline.phase !== 'complete' || candidate.phase !== 'complete' || baseline.finishReason !== 'stop' || candidate.finishReason !== 'stop') return translateUI('Not comparable');
  if (metric === 'elapsed') return numericDelta(baseline.elapsedMs, candidate.elapsedMs, 'ms');
  if (metric === 'prompt' || metric === 'completion' || metric === 'total') {
    const baselineValue = metric === 'prompt' ? baseline.promptTokens : metric === 'completion' ? baseline.completionTokens : baseline.totalTokens;
    const candidateValue = metric === 'prompt' ? candidate.promptTokens : metric === 'completion' ? candidate.completionTokens : candidate.totalTokens;
    return baselineValue === null || candidateValue === null ? translateUI('Unknown') : numericDelta(baselineValue, candidateValue, 'tokens');
  }

  const baselineValue = baseline.customerChargeNanos;
  const candidateValue = candidate.customerChargeNanos;
  if (baseline.customerChargeStatus !== 'charged' || candidate.customerChargeStatus !== 'charged' || baselineValue == null || candidateValue == null || !baseline.customerChargeCurrency || !candidate.customerChargeCurrency) return translateUI('Unknown');
  if (baseline.customerChargeCurrency !== candidate.customerChargeCurrency) return translateUI('Different currencies');
  const baselineAmount = BigInt(baselineValue);
  const candidateAmount = BigInt(candidateValue);
  if (baselineAmount === candidateAmount) return translateUI('Same');
  const sign = candidateAmount < baselineAmount ? '−' : '+';
  const difference = candidateAmount < baselineAmount ? baselineAmount - candidateAmount : candidateAmount - baselineAmount;
  return `${sign}${money(difference.toString(), baseline.customerChargeCurrency)}`;
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
  if (!response.ok) throw new Error(errorMessage(payload, formatLocalizedMessage('Request failed ({0}).', [response.status], readUILocale())));
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

/** Resolves when the submission is stopped; keeps startup waits interruptible. */
function abortSignalPromise(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
}

async function runModel(
  model: string,
  apiKey: string,
  messages: ConversationMessage[],
  maxTokens: number,
  temperature: number,
  signal: AbortSignal,
  onUpdate: (result: ComparisonResult) => void,
  endpoint = '/v1/chat/completions',
  logPayloads = true,
  keyId?: string,
): Promise<ComparisonResult> {
  const startedAt = performance.now();
  let attemptId: string | null = null;
  let content = '';
  let finishReason: string | null = null;
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
    finishReason,
    customerChargeNanos: null,
    customerChargeStatus: 'unknown',
    customerChargeCurrency: null,
  });

  function applyUsage(usage: Usage | undefined) {
    promptTokens = tokenCount(usage?.prompt_tokens) ?? promptTokens;
    completionTokens = tokenCount(usage?.completion_tokens) ?? completionTokens;
    totalTokens = tokenCount(usage?.total_tokens) ?? (promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : totalTokens);
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        accept: 'text/event-stream',
        'x-niu-log-payloads': String(logPayloads),
        ...(keyId ? { 'x-niu-key-id': keyId } : {}),
      },
      body: JSON.stringify({ model, messages, max_completion_tokens: maxTokens, temperature, stream: true }),
      signal,
    });
    attemptId = response.headers.get('x-niu-attempt-id');
    if (response.status === 401 && keyId) {
      const session = await fetch('/api/v1/session', { headers: { authorization: `Bearer ${apiKey}` }, signal });
      if (session.status === 401) {
        sessionStorage.setItem('niu.login-return', location.pathname + location.search);
        window.location.assign(`${import.meta.env.BASE_URL}login`);
        throw new Error('Your session expired. Redirecting to sign in…');
      }
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const failed = result('failed', errorMessage(payload, formatLocalizedMessage('Request failed ({0}).', [response.status], readUILocale())));
      failed.httpStatus = response.status;
      onUpdate(failed);
      return failed;
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      const payload = await response.json().catch(() => null) as ChatResponse | null;
      if (payload && typeof payload === 'object' && 'error' in payload) {
        throw new Error(errorMessage(payload, 'Niu reported an error during generation.'));
      }
      const message = Array.isArray(payload?.choices) ? payload.choices[0]?.message : null;
      if (!message || typeof message !== 'object') {
        throw new Error('Niu returned an invalid chat response. Inspect the request before trying again.');
      }
      finishReason = typeof payload?.choices?.[0]?.finish_reason === 'string' ? payload.choices[0].finish_reason.slice(0,128) : null;
      content = responseText(message.content);
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
    let terminalReceived = false;
    const consumeEvent = (event: string) => {
      const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim();
      if (!data) return;
      if (data === '[DONE]') {terminalReceived = true;return;}
      const errorEvent = event.split(/\r?\n/).some(line => /^event:\s*error\s*$/.test(line));
      let payload: ChatResponse;
      try { payload = JSON.parse(data) as ChatResponse; }
      catch { throw new Error('Niu returned malformed streaming data.'); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || (payload.choices !== undefined && !Array.isArray(payload.choices))) {
        throw new Error('Niu returned invalid streaming data. Inspect the request before trying again.');
      }
      if (errorEvent || (payload && typeof payload === 'object' && 'error' in payload)) {
        throw new Error(errorMessage(payload, 'Niu reported an error during generation.'));
      }
      const choice = payload.choices?.[0];
      if (typeof choice?.finish_reason === 'string') finishReason = choice.finish_reason.slice(0,128);
      content += responseText(choice?.delta?.content);
      applyUsage(payload.usage);
      onUpdate(result('streaming'));
    };

    try {
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
      if (!terminalReceived) throw new Error('The response stream ended before completion. Inspect the request before trying again.');
    } finally {
      if (!completed) void reader.cancel().catch(() => { /* Stream cancellation cleanup is best-effort. */ });
      reader.releaseLock();
    }
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

function selectInitialComparison(
  items: SavedComparison[],
  draftSnapshot: ChatDraftSnapshot | undefined,
  requestedSession: string | null,
  startWithNewChat: boolean,
): SavedComparison | null {
  if (startWithNewChat) return null;
  if (requestedSession) {
    return items.find(item => item.id === requestedSession || item.reference === requestedSession) ?? null;
  }
  if (!draftSnapshot) return null;
  const saved = draftSnapshot.payload;
  if (saved) {
    if (saved.sessionId) {
      const matched = items.find(item => item.id === saved.sessionId || item.reference === saved.sessionId);
      if (matched) return matched;
    }
    if (saved.prompt.trim() || saved.attachments.length > 0) return null;
  }
  return items[0] ?? null;
}

function comparisonDraft(item: SavedComparison, keyId?: string): ChatDraft {
  return {
    ...(keyId ? {keyId}:{}),
    sessionId: item.id,
    prompt: '',
    models: item.results.map(result => result.model),
    attachments: [],
    settings: {
      systemPrompt: item.settings?.systemPrompt ?? '',
      maxTokens: item.settings?.maxTokens ?? 4096,
      temperature: item.settings?.temperature ?? 0.7,
      logPayloads: item.settings?.logPayloads ?? true,
    },
  };
}

export default function PlaygroundView({ token, models, unverifiedModels = [], modelsLoading = false, modelsError = '', onRetryModels, initialScope }: {
  token: string;
  models: string[];
  unverifiedModels?: string[];
  modelsLoading?: boolean;
  modelsError?: string;
  onRetryModels?: () => Promise<void>;
  initialScope: Scope | null;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const { billingMode } = usePlatformCurrency();
  const { isMobile, setOpenMobile } = useSidebar();
  const location = useLocation();
  const comparisonController = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const historyToggleRef = useRef<HTMLButtonElement>(null);
  const apiKeyTriggerRef = useRef<HTMLButtonElement>(null);
  const historyDialogOpener = useRef<HTMLButtonElement | null>(null);
  const archiveFromMobileHistory = useRef(false);
  const historyActionButtons = useRef(new Map<string, HTMLButtonElement>());
  function restoreHistoryFocus(event: Event) {
    event.preventDefault();
    const opener = historyDialogOpener.current;
    (opener?.isConnected ? opener : historyToggleRef.current)?.focus();
    historyDialogOpener.current = null;
  }
  const dashboard=useDashboardContext();
  const { chatKeys, workspace, workspaces, session } = dashboard;
  const organization = initialScope?.organizationId ?? '';
  const workspaceId = initialScope?.workspaceId ?? '';
  const { session: routeParamSession } = useParams<{ session?: string }>();
  const pathSession = useMemo(() => {
    if (routeParamSession) return routeParamSession;
    const match = /^\/generations\/([^/?#]+)\/?$/.exec(location.pathname);
    return match ? decodeURIComponent(match[1]) : null;
  }, [routeParamSession, location.pathname]);
  const requestedSession = pathSession ?? new URLSearchParams(location.search).get('session');
  const startWithNewChat = new URLSearchParams(location.search).get('new') === '1';
  const selectionLocationKey = useRef(location.key);
  selectionLocationKey.current = location.key;
  const historyEndpoint = `/api/v1/workspaces/${workspaceId}/chats`;
  const draftEndpoint = `/api/v1/workspaces/${workspaceId}/chats/draft`;
  const cachedHistory = token ? peekQuery<{data:SavedComparison[]}>(token,historyEndpoint,{persist:true})?.data : undefined;
  const cachedDraft = token ? peekQuery<ChatDraftSnapshot>(token,draftEndpoint) : undefined;
  const initialSelection = cachedHistory
    ? selectInitialComparison(cachedHistory, cachedDraft, requestedSession, startWithNewChat)
    : null;
  const initialDraftPayload = !requestedSession && !startWithNewChat && cachedDraft?.payload && cachedDraft.payload.sessionId === (initialSelection?.id ?? null)
    ? cachedDraft.payload
    : null;
  const customizedModels = useRef(Boolean(initialSelection || initialDraftPayload));
  const modelSignature = models.join('\u0000');
  const modelAliases = useMemo(() => [...new Set(models)], [modelSignature]);
  const [selectedModels, setSelectedModels] = useState<string[]>(() => {
    if (initialDraftPayload) return initialDraftPayload.models;
    if (initialSelection) return initialSelection.results.map(result => result.model);
    return modelAliases.filter(model => !unverifiedModels.includes(model)).slice(0, 1);
  });
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelDetailsOpen, setModelDetailsOpen] = useState(false);
  const modelPickerOpener = useRef<HTMLButtonElement | null>(null);
  const modelPickerFallback = useRef<HTMLButtonElement | null>(null);
  const openModelPicker = (event: { currentTarget: HTMLButtonElement }) => {
    modelPickerOpener.current = event.currentTarget;
    setModelDetailsOpen(false);
    setModelQuery('');
    setModelPickerOpen(true);
  };
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [quickKeyDialogOpen, setQuickKeyDialogOpen] = useState(false);
  const quickKey = useQuickKeyProvisioner();
  const availableKeys=useGenerationKeys(dashboard,apiSettingsOpen);
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState('');
  const [modelQuery, setModelQuery] = useState('');
  const [modelCategory, setModelCategory] = useState('all');
  const [promptCategory, setPromptCategory] = useState<(typeof promptCategories)[number]['id']>('all');
  const [systemPrompt, setSystemPrompt] = useState(() => initialDraftPayload?.settings.systemPrompt ?? initialSelection?.settings?.systemPrompt ?? '');
  const [prompt, setPrompt] = useState(() => initialDraftPayload?.prompt ?? '');
  const attachmentInput = useRef<HTMLInputElement>(null);
  const attachmentGeneration = useRef(0);
  useEffect(() => () => {attachmentGeneration.current += 1;}, [token, organization, workspaceId, session?.operator?.id]);
  const [attachments, setAttachments] = useState<Array<{name: string; type: string; content: string}>>(() => initialDraftPayload?.attachments ?? []);
  async function addAttachments(files: FileList | null) {
    if (!draft.ready) return;
    if (!files || running || !hasUsableKey) return;
    const generation = attachmentGeneration.current;
    if (attachments.length + files.length > 4) { setError('Attach up to four files.'); return; }
    for (const file of Array.from(files)) {
      if (file.size > 4 * 1024 * 1024) { setError(uiF('{0} exceeds 4 MB.', [file.name])); continue; }
      const image = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
      const text = file.type.startsWith('text/') || /\.(txt|md|csv|json|js|ts|py|html|css)$/i.test(file.name);
      if (!image && !text) { setError(uiF('{0}: use PNG, JPEG, WebP, or a text file.', [file.name])); continue; }
      try {
      const content = image ? await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }) : await file.text();
      if (generation !== attachmentGeneration.current) return;
      setAttachments(current => [...current, {name: file.name, type: image ? 'image' : 'text', content}].slice(0, 4));
      } catch { if (generation !== attachmentGeneration.current) return; setError(uiF('Could not read {0}. Try attaching it again.', [file.name])); }
    }
    if (attachmentInput.current) attachmentInput.current.value = '';
  }
  const [maxTokens, setMaxTokens] = useState(() => initialDraftPayload?.settings.maxTokens ?? initialSelection?.settings?.maxTokens ?? 4096);
  const [temperature, setTemperature] = useState(() => initialDraftPayload?.settings.temperature ?? initialSelection?.settings?.temperature ?? 0.7);
  const [logPayloads, setLogPayloads] = useState(() => initialDraftPayload?.settings.logPayloads ?? initialSelection?.settings?.logPayloads ?? true);
  const [selectedKeyId, setSelectedKeyId] = useState(() => cachedDraft?.payload?.keyId ?? '');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [results, setResults] = useState<ComparisonResult[] | null>(() => initialSelection?.results ?? null);
  const [history, setHistory] = useState<SavedComparison[]>(cachedHistory??[]);
  const [activeComparisonId, setActiveComparisonId] = useState<string | null>(() => initialSelection?.id ?? null);
  const [copiedResponse, setCopiedResponse] = useState('');
  const [renamingChat, setRenamingChat] = useState<SavedComparison | null>(null);
  const [chatTitle, setChatTitle] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [deletingChat, setDeletingChat] = useState<SavedComparison | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivedChats, setArchivedChats] = useState<SavedComparison[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const [archiveReadFailed, setArchiveReadFailed] = useState(false);
  const [archiveRevision, setArchiveRevision] = useState(0);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const exportController = useRef<AbortController | null>(null);
  const sessionTitle = (item: SavedComparison) => item.title || item.prompt.split('\n')[0];

  const historyIdentity = `${token}\u0000${historyEndpoint}`;
  const historyScope = useRef(historyIdentity);
  historyScope.current = historyIdentity;
  useEffect(() => {
    setExporting(false);
    return () => { exportController.current?.abort(); exportController.current = null; };
  }, [historyIdentity]);
  async function exportComparison(item: SavedComparison) {
    if (exportController.current) return;
    const controller = new AbortController();
    const identity = historyIdentity;
    exportController.current = controller;
    setExporting(true); setError('');
    try {
      const response = await fetch(`${historyEndpoint}/${item.id}/export`, {
        headers: { authorization: `Bearer ${token}` }, signal: controller.signal,
      });
      if (!response.ok) throw new Error('Export unavailable');
      const exported = await response.json();
      if (exported?.format !== 'niu-chat' || exported.version !== 1 || !Array.isArray(exported.turns)) throw new Error('Invalid export');
      if (controller.signal.aborted || historyScope.current !== identity) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'niu-chat.json'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      if (!controller.signal.aborted && historyScope.current === identity) setError('Could not export this chat. Try again from its history menu.');
    } finally {
      if (exportController.current === controller) { exportController.current = null; setExporting(false); }
    }
  }
  useEffect(() => { setArchiveOpen(false); setArchivedChats([]); setArchiveError(''); setArchiveBusy(false); }, [historyIdentity]);
  useEffect(() => { if(new URLSearchParams(location.search).get('archived') === '1') setArchiveOpen(true); }, [location.search]);
  useEffect(() => {
    if (!archiveOpen) return;
    const controller = new AbortController();
    setArchiveLoading(true); setArchiveError(''); setArchiveReadFailed(false); setArchivedChats([]);
    fetch(`${historyEndpoint}?archived=true`, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(response => responseData<SavedComparison[]>(response))
      .then(items => { if (!controller.signal.aborted) setArchivedChats(items); })
      .catch(() => { if (!controller.signal.aborted) { setArchiveReadFailed(true); setArchiveError('Could not load archived chats.'); } })
      .finally(() => { if (!controller.signal.aborted) setArchiveLoading(false); });
    return () => controller.abort();
  }, [archiveOpen, historyEndpoint, token, archiveRevision]);

  async function changeArchive(item: SavedComparison, archived: boolean) {
    if (archiveBusy || running) return;
    const identity = historyIdentity;
    setArchiveBusy(true); setArchiveError('');
    try {
      const response = await fetch(`${historyEndpoint}/${item.id}/archive`, {
        method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
      if (!response.ok) throw new Error('Archive update failed');
      invalidateForMutation(token,historyEndpoint,'PUT');
      if (historyScope.current !== identity) return;
      if (archived) {
        setHistory(items => items.filter(saved => saved.id !== item.id));
        if (activeComparisonId === item.id) {
          startNewComparison();
          if (location.pathname.startsWith('/generations/') || (requestedSession && (requestedSession === item.id || requestedSession === item.reference))) {
            const params = new URLSearchParams(location.search);
            params.delete('session');
            const query = params.toString();
            const basePath = location.pathname.startsWith('/generations/') ? '/generations' : location.pathname;
            navigate(`${basePath}${query ? `?${query}` : ''}${location.hash}`, { replace: true });
          }
        }
        setNotice('Chat archived.');
      } else {
        setArchivedChats(items => items.filter(saved => saved.id !== item.id));
        setHistory(items => [item, ...items.filter(saved => saved.id !== item.id)].sort((a,b) => b.createdAt-a.createdAt));
      }
    } catch {
      if (historyScope.current === identity) {
        if (archived) setError('Could not archive this chat. Try again from its history menu.');
        else setArchiveError('Could not restore this chat. Try again.');
      }
    } finally { if (historyScope.current === identity) setArchiveBusy(false); }
  }

  useEffect(() => { setDeletingChat(null); setDeleteError(''); }, [historyEndpoint, token]);
  const navigate=useNavigate();
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [historyRevision, setHistoryRevision] = useState(0);
  const draft=useChatDraft({token,endpoint:draftEndpoint,modelsCustomized:customizedModels,
    identity:JSON.stringify([token,organization,workspaceId,session?.operator?.id]),
    enabled:Boolean(token&&organization&&workspaceId&&!historyLoading&&!historyError),
    value:{...(selectedKeyId ? {keyId:selectedKeyId}:{}),sessionId:activeComparisonId,prompt,models:selectedModels,attachments,settings:{systemPrompt,maxTokens,temperature,logPayloads}},
    restore:saved=>{
      const requestedKey=new URLSearchParams(location.search).get('key');
      const restoredKey=workspaceKeys.find(key=>key.id===requestedKey||key.slug===requestedKey)?.id ?? saved.keyId;
      setSelectedKeyId(restoredKey ?? '');
      if(requestedSession){
        const item=history.find(item=>(item.id===requestedSession||item.reference===requestedSession));
        if(item){openComparison(item);return comparisonDraft(item,restoredKey);}
        startNewComparison();setError('This session is unavailable or you no longer have access.');
        return;
      }
      if(startWithNewChat) {startNewComparison();return;}
      if(!saved){
        if(history[0]){openComparison(history[0]);return comparisonDraft(history[0],restoredKey);}
        return;
      }
      const matched = saved.sessionId
        ? history.find(item => item.id === saved.sessionId || item.reference === saved.sessionId)
        : undefined;
      if (matched) {
        openComparison(matched);
        customizedModels.current=true;
        setSelectedModels(saved.models);setPrompt(saved.prompt);setAttachments(saved.attachments);
        setSystemPrompt(saved.settings.systemPrompt);setMaxTokens(saved.settings.maxTokens);
        setTemperature(saved.settings.temperature);setLogPayloads(saved.settings.logPayloads);
        return { ...saved, sessionId: matched.id };
      }
      const hasUnsentDraft = Boolean(saved.prompt.trim() || saved.attachments.length > 0);
      if (!hasUnsentDraft && history[0]) {
        const fallback = history[0];
        openComparison(fallback);
        return comparisonDraft(fallback,restoredKey);
      }
      startNewComparison();
      customizedModels.current=true;
      setSelectedModels(saved.models);setPrompt(saved.prompt);setAttachments(saved.attachments);
      setSystemPrompt(saved.settings.systemPrompt);setMaxTokens(saved.settings.maxTokens);
      setTemperature(saved.settings.temperature);setLogPayloads(saved.settings.logPayloads);
    }});
  useEffect(() => {
    const controller = new AbortController();
    const restoringLocationKey = location.key;
    const cached=token ? peekQuery<{data:SavedComparison[]}>(token,historyEndpoint,{persist:true})?.data : undefined;
    const cachedDraftSnapshot=token ? peekQuery<ChatDraftSnapshot>(token,draftEndpoint) : undefined;
    setHistory(cached??[]);
    setHistoryLoading(!cached);
    setHistoryError('');setSettingsSaving(false);setSettingsSaveError('');
    const cachedSelection=cached ? selectInitialComparison(cached,cachedDraftSnapshot,requestedSession,startWithNewChat) : null;
    if(cachedSelection){
      openComparison(cachedSelection);
      if(!requestedSession&&!startWithNewChat&&cachedDraftSnapshot?.payload&&cachedDraftSnapshot.payload.sessionId===cachedSelection.id){
        customizedModels.current=true;
        setSelectedModels(cachedDraftSnapshot.payload.models);setPrompt(cachedDraftSnapshot.payload.prompt);setAttachments(cachedDraftSnapshot.payload.attachments);
        setSystemPrompt(cachedDraftSnapshot.payload.settings.systemPrompt);setMaxTokens(cachedDraftSnapshot.payload.settings.maxTokens);
        setTemperature(cachedDraftSnapshot.payload.settings.temperature);setLogPayloads(cachedDraftSnapshot.payload.settings.logPayloads);
      }
    } else {
      setResults(null);
      setActiveComparisonId(null);
    }
    if (!token || !organization || !workspaceId) return;
    const draftPromise = prefetchChatDraft(token, draftEndpoint, controller.signal).catch(() => undefined);
    cachedKeyGet<{data:SavedComparison[]}>(token,historyEndpoint,{signal:controller.signal,persist:true,force:true})
      .then(response => response.data)
      .then(async items => {
        if (controller.signal.aborted) return;
        if (requestedSession && !items.some(item => item.id === requestedSession || item.reference === requestedSession)) {
          const response = await fetch(`${historyEndpoint}/${encodeURIComponent(requestedSession)}`, {
            headers: { authorization: `Bearer ${token}` }, signal: controller.signal,
          });
          if (response.ok) {
            const saved = await responseData<SavedComparison>(response);
            if (saved && (saved.id === requestedSession || saved.reference === requestedSession)) items.push(saved);
            else throw new Error('Invalid saved conversation response');
          } else if (response.status !== 404) throw new Error('Could not load saved conversation');
        }
        // One-time migration of history created by the former browser-only implementation.
        // Remove that copy only after PostgreSQL has acknowledged every imported record.
        let hasLegacy = false;
        try {
          for (let index = 0; index < localStorage.length; index += 1) {
            if (localStorage.key(index)?.startsWith('niu.chat.v1:')) { hasLegacy = true; break; }
          }
        } catch { /* Cache is optional. */ }
        if (hasLegacy) {
          const actor = session?.operator?.id ?? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), byte => byte.toString(16).padStart(2, '0')).join('');
          const legacyKey = `niu.chat.v1:${JSON.stringify([organization, workspaceId, actor])}`;
          let legacy: { history?: SavedComparison[] } | null = null;
          try { legacy = JSON.parse(localStorage.getItem(legacyKey) ?? 'null'); } catch { /* Cache is optional. */ }
          if (Array.isArray(legacy?.history)) {
            for (const item of legacy.history) {
              if (controller.signal.aborted) return;
              if (items.some(saved => saved.id === item.id)) continue;
              await saveComparison(item);
              items.push(item);
            }
            try { localStorage.removeItem(legacyKey); } catch { /* Server copy is authoritative. */ }
          }
        }
        await draftPromise;
        if (controller.signal.aborted) return;
        const restoreResults = (results: ComparisonResult[]) => results.map(result =>
          result.phase === 'connecting' || result.phase === 'streaming'
            ? { ...result, phase: 'cancelled' as const } : result);
        const restored = items.map(item => ({ ...item, results: restoreResults(item.results),
          turns: item.turns?.map(turn => ({ ...turn, results: restoreResults(turn.results) })),
        }));
        setHistory(restored);
        // History may finish after the user has selected another session or a new chat.
        if (selectionLocationKey.current !== restoringLocationKey) return;
        const latestDraftSnapshot=token ? peekQuery<ChatDraftSnapshot>(token,draftEndpoint) : undefined;
        const initial=selectInitialComparison(restored,latestDraftSnapshot,requestedSession,startWithNewChat);
        if(initial) {
          openComparison(initial);
          if(!requestedSession&&!startWithNewChat&&latestDraftSnapshot?.payload&&latestDraftSnapshot.payload.sessionId===initial.id){
            customizedModels.current=true;
            setSelectedModels(latestDraftSnapshot.payload.models);setPrompt(latestDraftSnapshot.payload.prompt);setAttachments(latestDraftSnapshot.payload.attachments);
            setSystemPrompt(latestDraftSnapshot.payload.settings.systemPrompt);setMaxTokens(latestDraftSnapshot.payload.settings.maxTokens);
            setTemperature(latestDraftSnapshot.payload.settings.temperature);setLogPayloads(latestDraftSnapshot.payload.settings.logPayloads);
          }
          const isGenerationsRoute = location.pathname === '/generations' || location.pathname.startsWith('/generations/');
          const canonicalSession = initial.reference ?? (requestedSession ? initial.id : null);
          if (isGenerationsRoute && canonicalSession && (requestedSession || initial.reference)) {
            const query = new URLSearchParams(location.search);
            query.delete('session');
            const wsSeg = workspace ? workspacePathSegment(workspace, workspaces) : workspaceId;
            if (wsSeg && (query.get('workspace') === wsSeg || query.get('workspace') === workspaceId)) {
              query.delete('workspace');
            }
            const nextSearch = query.toString();
            const nextUrl = `/generations/${encodeURIComponent(canonicalSession)}${nextSearch ? `?${nextSearch}` : ''}${location.hash}`;
            if (`${location.pathname}${location.search}${location.hash}` !== nextUrl) {
              navigate(nextUrl, { replace: true });
            }
          } else if (requestedSession && initial.reference && requestedSession !== initial.reference) {
            const query = new URLSearchParams(location.search);
            query.set('session', initial.reference);
            navigate(`${location.pathname}?${query}${location.hash}`, {replace:true});
          }
        }
        else if(requestedSession&&!startWithNewChat){startNewComparison();setError('This session is unavailable or you no longer have access.');}
      })
      .catch(() => { clearPrefetchedChatDraft(token, draftEndpoint); if (!controller.signal.aborted) setHistoryError('Could not load chat history.'); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [token, historyEndpoint, session?.operator?.id, historyRevision]);


  async function closeChatSettings() {
    if (settingsSaving) return;
    if (draft.error) {setChatSettingsOpen(false);return;}
    if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0 || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) return;
    if (!await draft.flush()) return;
    const existing = history.find(item => item.id === activeComparisonId);
    const settings = {systemPrompt, maxTokens, temperature, logPayloads};
    if (!existing || JSON.stringify(existing.settings) === JSON.stringify(settings)) {setChatSettingsOpen(false);return;}
    const identity = historyScope.current;
    setSettingsSaving(true);setSettingsSaveError('');
    try {
      const updated = {...existing, settings};
      await saveComparison(updated);
      if (historyScope.current === identity) {setHistory(items => items.map(item => item.id === updated.id ? updated : item));setChatSettingsOpen(false);}
    } catch {
      if (historyScope.current === identity) setSettingsSaveError('Could not save chat settings. Your changes are still here.');
    } finally {if (historyScope.current === identity) setSettingsSaving(false);}
  }

  useEffect(()=>{
    if(token&&organization&&workspaceId&&!historyLoading&&!historyError)primeQuery(token,historyEndpoint,{data:history},{persist:true});
  },[token,historyEndpoint,history,historyLoading,historyError]);
  async function saveComparison(item: SavedComparison) {
    const response = await fetch(`${historyEndpoint}/${item.id}`, {
      method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!response.ok) throw new Error('Could not save this chat. Check your connection and try again.');
    invalidateForMutation(token,historyEndpoint,'PUT');
    const receipt = await response.json();
    if (typeof receipt.reference === 'string' && /^chat-[1-9][0-9]{0,18}$/.test(receipt.reference)) item.reference = receipt.reference;
  }

  const workspaceRoot = workspace
    ? `/workspaces/${workspacePathSegment(workspace, workspaces)}`
    : '/workspaces/default';
  const sessionKeys = chatKeys.filter(key => key.organizationId === organization && key.projectId === workspaceId);
  const keysPath = workspaceId ? `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/keys` : '';
  const [workspaceKeys, setWorkspaceKeys] = useState<Array<{id: string; slug?: string; name: string; allowed_models?: string[]; revoked: boolean; expired: boolean}>>([]);
  const [keyLoadError, setKeyLoadError] = useState('');
  const [workspaceKeysReady, setWorkspaceKeysReady] = useState(false);
  const [workspaceKeysLoading, setWorkspaceKeysLoading] = useState(false);
  useEffect(() => {
    setWorkspaceKeys([]); setWorkspaceKeysReady(false); setWorkspaceKeysLoading(false); setKeyLoadError('');
  }, [token, organization, workspaceId]);
  useEffect(() => {
    if (!token || !organization || !workspaceId) return;
    if (workspaceKeysReady && !apiSettingsOpen) return;
    const controller = new AbortController();
    setKeyLoadError(''); setWorkspaceKeysLoading(true);
    fetch(keysPath, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('Could not load API keys. Reopen this menu to retry.'); return response.json(); })
      .then(value => { if (!controller.signal.aborted) { setWorkspaceKeys(value.data.filter((key: {revoked: boolean; expired: boolean; invocation_allowed?: boolean}) => !key.revoked && !key.expired && key.invocation_allowed !== false)); setWorkspaceKeysReady(true); } })
      .catch(error => { if (!controller.signal.aborted) setKeyLoadError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setWorkspaceKeysLoading(false); });
    return () => controller.abort();
  }, [apiSettingsOpen, token, organization, workspaceId, keysPath]);
  // Saved metadata owns slugs and availability; issued secrets are loading hints.
  const keyChoices = [...workspaceKeys, ...sessionKeys.filter(key => !workspaceKeysReady && !workspaceKeys.some(saved => saved.id === key.id))];
  const noAvailableKeys = workspaceKeysReady && !keyLoadError && !availableKeys.loading && !availableKeys.error && keyChoices.length === 0 && availableKeys.keys.length === 0;
  const selectedKey = sessionKeys.find(key => key.id === selectedKeyId);
  const managedKey = workspaceKeys.find(key => key.id === selectedKeyId);
  const videoKey = useWorkspaceVideo(dashboard.token ? dashboard : { ...dashboard, token }, managedKey?.id, workspaceKeysReady ? workspaceKeys : null);
  function trialRate(alias: string) {
    const model = dashboard.models?.find(item => item.id === alias);
    if (!managedKey || !model?.billing_source) return null;
    if (model.billing_source === 'own_api_key') return uiT('No Niu charge');
    const units = model.customer_unit_pricing;
    const price = model.customer_pricing;
    const tariff = units && (billingMode === 'credits' || !price) ? units : price;
    if (!tariff || tariff.prompt_rate == null || tariff.completion_rate == null) {
      return uiT("Rate unavailable", "费率暂不可用");
    }
    const amount = (rate: string) => 'unit_name' in tariff
      ? formatExactUnitAtoms(rate, tariff.unit_name, tariff.display_precision)
      : money(rate, tariff.currency);
    const parts = tariff.context_tiers?.length ? [uiT("Context tiers")] : [
      amount(tariff.prompt_rate) + uiT("/M input tokens"),
      amount(tariff.completion_rate) + uiT("/M output tokens"),
    ];
    for (const charge of requestCharges(tariff)) parts.push(uiT(charge.label) + ' · ' + charge.amount);
    return parts.join(' · ');
  }
  const singleTrialRate = selectedModels.length === 1 ? trialRate(selectedModels[0]) : null;
  const billingSources = selectedModels.map(alias => dashboard.models?.find(model => model.id === alias)?.billing_source);
  const billingSummary = !managedKey
    ? uiT("Usage is billed according to the workspace of your API key. Choose a saved workspace key to see how usage is billed.")
    : selectedModels.length === 0
      ? uiT("Choose a model below to start chatting.", "请在下方选择模型后开始对话。")
      : billingSources.some(source => !source)
        ? uiT("Billing information is unavailable for one or more selected models. Refresh the model catalog or ask your administrator before sending.")
        : billingSources.every(source => source === 'own_api_key')
          ? uiT("No Niu charge")
          : billingSources.every(source => source === 'niu_credits')
            ? uiT("Usage is charged to your Niu credits at the applicable model prices.")
            : uiT("Workspace charges vary by model.");
  const allowedModels = managedKey?.allowed_models ?? selectedKey?.allowedModels;
  const usableModels = useMemo(() => allowedModels && !allowedModels.includes('*')
    ? modelAliases.filter(model => allowedModels.includes(model))
    : modelAliases, [modelAliases, allowedModels]);
  const apiKey = managedKey ? token : selectedKey?.token ?? '';
  const chatEndpoint = '/v1/chat/completions';
  const keyIds = keyChoices.map(key => key.id).join('\u0000') + '\u0000' + workspaceKeys.map(key => key.slug ?? '').join('\u0000');
  const preferredKey = new URLSearchParams(location.search).get('key');
  const requestedKeyMissing = Boolean(workspaceKeysReady && !availableKeys.loading && !keyLoadError && !availableKeys.error && preferredKey && !workspaceKeys.some(key => key.id === preferredKey || key.slug === preferredKey));
  const keyBlocked = requestedKeyMissing || Boolean(draft.ready && workspaceKeysReady && !availableKeys.loading && selectedKeyId && !keyChoices.some(key=>key.id===selectedKeyId));
  const hasUsableKey = Boolean(!keyBlocked && managedKey && workspaceKeysReady && !keyLoadError && session?.permissions.write !== false);
  const preferredModel = new URLSearchParams(location.search).get('model');
  useEffect(() => {
    const resolved = workspaceKeys.find(key => key.slug === preferredKey || key.id === preferredKey);
    const preferred = resolved?.id ?? preferredKey;
    if (preferred && keyChoices.some(key => key.id === preferred)) {
      setSelectedKeyId(preferred);
      if (resolved?.slug && preferredKey !== resolved.slug) {
        const next = new URLSearchParams(location.search);
        next.set('key', resolved.slug);
        navigate({ pathname: location.pathname, search: next.toString(), hash: location.hash }, { replace: true });
      }
    } else if (!preferredKey && draft.ready && !selectedKeyId) setSelectedKeyId(keyChoices[0]?.id ?? '');
  }, [preferredKey, keyIds, draft.ready, selectedKeyId]);

  const draftNavigation = useDraftNavigation({
    hasUnsavedChanges: () => Boolean((prompt.trim() || attachments.length > 0) && draft.hasUnsavedChanges()),
    flush: () => draft.flush(),
    shouldBlock: ({ currentLocation, nextLocation }) => (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search)
      && !((currentLocation.pathname === '/generations' || currentLocation.pathname.startsWith('/generations/chat-')) && (nextLocation.pathname === '/generations' || nextLocation.pathname.startsWith('/generations/chat-')) && !new URLSearchParams(nextLocation.search).has('video-session') && new URLSearchParams(nextLocation.search).get('new') !== 'video'),
  });
  useNewChatAction(startWithNewChat, draft, workspaceKeys, startNewComparison);


  useEffect(() => {
    const preferred = preferredModel;
    if (!preferred || !usableModels.includes(preferred)) return;
    customizedModels.current = true;
    setSelectedModels(current => startWithNewChat
      ? [preferred]
      : current.includes(preferred) ? current
      : [preferred, ...current.filter(model => model !== preferred)].slice(0, maxComparisonModels));
  }, [preferredModel, usableModels]);

  useEffect(() => {
    if (modelsLoading || modelsError) return;
    setSelectedModels(current => {
      if (!customizedModels.current) return usableModels.filter(model => !unverifiedModels.includes(model)).slice(0, 1);
      const available = current.filter(model => usableModels.includes(model));
      return available;
    });
  }, [usableModels, selectedKeyId, modelsLoading, modelsError, unverifiedModels.join('\u0000')]);

  const comparisonGeneration = useRef(0);
  useEffect(() => () => {
    comparisonGeneration.current += 1;
    comparisonController.current?.abort();
  }, [historyIdentity]);

  function startNewComparison() {
    comparisonGeneration.current += 1;
    attachmentGeneration.current += 1;
    if (attachmentInput.current) attachmentInput.current.value = '';
    comparisonController.current?.abort();
    if (transcriptRef.current) transcriptRef.current.scrollTop = 0;
    setPrompt('');
    setAttachments([]);
    setSystemPrompt('');
    setPromptCategory('all');
    setResults(null);
    setNotice('');
    setError('');
    setActiveComparisonId(null);
    setRunning(false);
  }

  useEffect(() => {
    if (!requestedSession || startWithNewChat || historyLoading) return;
    const current = history.find(item => item.id === activeComparisonId);
    if (current && (current.id === requestedSession || current.reference === requestedSession)) return;
    const matched = history.find(item => item.id === requestedSession || item.reference === requestedSession);
    if (matched) openComparison(matched);
  }, [requestedSession, startWithNewChat, historyLoading, history, activeComparisonId]);

  function openComparison(item: SavedComparison) {
    comparisonGeneration.current += 1;
    attachmentGeneration.current += 1;
    if (attachmentInput.current) attachmentInput.current.value = '';
    if (running) comparisonController.current?.abort();
    setRunning(false);
    setActiveComparisonId(item.id);
    setPrompt('');
    setAttachments([]);
    setSystemPrompt(item.settings?.systemPrompt ?? '');
    setMaxTokens(item.settings?.maxTokens ?? 4096);
    setTemperature(item.settings?.temperature ?? 0.7);
    setLogPayloads(item.settings?.logPayloads ?? true);
    customizedModels.current = true;
    setSelectedModels(item.results.map(result => result.model));
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
  }

  async function loadCharges(attemptIds: string[], signal?: AbortSignal) {
    if (!attemptIds.length) return new Map<string, RequestLedgerEntry>();
    const base = '/api/v1/workspaces/' + encodeURIComponent(workspaceId);
    const reads = await Promise.allSettled([...new Set(attemptIds)].map(async attemptId => {
      const response = await fetch(base + '/requests/' + encodeURIComponent(attemptId), { signal, headers: { authorization: 'Bearer ' + token } });
      const entry = await responseData<RequestLedgerEntry>(response);
      if (entry?.attempt_id !== attemptId) throw new Error('Request metadata did not match the generation.');
      return entry;
    }));
    const entries = reads.flatMap(read => read.status === 'fulfilled' ? [read.value] : []);
    if (!entries.length) throw new Error('Customer charges are not available yet.');
    return new Map(entries.map(entry => [entry.attempt_id, entry]));
  }

  async function handleQuickCreateKey() {
    if (!token || !organization || !workspaceId || session?.permissions.write === false) return;
    const created = await quickKey.run({
      token,
      organizationId: organization,
      workspaceId,
      rememberChatKey: dashboard.rememberChatKey,
      reloadWorkspaces: dashboard.reloadWorkspaces,
    });
    if (!created) return;
    setWorkspaceKeys(current => [created, ...current.filter(item => item.id !== created.id)]);
    setWorkspaceKeysReady(true);
    setKeyLoadError('');
    setSelectedKeyId(created.id);
    setQuickKeyDialogOpen(false);
    setApiSettingsOpen(false);
    const next = new URLSearchParams(location.search);
    next.set('key', created.slug || created.id);
    navigate({ pathname: location.pathname, search: next.toString(), hash: location.hash }, { replace: true });
    setNotice('Created “Playground” API key.');
  }

  async function compare(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (comparisonController.current || running || settingsSaving || historyLoading
      || modelsLoading || modelsError
      || !hasUsableKey || !apiKey
      || !selectedModels.every(model => usableModels.includes(model))) return;
    if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) { setChatSettingsOpen(true); return; }
    const submittedPrompt = prompt;
    setNotice('');
    setError('');
    if (!organization || !workspaceId || !submittedPrompt.trim() || selectedModels.length < minComparisonModels || selectedModels.length > maxComparisonModels) return;
    if (usableModels.length < minComparisonModels) {
      setApiSettingsOpen(true);
      return;
    }

    const prior = history.find(item => item.id === activeComparisonId);
    const previousTurns = prior ? prior.turns ?? [{ prompt: prior.prompt, results: prior.results, attachments: prior.attachments }] : [];
    if (previousTurns.length >= 100) { setError('This chat has reached 100 turns. Start a new chat to continue.'); return; }
    const comparisonId = prior?.id ?? (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + '-' + Math.random().toString(36).slice(2));
    const startedAt = Date.now();
    const initialResults: ComparisonResult[] = selectedModels.map(model => ({
      model, content: '', elapsedMs: 0, promptTokens: null, completionTokens: null, totalTokens: null,
      attemptId: null, error: null, phase: 'connecting', customerChargeNanos: null, customerChargeStatus: 'unknown', customerChargeCurrency: null,
    }));
    const currentTurn = { prompt: submittedPrompt.trim(), results: initialResults, attachments };
    const saved: SavedComparison = { id: comparisonId, title: prior ? sessionTitle(prior) : undefined, prompt: submittedPrompt.trim(), results: initialResults, createdAt: prior?.createdAt ?? startedAt,
      turns: [...previousTurns, currentTurn], attachments, settings: { systemPrompt, maxTokens, temperature, logPayloads } };
    const generation = comparisonGeneration.current;
    const controller = new AbortController();
    comparisonController.current = controller;
    let persistenceStarted = false;
    let pendingSnapshot: SavedComparison | null = null;
    let checkpoint: Promise<void> | null = null;
    let checkpointError: unknown;
    async function persistVisibleResults() {
      while (pendingSnapshot && generation === comparisonGeneration.current && !controller.signal.aborted) {
        const snapshot = pendingSnapshot;
        pendingSnapshot = null;
        await saveComparison(snapshot);
        if (generation !== comparisonGeneration.current || controller.signal.aborted) return;
        setResults(snapshot.results);
        setHistory(items => items.map(item => item.id === comparisonId ? snapshot : item));
      }
    }
    setRunning(true);
    try {
      // Stop must take effect while the composer draft is still saving, and a
      // stopped submission must not create a saved conversation for a prompt
      // that was never dispatched.
      await Promise.race([draft.flush(), abortSignalPromise(controller.signal)]);
      if (generation !== comparisonGeneration.current) return;
      if (controller.signal.aborted) return;
      // Keep one identity through startup, cancellation and final persistence.
      // Aborting a save itself would leave its commit outcome unknown.
      persistenceStarted = true;
      await saveComparison(saved);
      if (generation !== comparisonGeneration.current || controller.signal.aborted) return;
      attachmentGeneration.current += 1;
      if (attachmentInput.current) attachmentInput.current.value = '';
      setPrompt('');
      setAttachments([]);
      setActiveComparisonId(comparisonId);
      setResults(initialResults);
      const initialSnapshot = { ...saved };
      setHistory(current => [initialSnapshot, ...current.filter(item => item.id !== comparisonId)]);
      if ((location.pathname === '/generations' || location.pathname.startsWith('/generations/')) && saved.reference) {
        const targetPath = `/generations/${encodeURIComponent(saved.reference)}`;
        if (location.pathname !== targetPath) {
          const query=new URLSearchParams(location.search);query.delete('new');query.delete('session');
          navigate(`${targetPath}${query.size ? `?${query}`:''}`, { replace: true });
        }
      }
      const effectiveKeyId = selectedKeyId;
      await Promise.race([
        draft.flush({...(effectiveKeyId ? {keyId:effectiveKeyId}:{}),sessionId:comparisonId,prompt:'',models:selectedModels,attachments:[],settings:{systemPrompt,maxTokens,temperature,logPayloads}}),
        abortSignalPromise(controller.signal),
      ]);
      if (generation !== comparisonGeneration.current || controller.signal.aborted) return;
      const updateResult = (next: ComparisonResult) => {
        saved.results = saved.results.map(result => result.model === next.model ? next : result);
        saved.turns = [...previousTurns, { ...currentTurn, results: saved.results }];
        if (generation !== comparisonGeneration.current) return;
        // Coalesce updates received during a write. Only show response text that
        // another browser can already recover from the saved conversation.
        if (checkpointError || (!next.content && next.phase === 'streaming')) return;
        pendingSnapshot = { ...saved };
        if (!checkpoint) {
          checkpoint = persistVisibleResults().catch(cause => {
            checkpointError = cause;
          }).finally(() => { checkpoint = null; });
        }
      };
      const completed = await Promise.all(selectedModels.map(model => {
        const messages: ConversationMessage[] = systemPrompt.trim() ? [{ role: 'system', content: systemPrompt.trim() }] : [];
        messages.push(...branchMessages(previousTurns, model), userMessage(currentTurn));
        return runModel(model, apiKey, messages, maxTokens, temperature, controller.signal, updateResult, chatEndpoint, logPayloads, managedKey?.id);
      }));
      await checkpoint;
      if (checkpointError) throw checkpointError;
      saved.results = completed;
      saved.turns = [...previousTurns, { ...currentTurn, results: completed }];
      if (generation !== comparisonGeneration.current) return;
      if (controller.signal.aborted) {
        return;
      }
      const attemptIds = completed.flatMap(result => result.attemptId ? [result.attemptId] : []);
      try {
        const charges = await loadCharges(attemptIds, controller.signal);
        if (controller.signal.aborted || generation !== comparisonGeneration.current) return;
        const priced = completed.map(result => {
          const entry = result.attemptId ? charges.get(result.attemptId) : undefined;
          return {
            ...result,
            attemptReference: entry?.reference,
            customerChargeNanos: entry?.customer_charge_status === 'charged' ? entry.customer_charge_nanos : null,
            customerChargeStatus: entry?.customer_charge_status ?? 'unknown',
            customerChargeCurrency: entry?.customer_charge_currency ?? null,
          };
        });
        saved.results = priced;
        saved.turns = [...previousTurns, { ...currentTurn, results: priced }];
      } catch {
        if (controller.signal.aborted || generation !== comparisonGeneration.current) return;
        saved.results = completed;
        saved.turns = [...previousTurns, { ...currentTurn, results: completed }];
        setNotice('Responses are ready. Customer charges are not available yet.');
      }
    } catch (cause) {
      if (generation !== comparisonGeneration.current) return;
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
      saved.results = saved.results.map(result => result.phase === 'connecting' || result.phase === 'streaming' ? { ...result, phase: 'cancelled' } : result);
      saved.turns = [...previousTurns, { ...currentTurn, results: saved.results }];
      try {
        if (persistenceStarted) {
          await saveComparison(saved);
          if (generation === comparisonGeneration.current) {
            setActiveComparisonId(comparisonId);
            setResults(saved.results);
            setHistory(current => [saved, ...current.filter(item => item.id !== comparisonId)]);
            setPrompt('');
            setAttachments([]);
            await draft.flush({...(selectedKeyId ? {keyId:selectedKeyId}:{}),sessionId:comparisonId,prompt:'',models:selectedModels,attachments:[],settings:{systemPrompt,maxTokens,temperature,logPayloads}});
          }
        }
      }
      catch (cause) { if (generation === comparisonGeneration.current) setError((cause as Error).message); }
      if (comparisonController.current === controller) comparisonController.current = null;
      if (generation === comparisonGeneration.current) setRunning(false);
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

  const canSubmit = Boolean(hasUsableKey && organization && workspaceId && prompt.trim() && selectedModels.length >= minComparisonModels && selectedModels.length <= maxComparisonModels && temperature >= 0 && temperature <= 2 && Number.isSafeInteger(maxTokens) && maxTokens > 0 && !running && !settingsSaving && !historyLoading && !modelsLoading && !modelsError && selectedModels.every(model => usableModels.includes(model)));
  const activeComparison = history.find(item => item.id === activeComparisonId);
  const keysLoading = workspaceKeysLoading || (!workspaceKeysReady && !keyLoadError) || availableKeys.loading;
  const selectedKeyLabel = managedKey?.name ?? selectedKey?.name ?? (keysLoading ? uiT("Loading keys…") : uiT("Choose API key"));
  const keyPickerError = availableKeys.error ? uiT(availableKeys.error) : keyLoadError ? uiT(keyLoadError) : selectedKey && usableModels.length < minComparisonModels ? uiT("This key does not allow any available models.") : '';
  const visiblePromptExamples = promptExamples.filter(item => promptCategory === 'all' || item.category === promptCategory);
  const currentWorkspaceSegment = workspace ? workspacePathSegment(workspace, workspaces) : workspaceId;
  const activeTurns = activeComparison?.turns ?? (results ? [{ prompt: activeComparison?.prompt ?? '', results }] : []);
  const contextPanelData = buildChatContextPanelData(activeTurns, customerCharge, dashboard.models ?? [], workspaceRoot, { systemPrompt, maxTokens, temperature, logPayloads });
  const isFirstRunEmpty = Boolean(initialScope && !results && !activeComparison && !keyBlocked);
  const showComposer = Boolean(keyBlocked || (initialScope && modelAliases.length >= minComparisonModels));

  const composerElement = showComposer ? <Popover open={chatSettingsOpen} onOpenChange={open => {if (open) {setSettingsSaveError('');setChatSettingsOpen(true);} else void closeChatSettings();}}>
          <GenerationComposer formRef={composerRef} onSubmit={compare} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void addAttachments(event.dataTransfer.files); }} wrapSurface={surface => <PopoverAnchor asChild>{surface}</PopoverAnchor>}
            topBanner={noAvailableKeys && !managedKey
              ? <div className="composer-key-banner" role="status"><div className="composer-key-banner-copy"><KeyRound size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" /><span>{session?.permissions.write !== false ? uiT("Create an API key to start using models in this workspace.") : uiT("No active API key in this workspace yet. Ask a workspace administrator to create one before trying models.", "当前工作空间暂无可用 API 密钥，请联系工作空间管理员创建后再试用模型。")}</span></div>{session?.permissions.write !== false && <Button type="button" size="sm" disabled={quickKey.busy} onClick={() => { quickKey.setError(''); setQuickKeyDialogOpen(true); }}>{uiT("Create API key")}</Button>}</div>
              : workspaceKeysReady && !availableKeys.loading && !noAvailableKeys && !managedKey && !selectedKey
                ? <div className="composer-key-banner" role="status"><div className="composer-key-banner-copy"><KeyRound size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" /><span>{uiT("Select an API key to send messages in this workspace.")}</span></div><Button type="button" size="sm" variant="outline" onClick={() => setApiSettingsOpen(true)}>{uiT("Choose API key")}</Button></div>
                : null}
            prompt={{ id: 'playground-user-prompt', label: uiT("Prompt for all selected models"), placeholder: uiT("Message models…"), value: prompt, maxLength: 12000, required: true, disabled: !hasUsableKey || !draft.ready || running || settingsSaving, onChange: value => { setPrompt(value); setNotice(''); setError(''); }, onKeyDown: event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (canSubmit) event.currentTarget.form?.requestSubmit(); } } }}
            attachments={attachments.length > 0 ? <div className="flex flex-wrap gap-2 py-1">{attachments.map((file, index) => <div key={index} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">{file.type === 'image' && <img src={file.content} alt="" className="size-8 rounded object-cover" />}<span>{file.name}</span><Button type="button" variant="ghost" size="icon" disabled={!draft.ready || running || settingsSaving} aria-label={uiF("Remove {0}", [file.name])} onClick={() => setAttachments(current => current.filter((_, i) => i !== index))}><X size={14}/></Button></div>)}</div> : null}
            leadingActions={<>
              <Input ref={attachmentInput} type="file" className="hidden" aria-label={uiT("Upload chat attachments")} multiple accept="image/png,image/jpeg,image/webp,text/*,.md,.json,.csv,.py,.ts,.js" onChange={event => void addAttachments(event.target.files)} />
              <Button type="button" variant="ghost" size="icon" className="shrink-0" disabled={!hasUsableKey || !draft.ready || running || settingsSaving} aria-label={uiT("Attach files")} onClick={() => attachmentInput.current?.click()}><Paperclip size={18}/></Button>
              <HoverCard open={modelDetailsOpen && !modelPickerOpen} onOpenChange={(open) => setModelDetailsOpen(open && !modelPickerOpen)} openDelay={150} closeDelay={250}>
                <HoverCardTrigger asChild>
                  <Button type="button" variant="ghost" className="h-9 min-w-0 shrink justify-start gap-2 px-2" disabled={!draft.ready || running || settingsSaving} aria-label={uiF("Edit comparison models ({0} selected)", [selectedModels.length])} onClick={openModelPicker}>
                    <span className="flex shrink-0 items-center -space-x-2" aria-hidden="true">{selectedModels.map(model => <span key={model} className="rounded-full border-2 border-background bg-background"><ProviderLogo provider={modelIdentity(dashboard.models?.find(item => item.id === model) ?? { id: model })} size="small" /></span>)}</span>
                    {selectedModels.length === 0
                      ? <span className="truncate text-xs font-medium text-muted-foreground">{uiT("Choose model", "选择模型")}</span>
                      : selectedModels.length === 1
                        ? <span className="min-w-0 max-w-[11rem] sm:max-w-[14rem] truncate text-xs font-medium">{catalogTitle(dashboard.models?.find(item => item.id === selectedModels[0]) ?? { id: selectedModels[0] })}</span>
                        : <span className="text-xs tabular-nums text-muted-foreground">{selectedModels.length}</span>}
                  </Button>
                </HoverCardTrigger>
                <HoverCardContent side="top" align="start" sideOffset={12} collisionPadding={12} className="w-[min(24rem,calc(100vw-2rem))] space-y-3">
                  <div className="flex items-center justify-between"><strong className="text-sm">{uiT("Comparison models")}</strong><Button type="button" variant="ghost" size="sm" disabled={!draft.ready || running || settingsSaving} onClick={openModelPicker}>{uiT("Edit")}</Button></div>
                  <div className="space-y-2">{selectedModels.map(model => <div key={model} className="flex items-center gap-3">
                    <ProviderLogo provider={modelIdentity(dashboard.models?.find(item => item.id === model) ?? { id: model })} size="small" />
                    <div className="min-w-0 flex-1"><Link className="break-words text-sm hover:underline" to={`${workspaceRoot}/models/${model.split('/').map(encodeURIComponent).join('/')}`}>{catalogTitle(dashboard.models?.find(item => item.id === model) ?? { id: model })}</Link>{selectedModels.length > 1 && <p className="text-xs text-muted-foreground">{trialRate(model)}</p>}</div>
                    <Button type="button" variant="ghost" size="icon" disabled={!draft.ready || running || settingsSaving} aria-label={uiF("Remove {0}", [model])} onClick={() => toggleModel(model)}><X size={14} /></Button>
                  </div>)}</div>
                  <Button type="button" variant="outline" size="sm" disabled={!draft.ready || running || settingsSaving} onClick={openModelPicker}><Plus size={14} />{uiT("Add models")}</Button>
                </HoverCardContent>
              </HoverCard>
              <Button ref={modelPickerFallback} type="button" variant="ghost" size="icon" className="shrink-0" aria-label={uiT("Choose models")} title={uiT("Choose models")} onClick={openModelPicker} disabled={!draft.ready || running || modelAliases.length === 0}><Plus size={18} /></Button>
            </>}
            trailingActions={<PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" disabled={!draft.ready || running || settingsSaving} aria-label={uiT("Chat settings")} title={uiT("Chat settings")}><Settings2 size={18} /></Button></PopoverTrigger>}
            submitAction={running
              ? <Button type="button" size="icon" className="generation-composer-submit rounded-full" aria-label={uiT("Stop generating")} onClick={cancelComparison}><Square size={14} /></Button>
              : <Button type="submit" size="icon" className="generation-composer-submit rounded-full" aria-label={uiF("Send to {0} {1}", [selectedModels.length, selectedModels.length === 1 ? uiT("model") : uiT("models")])} disabled={!canSubmit || keyBlocked}><ArrowUp size={19} /></Button>}
            blockedCover={keyBlocked ? <GenerationComposerCover icon={<KeyRound size={17} />}
              title={session?.permissions.write === false ? uiT("Ask a workspace administrator to replace this unavailable API key.", "此密钥已不可用，请联系工作空间管理员更换。") : uiT("This API key is invalid. Choose another or create a new one to continue.")}
              actions={session?.permissions.write !== false && <>{keyChoices.length > 0 && <Button type="button" variant="outline" onClick={() => setApiSettingsOpen(true)}>{uiT("Choose API key")}</Button>}<Button type="button" disabled={quickKey.busy} onClick={() => { quickKey.setError(''); setQuickKeyDialogOpen(true); }}>{uiT("Auto-create key", "自动创建试用密钥")}</Button></>} /> : null}
          />
          <p role="note" aria-label={uiT("Usage billing")} className="sr-only">{billingSummary}</p>
          {singleTrialRate && <Link className="block text-center text-xs text-muted-foreground hover:underline" to={`${workspaceRoot}/models/${selectedModels[0].split('/').map(encodeURIComponent).join('/')}`}>{singleTrialRate}</Link>}

                <PopoverContent side="top" align="end" sideOffset={12} collisionPadding={12} aria-labelledby="chat-settings-title" className="w-[min(24rem,calc(100vw-2rem))] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto space-y-4">
                  {settingsSaving && <p role="status" className="text-sm text-muted-foreground">{uiT("Saving settings…")}</p>}
                  {settingsSaveError && <div className="grid gap-2"><p role="alert" className="text-sm text-destructive">{uiT(settingsSaveError)}</p><Button type="button" variant="secondary" disabled={settingsSaving} onClick={() => void closeChatSettings()}>{uiT("Retry saving settings")}</Button></div>}
                  <div className="flex items-center justify-between gap-3"><h2 id="chat-settings-title" className="text-sm font-semibold">{uiT("Chat settings")}</h2><Button type="button" variant="ghost" size="icon" aria-label={uiT("Close chat settings")} disabled={settingsSaving} onClick={() => void closeChatSettings()}><X size={16} /></Button></div>
        <div className="flex items-start gap-3"><Checkbox id="chat-log-payloads" checked={logPayloads} disabled={!draft.ready || running || settingsSaving} onCheckedChange={value => setLogPayloads(value === true)} /><div className="space-y-1"><Label htmlFor="chat-log-payloads">{uiT("Save payloads in Logs")}</Label><p className="text-sm text-muted-foreground">{uiT("Keep request and response content in this workspace for 24 hours. Applies to new requests only.")}</p></div></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="playground-max-tokens">{uiT("Max output tokens")}</Label><Input id="playground-max-tokens" type="number" min="1" step="1" disabled={!draft.ready || running || settingsSaving} value={Number.isNaN(maxTokens) ? '' : maxTokens} aria-invalid={!Number.isSafeInteger(maxTokens) || maxTokens <= 0} onChange={event => setMaxTokens(event.target.value === '' ? NaN : Number(event.target.value))} />{(!Number.isSafeInteger(maxTokens) || maxTokens <= 0) && <p role="alert" className="text-sm text-destructive">{uiT("Enter a positive whole number.")}</p>}</div>
        <div className="space-y-2"><Label htmlFor="playground-temperature">{uiT("Temperature")}</Label><Input id="playground-temperature" aria-describedby="playground-temperature-help" type="number" min="0" max="2" step="0.1" disabled={!draft.ready || running || settingsSaving} value={Number.isNaN(temperature) ? '' : temperature} aria-invalid={!Number.isFinite(temperature) || temperature < 0 || temperature > 2} onChange={event => setTemperature(event.target.value === '' ? NaN : Number(event.target.value))} /><p id="playground-temperature-help" className="text-sm text-muted-foreground">{uiT("Lower values generally make responses more predictable; higher values increase variety.")}</p>{(!Number.isFinite(temperature) || temperature < 0 || temperature > 2) && <p role="alert" className="text-sm text-destructive">{uiT("Enter a temperature from 0 to 2.")}</p>}</div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="playground-system-prompt">{uiT("System instructions")}</Label><Textarea id="playground-system-prompt" rows={4} maxLength={12000} disabled={!draft.ready || running || settingsSaving} value={systemPrompt} onChange={event => setSystemPrompt(event.target.value)} placeholder={uiT("Optional")} /></div>

      </div>
                </PopoverContent>
        </Popover> : null;

  return <div className="playground-view">
    <div className="playground-chat-layout">
      <GenerationSessionBindings trigger={historyToggleRef} title={activeComparison ? sessionTitle(activeComparison) : uiT("New generation")} contextPanel={contextPanelData} actions={<div className="playground-toolbar-actions">
            <GenerationKeyPicker
              triggerRef={apiKeyTriggerRef}
              open={apiSettingsOpen}
              onOpenChange={setApiSettingsOpen}
              ariaLabel={uiF("API key: {0}", [managedKey?.name ?? selectedKey?.name ?? uiT("Choose API key")])}
              triggerLabel={selectedKeyLabel}
              hasSelection={Boolean(managedKey || selectedKey)}
              emphasizeMissing={!noAvailableKeys && !(workspaceKeysReady && !availableKeys.loading && !noAvailableKeys && !managedKey && !selectedKey)}
              loading={keysLoading}
              disabled={running || settingsSaving}
              selectedKeyId={selectedKeyId}
              keyOptions={availableKeys.keys.length ? availableKeys.keys : keyChoices.map(key => ({ ...key, workspace }))}
              currentWorkspaceId={workspaceId}
              errorText={keyPickerError}
              manageKeysHref={`${workspaceRoot}/keys`}
              onQuickCreateKey={noAvailableKeys && !keysLoading && session?.permissions.write !== false ? () => { quickKey.setError(''); setQuickKeyDialogOpen(true); } : undefined}
              quickCreating={quickKey.busy}
              onCreateKey={noAvailableKeys && !keysLoading && session?.permissions.write !== false ? () => void (async () => { if (!await draft.flush()) return; navigate(`${workspaceRoot}/keys`, { state: { createKey: true, returnTo: location.pathname + location.search + location.hash } }); })() : undefined}
              onSelectKey={value => {
                const chosen = availableKeys.keys.find(key => key.id === value);
                if (chosen && chosen.workspace.id !== workspaceId) { navigate(`/generations?new=1&workspace=${encodeURIComponent(workspacePathSegment(chosen.workspace, workspaces))}&key=${encodeURIComponent(chosen.slug || value)}`); return; }
                const selected = workspaceKeys.find(key => key.id === value);
                const next = new URLSearchParams(location.search); next.set('key', selected?.slug || value);
                navigate({ pathname: location.pathname, search: next.toString(), hash: location.hash }, { replace: true });
                setSelectedKeyId(value); setResults(null); setError('');
              }}
            />
          </div>} onNewSession={startWithNewChat ? startNewComparison : undefined} notice={historyError && <div className="grid justify-items-start gap-2 p-3"><p role="alert" className="text-sm text-destructive">{uiT(historyError)}</p><Button variant="ghost" onClick={()=>setHistoryRevision(value=>value+1)}>{uiT("Retry chat history")}</Button></div>} history={{context: (dashboard), currentKeys: (workspaceKeys), pending: ((historyLoading || !draft.ready) && history.length === 0), failed: (Boolean(historyError)), chats: (history), activeChat: (activeComparisonId ?? (requestedSession && !startWithNewChat ? requestedSession : null)), disabled: (running || settingsSaving || !draft.ready), onChat: (id=>{const item=history.find(item=>item.id===id);if(item){openComparison(item);void draft.flush(comparisonDraft(item,selectedKeyId));navigate(`/generations/${encodeURIComponent(item.reference??id)}`);if(isMobile)setOpenMobile(false);}}), chatActions: (id=>{const item=history.find(item=>item.id===id);if(!item)return null;return (
              <DropdownMenu><DropdownMenuTrigger asChild><SidebarMenuAction ref={element => { if (element) historyActionButtons.current.set(item.id, element); else historyActionButtons.current.delete(item.id); }} showOnHover disabled={running || settingsSaving} aria-label={uiF("Actions for {0}", [sessionTitle(item)])}><MoreHorizontal /></SidebarMenuAction></DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start"><DropdownMenuItem onSelect={() => { historyDialogOpener.current = historyActionButtons.current.get(item.id) ?? null; setRenamingChat(item); setChatTitle(sessionTitle(item)); setRenameError(''); if (isMobile) setOpenMobile(false); }}><Pencil size={14} />{uiT("Rename")}</DropdownMenuItem><DropdownMenuItem disabled={exporting} onSelect={() => { void exportComparison(item); if (isMobile) setOpenMobile(false); }}><Download size={14} />{exporting ? uiT("Exporting…") : uiT("Export")}</DropdownMenuItem><DropdownMenuItem disabled={archiveBusy || running} onSelect={() => { void changeArchive(item, true); if (isMobile) setOpenMobile(false); }}><Archive size={14} />{uiT("Archive")}</DropdownMenuItem><DropdownMenuItem onSelect={() => { historyDialogOpener.current = historyActionButtons.current.get(item.id) ?? null; setDeletingChat(item); setDeleteError(''); if (isMobile) setOpenMobile(false); }}><Trash size={14} />{uiT("Delete")}</DropdownMenuItem></DropdownMenuContent>
              </DropdownMenu>);})}} onArchive={trigger => { historyDialogOpener.current = trigger; archiveFromMobileHistory.current = isMobile; setArchiveOpen(true); }} />

      <section className={`playground-chat-main${isFirstRunEmpty ? ' is-first-run' : ''}`} aria-label={uiT("Model comparison chat")}>
        <div ref={transcriptRef} className="playground-transcript" aria-live="polite">
          {error && !results && <p role="alert" className="playground-chat-error">{uiT(error)}</p>}
          {quickKey.error && !quickKeyDialogOpen && <p role="alert" className="playground-chat-error">{uiT(quickKey.error)}</p>}
          {selectedModels.some(model => unverifiedModels.includes(model)) && <Alert role="status"><AlertDescription>{uiT("Chat support is unverified for")}{" "}{selectedModels.filter(model => unverifiedModels.includes(model)).join(', ')}{uiT(". Confirm support with your platform administrator before sending.")}</AlertDescription></Alert>}
          {modelsError && <div role="alert" className="playground-chat-error">{uiT(modelsError)}{onRetryModels && <Button type="button" variant="ghost" disabled={modelsLoading} onClick={()=>void onRetryModels()}>{uiT("Retry model catalog")}</Button>}</div>}
          {!initialScope
            ? <Empty className="playground-chat-empty border-0 bg-transparent"><EmptyHeader><EmptyMedia variant="icon"><FlaskConical size={20} /></EmptyMedia><EmptyTitle><h2>{uiT("Add an API key")}</h2></EmptyTitle><EmptyDescription>{uiT("Use an API key to authorize generations and track usage.")}</EmptyDescription></EmptyHeader><EmptyContent><Button asChild variant="outline"><Link to="/workspaces">{uiT("Manage keys")}</Link></Button></EmptyContent></Empty>
            : isFirstRunEmpty
                ? <div className="playground-first-run">
                  {videoKey && <div className="flex justify-center gap-2" aria-label={uiT("Generation mode", "生成模式")}>
                    <Button variant="secondary" size="sm" aria-pressed="true"><IconMessageChatbot size={16} />{uiT("Chat", "对话")}</Button>
                    <Button variant="ghost" size="sm" asChild><Link to={`/generations?new=video${currentWorkspaceSegment ? `&workspace=${encodeURIComponent(currentWorkspaceSegment)}` : ''}&key=${encodeURIComponent(videoKey)}`}><Video size={16} />{uiT("Video", "视频")}</Link></Button>
                  </div>}
                  <div className="playground-first-run-heading"><h2>{uiT("What would you like to create?")}</h2>{videoKey && <p>{uiT("Write, build, compare models or generate a video.")}</p>}{modelsLoading ? <ListRowsSkeleton rows={2} label={uiT("Loading model catalog…")} /> : !modelsError && modelAliases.length===0 ? <p>{uiT("No text models are available. Ask a platform administrator to add a model route to the catalog.")}</p> : null}</div>
                  {composerElement}
                  {!prompt.trim() && hasUsableKey && !modelsLoading && !modelsError && usableModels.length > 0 && <fieldset className="playground-starter-picker min-w-0" aria-label={uiT("Example tasks")}>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Tabs value={promptCategory} onValueChange={value => setPromptCategory(value as typeof promptCategory)} className="playground-starter-tabs">
                        <TabsList aria-label={uiT("Task category")} className="playground-starter-categories">
                          {promptCategories.map(category => <TabsTrigger key={category.id} value={category.id} className="playground-starter-category">{uiT(category.label)}</TabsTrigger>)}
                        </TabsList>
                      </Tabs>
                    </div>
                    <div className="playground-starters" aria-label={uiT("Example prompts")}>
                      {visiblePromptExamples.map(item => <Button key={item.id} type="button" variant="ghost" className="playground-starter" disabled={!hasUsableKey || running || settingsSaving || !draft.ready || Boolean(modelsError) || (modelsLoading || modelAliases.length === 0)} onClick={() => {setPrompt(item.text); setError(''); setNotice(''); requestAnimationFrame(() => composerRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus()); }}><strong>{uiT(item.title)}</strong><span>{uiT(item.summary)}</span><ArrowRight size={16} aria-hidden="true" /></Button>)}
                    </div>
                  </fieldset>}
                </div>
                : !results
                ? null
                : <>{(activeComparison?.turns ?? [{ prompt: activeComparison?.prompt ?? '', results, attachments: activeComparison?.attachments }]).map((turn, turnIndex) => <div className="playground-comparison-thread" id={`generation-turn-${turnIndex + 1}`} tabIndex={-1} key={turnIndex}>
                  <div className="playground-user-prompt min-w-0"><span>{uiT("You")}</span>
                    <ChatTurnAttachments key={activeComparisonId ?? 'new'} attachments={turn.attachments ?? []} />
                    <p>{turn.prompt}</p>
                  </div>
                  {error && <p role="alert" className="playground-chat-error">{uiT(error)}</p>}
                  <section className="playground-results" aria-labelledby={`playground-results-title-${turnIndex}`}>
                    <div className={turn.results.length === 1 ? "sr-only" : "playground-results-heading"}><h2 id={`playground-results-title-${turnIndex}`}>{uiT("Responses")}</h2><span>{turn.results.length} {turn.results.length === 1 ? uiT("model") : uiT("models")}</span></div>
                    <div className="playground-result-grid" data-model-count={turn.results.length}>{turn.results.map((result, index) => <article className="panel playground-result-card" key={result.model + '-' + index}>
                      <div className="playground-result-card-heading"><div><ProviderLogo provider={modelIdentity(dashboard.models?.find(item => item.id === result.model) ?? { id: result.model })} size="small" /><h3>{disambiguatedCatalogTitle(dashboard.models?.find(item => item.id === result.model) ?? { id: result.model }, dashboard.models ?? [])}{disambiguatedCatalogTitle(dashboard.models?.find(item => item.id === result.model) ?? { id: result.model }, dashboard.models ?? []) !== result.model && <span className="sr-only"> {result.model}</span>}</h3></div><Button type="button" variant="ghost" className="playground-status-trigger h-auto p-0" title={result.phase === 'connecting' || result.phase === 'streaming' ? uiT("View progress") : uiT("Generation details")} onClick={() => openGenerationsContextRun(`turn-${turnIndex + 1}:${result.model}:${index}`)}><Badge variant={result.phase === 'failed' ? 'destructive' : 'secondary'}>{result.phase === 'failed' ? uiT("Failed") : result.phase === 'cancelled' ? uiT("Cancelled") : result.phase === 'connecting' ? uiT("Connecting") : result.phase === 'streaming' ? uiT("Generating") : uiT(generationOutcome(result.finishReason).label)}</Badge></Button></div>
                      {result.phase === 'complete' && generationOutcome(result.finishReason).detail && <p className="px-5 pt-3 text-sm text-muted-foreground">{uiT(generationOutcome(result.finishReason).detail)}</p>}
                      {result.phase === 'failed' && <p className="playground-response-error">{result.httpStatus && <span>HTTP {result.httpStatus} · </span>}{result.error && uiT(result.error)}</p>}
                      {result.content ? <div className="playground-response"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { trust: false, strict: false }]]}>{mathDelimiters(result.content)}</ReactMarkdown></div> : result.phase === 'cancelled' ? <p className="playground-response-error">{uiT("Cancelled before any output arrived.")}</p> : result.phase === 'failed' ? null : result.phase === 'complete' ? <p className="playground-response text-muted-foreground">{uiT("No text output was returned.")}</p> : <div className="playground-response playground-response-pending">{result.phase === 'streaming' ? uiT("Waiting for more output…") : uiT("Waiting for a response…")}</div>}
                      <div className="playground-result-footer">
                        <div className="playground-card-metrics">
                          <div><Clock3 size={15} /><span>{uiT("Time")}</span><strong>{result.elapsedMs.toLocaleString(readUILocale())}{" "}{uiT("ms")}</strong></div>
                          <div><Hash size={15} /><span>{uiT("Tokens")}</span><strong>{result.totalTokens == null ? uiT("Unknown") : result.totalTokens.toLocaleString(readUILocale())}</strong></div>
                          <div><CircleDollarSign size={15} /><span>{uiT("Customer charge")}</span><strong>{customerCharge(result)}</strong></div>
                        </div>
                        <div className="playground-result-actions">
                          <Button type="button" variant="ghost" size="sm" onClick={() => openGenerationsContextRun(`turn-${turnIndex + 1}:${result.model}:${index}`)}>{result.phase === 'connecting' || result.phase === 'streaming' ? uiT("View progress") : uiT("Generation details")}</Button>
                          {result.content && <Button type="button" variant="ghost" size="sm" aria-label={uiF("Copy {0} response", [result.model])} onClick={() => void copyResponse(`${turnIndex}:${result.model}`, result.content)}><ClipboardCopy size={14} />{copiedResponse === `${turnIndex}:${result.model}` ? uiT("Copied") : uiT("Copy")}</Button>}
                          {result.attemptId && <Link className="playground-attempt-link" to={workspaceRoot + '/executions?modelAlias=' + encodeURIComponent(result.model) + '#gateway-attempt-' + encodeURIComponent(result.attemptReference??result.attemptId)}>{uiT("Inspect request")}</Link>}
                        </div>
                      </div>
                    </article>)}</div>
                    {turn.results.length > 1 && <details className="playground-measurement-details">
                      <summary><Timer size={16} />{uiT("Compare measured usage")}</summary>
                      <div className="playground-measurements">
                        <div className="playground-metric-table-wrap"><ShadcnTable className="playground-metric-table" style={{ minWidth: (516 + (turn.results.length - 2) * 224) + 'px' }}><caption className="playground-table-caption">{uiT("Each value comes from these requests. Missing gateway evidence remains unknown.")}</caption><TableHeader><TableRow>
                          <TableHead scope="col">{uiT("Measure")}</TableHead>
                          {turn.results.map((result, index) => <Fragment key={result.model}>
                            <TableHead scope="col" className={index === 0 ? 'playground-baseline-column' : undefined}>{index === 0 ? <>{uiT("Baseline")}<br /><span>{disambiguatedCatalogTitle(dashboard.models?.find(item => item.id === result.model) ?? { id: result.model }, dashboard.models ?? [])}{disambiguatedCatalogTitle(dashboard.models?.find(item => item.id === result.model) ?? { id: result.model }, dashboard.models ?? []) !== result.model && <span className="sr-only"> {result.model}</span>}</span></> : <>{disambiguatedCatalogTitle(dashboard.models?.find(item => item.id === result.model) ?? { id: result.model }, dashboard.models ?? [])}{disambiguatedCatalogTitle(dashboard.models?.find(item => item.id === result.model) ?? { id: result.model }, dashboard.models ?? []) !== result.model && <span className="sr-only"> {result.model}</span>}</>}</TableHead>
                            {index > 0 && <TableHead scope="col" className="playground-delta-heading" aria-label={uiF("Difference for {0} versus baseline", [result.model])}>{uiT("Δ vs baseline")}</TableHead>}
                          </Fragment>)}
                        </TableRow></TableHeader><TableBody>{comparisonMetrics.map(metric => <TableRow key={metric.key}>
                          <TableHead scope="row">{uiT(metric.label)}</TableHead>
                          {turn.results.map((result, index) => <Fragment key={result.model}>
                            <TableCell className={index === 0 ? 'playground-baseline-column' : undefined}>{metricValue(result, metric.key)}</TableCell>
                            {index > 0 && <TableCell className="playground-delta-cell">{turn.results[0] ? metricDifference(turn.results[0], result, metric.key) : uiT("Not comparable")}</TableCell>}
                          </Fragment>)}
                        </TableRow>)}</TableBody></ShadcnTable></div>
                      </div>
                    </details>}
                  </section>
                </div>)}</>}
          {notice && <p className="playground-result-notice" role="status">{uiT(notice)}</p>}
          {draftNavigation.pending && <p className="playground-result-notice" role="status">{uiT("Saving draft before leaving…")}</p>}
          {draft.error && <div role="alert" className="playground-chat-error">{uiT(draft.error)}<Button type="button" variant="ghost" onClick={draft.retry}>{draft.conflict?uiT("Load saved draft"):draft.ready?uiT("Retry saving draft"):uiT("Retry loading draft")}</Button></div>}
        </div>

        <Dialog open={draftNavigation.failed} onOpenChange={open => {if (!open) draftNavigation.stay();}}>
          <DialogContent>
            <DialogHeader><DialogTitle>{uiT("Draft not saved")}</DialogTitle><DialogDescription>{uiT("Your latest changes are still here. Stay to review and save them, or leave without saving these changes.")}</DialogDescription></DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={draftNavigation.leave}>{uiT("Leave without saving")}</Button>
              <Button variant="outline" onClick={draftNavigation.stay}>{uiT("Stay here")}</Button>
              {!draft.conflict && <Button onClick={()=>{draft.retry();draftNavigation.retry();}}>{uiT("Retry saving")}</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {!isFirstRunEmpty && composerElement}
      </section>
    </div>

    <Dialog open={archiveOpen} onOpenChange={open => { setArchiveOpen(open); if (!open && new URLSearchParams(location.search).has('archived')) { const params = new URLSearchParams(location.search); params.delete('archived'); const q = params.toString(); navigate(`${location.pathname}${q ? `?${q}` : ''}${location.hash}`, { replace: true }); } }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={event => {
        if (archiveFromMobileHistory.current && isMobile) {
          event.preventDefault();
          archiveFromMobileHistory.current = false;
          setOpenMobile(true);
        } else restoreHistoryFocus(event);
      }}><DialogHeader><DialogTitle>{uiT("Archived sessions")}</DialogTitle><DialogDescription>{uiT("Restore a Chat or Video session to Generations history.")}</DialogDescription></DialogHeader>
        {archivedChats.length > 0 && <h3 className="text-sm font-medium">{uiT("Chats")}</h3>}
        {archiveError && <div className="grid justify-items-start gap-2"><p role="alert" className="text-sm text-destructive">{uiT(archiveError)}</p>{archiveReadFailed && <Button variant="secondary" disabled={archiveLoading} onClick={() => setArchiveRevision(value => value + 1)}>{uiT("Retry")}</Button>}</div>}
        {archiveLoading ? <TableSkeleton columns={2} rows={3} label={uiT("Loading archived chats…")} /> : archivedChats.length === 0 ? null : <div className="max-h-[60vh] overflow-auto"><ShadcnTable className="table-fixed"><TableHeader><TableRow><TableHead>{uiT("Chat")}</TableHead><TableHead className="w-32 text-right">{uiT("Action")}</TableHead></TableRow></TableHeader><TableBody>{archivedChats.map(item => <TableRow key={item.id}><TableCell className="whitespace-normal break-words">{sessionTitle(item)}</TableCell><TableCell className="text-right"><Button variant="ghost" disabled={archiveBusy || running} onClick={() => void changeArchive(item, false)} aria-label={uiF("Restore {0}", [sessionTitle(item)])}>{uiT("Restore")}</Button></TableCell></TableRow>)}</TableBody></ShadcnTable></div>}
        <VideoArchivedSessions chatsEmpty={!archiveLoading && !archiveError && archivedChats.length === 0} context={dashboard} open={archiveOpen} disabled={running||archiveBusy}/>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(deletingChat)} onOpenChange={open => { if (!open && !deleting) setDeletingChat(null); }}>
      <DialogContent className="sm:max-w-sm" onCloseAutoFocus={restoreHistoryFocus}><DialogHeader><DialogTitle>{uiT("Delete chat?")}</DialogTitle><DialogDescription>{uiT("This removes the saved conversation. Request logs and billing records are kept.")}</DialogDescription></DialogHeader>
        {deleteError && <p role="alert">{uiT(deleteError)}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" disabled={deleting} onClick={() => setDeletingChat(null)}>{uiT("Cancel")}</Button><Button variant="destructive" disabled={deleting} onClick={async () => {
          if (!deletingChat || deleting) return;
          const item = deletingChat, endpoint = historyEndpoint, identity = historyIdentity;
          setDeleting(true); setDeleteError('');
          try {
            const response = await fetch(`${endpoint}/${item.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
            if (!response.ok) throw new Error('delete failed');
            invalidateForMutation(token,endpoint,'DELETE');
            if (historyScope.current !== identity) return;
            setHistory(items => items.filter(saved => saved.id !== item.id));
            if (activeComparisonId === item.id) {
              startNewComparison();
              if (location.pathname.startsWith('/generations/') || (requestedSession && (requestedSession === item.id || requestedSession === item.reference))) {
                const params = new URLSearchParams(location.search);
                params.delete('session');
                const query = params.toString();
                const basePath = location.pathname.startsWith('/generations/') ? '/generations' : location.pathname;
                navigate(`${basePath}${query ? `?${query}` : ''}${location.hash}`, { replace: true });
              }
            }
            setDeletingChat(null);
          } catch { if (historyScope.current === identity) setDeleteError('Could not delete this chat. Try again.'); }
          finally { setDeleting(false); }
        }}>{deleting ? uiT("Deleting…") : uiT("Delete chat")}</Button></div>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(renamingChat)} onOpenChange={open => { if (!open && !renaming) setRenamingChat(null); }}>
      <DialogContent className="sm:max-w-sm" onCloseAutoFocus={restoreHistoryFocus}><DialogHeader><DialogTitle>{uiT("Rename chat")}</DialogTitle><DialogDescription className="sr-only">{uiT("Set a title for this conversation.")}</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={async event => {
          event.preventDefault(); if (!renamingChat || !chatTitle.trim() || renaming) return;
          setRenaming(true); setRenameError('');
          const updated = { ...renamingChat, title: chatTitle.trim() };
          try { await saveComparison(updated); setHistory(items => items.map(item => item.id === updated.id ? updated : item)); setRenamingChat(null); }
          catch { setRenameError('Could not rename this chat. Try again.'); }
          finally { setRenaming(false); }
        }}>
          <Input aria-label={uiT("Chat title")} value={chatTitle} onChange={event => setChatTitle(event.target.value)} maxLength={120} autoFocus />
          {renameError && <p role="alert">{uiT(renameError)}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={renaming} onClick={() => setRenamingChat(null)}>{uiT("Cancel")}</Button><Button type="submit" disabled={renaming || !chatTitle.trim()}>{renaming ? uiT("Saving…") : uiT("Save")}</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <QuickKeyDialog
      open={quickKeyDialogOpen}
      onOpenChange={setQuickKeyDialogOpen}
      mode="create"
      canWrite={session?.permissions.write !== false}
      workspaceRoot={workspaceRoot}
      returnTo={`${location.pathname}${location.search}${location.hash}`}
      busy={quickKey.busy}
      error={quickKey.error}
      onQuickCreate={() => void handleQuickCreateKey()}
      onCustomCreate={() => void (async () => {
        if (!await draft.flush()) return;
        setQuickKeyDialogOpen(false);
        navigate(`${workspaceRoot}/keys`, { state: { createKey: true, returnTo: `${location.pathname}${location.search}${location.hash}` } });
      })()}
    />
    <PlaygroundModelPickerDialog
      open={modelPickerOpen}
      onOpenChange={setModelPickerOpen}
      onCloseRestoreFocus={() => (modelPickerOpener.current?.isConnected ? modelPickerOpener.current : modelPickerFallback.current)?.focus()}
      usableModels={usableModels}
      selectedModels={selectedModels}
      maxModels={maxComparisonModels}
      unverifiedModels={unverifiedModels}
      catalogModels={dashboard.models}
      rateForModel={trialRate}
      modelsLoading={modelsLoading}
      modelsError={modelsError}
      query={modelQuery}
      onQueryChange={setModelQuery}
      category={modelCategory}
      onCategoryChange={setModelCategory}
      onToggleModel={toggleModel}
    />
  </div>;
}
