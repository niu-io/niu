import { useGenerationKeys } from '@/features/generations/useGenerationKeys';
import SessionHistory from '@/features/generations/SessionHistory';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import logo from "../../../../../../branding/assets/niu-mark.png";
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenuAction, useSidebar } from '@/components/ui/sidebar';
import { Textarea } from '@/components/ui/textarea';
import { Table as ShadcnTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconX as X } from "@tabler/icons-react";
import { IconDots as MoreHorizontal } from "@tabler/icons-react";
import { IconPencil as Pencil } from "@tabler/icons-react";
import { IconTrash as Trash } from "@tabler/icons-react";
import { IconArchive as Archive } from "@tabler/icons-react";
import { IconDownload as Download } from "@tabler/icons-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useChatDraft } from '../useChatDraft';
import { IconPaperclip as Paperclip } from "@tabler/icons-react";
import { IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { IconArrowUp as ArrowUp } from "@tabler/icons-react";
import { IconArrowUpRight as ArrowUpRight } from "@tabler/icons-react";
import { IconCheck as Check } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconCoin as CircleDollarSign } from "@tabler/icons-react";
import { IconCopy as ClipboardCopy } from "@tabler/icons-react";
import { IconClock as Clock3 } from "@tabler/icons-react";
import { IconFlask as FlaskConical } from "@tabler/icons-react";
import { IconHash as Hash } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconMessagePlus as MessageSquarePlus } from "@tabler/icons-react";
import { IconPlus as Plus } from "@tabler/icons-react";
import { IconAdjustmentsHorizontal as Settings2 } from "@tabler/icons-react";
import { IconSquare as Square } from "@tabler/icons-react";
import { IconStopwatch as Timer } from "@tabler/icons-react";
import { Link, useLocation, useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { money } from '@/lib/money';
import { useDashboardContext } from '@/app/dashboard-context';
import { workspacePathSegment } from '@/app/workspace-route';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity } from '@/lib/providers';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { mathDelimiters } from '../math-delimiters';
import { branchMessages, userMessage, type ConversationMessage } from '../conversation';

type Scope = { organizationId: string; workspaceId: string; workspaceName?: string };
type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
type ChatResponse = { choices?: Array<{ message?: { content?: unknown }; delta?: { content?: unknown } }>; usage?: Usage };
type RequestLedgerEntry = {
  attempt_id: string;
  customer_charge_nanos: string | null;
  customer_charge_status: string;
  customer_charge_currency: string | null;
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
  customerChargeNanos: string | null;
  customerChargeStatus: string;
  customerChargeCurrency: string | null;
};
type SavedTurn = { prompt: string; results: ComparisonResult[]; attachments?: Array<{name: string; type: string; content: string}> };
type SavedComparison = SavedTurn & { title?: string; id: string; createdAt: number; turns?: SavedTurn[]; settings?: { systemPrompt: string; maxTokens: number; temperature: number; logPayloads?: boolean } };
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

const promptCategories = [
  { id: 'all', label: 'All tasks' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'build', label: 'Build' },
  { id: 'writing', label: 'Writing' },
  { id: 'video', label: 'Video' },
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

function customerCharge(result: ComparisonResult) {
  if (result.customerChargeStatus === 'charged' && result.customerChargeNanos != null && result.customerChargeCurrency) return money(result.customerChargeNanos, result.customerChargeCurrency);
  switch (result.customerChargeStatus) {
    case 'owner_funded': return 'Own API key';
    case 'pending': return 'Unresolved';
    case 'unpriced': return 'No rate';
    case 'not_charged': return 'Not charged';
    default: return 'Unknown';
  }
}

function metricValue(result: ComparisonResult, metric: ComparisonMetric) {
  if (metric === 'requests') return '1';
  if (metric === 'elapsed') return `${result.elapsedMs.toLocaleString()} ms${result.phase === 'failed' ? ' · failed' : result.phase === 'cancelled' ? ' · cancelled' : result.phase === 'streaming' || result.phase === 'connecting' ? ' · running' : ''}`;
  if (metric === 'prompt') return result.promptTokens === null ? 'Unknown' : result.promptTokens.toLocaleString();
  if (metric === 'completion') return result.completionTokens === null ? 'Unknown' : result.completionTokens.toLocaleString();
  if (metric === 'total') return result.totalTokens === null ? 'Unknown' : result.totalTokens.toLocaleString();
  return customerCharge(result);
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

  const baselineValue = baseline.customerChargeNanos;
  const candidateValue = candidate.customerChargeNanos;
  if (baseline.customerChargeStatus !== 'charged' || candidate.customerChargeStatus !== 'charged' || baselineValue == null || candidateValue == null || !baseline.customerChargeCurrency || !candidate.customerChargeCurrency) return 'Unknown';
  if (baseline.customerChargeCurrency !== candidate.customerChargeCurrency) return 'Different currencies';
  const baselineAmount = BigInt(baselineValue);
  const candidateAmount = BigInt(candidateValue);
  if (baselineAmount === candidateAmount) return 'Same';
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
  messages: ConversationMessage[],
  maxTokens: number,
  temperature: number,
  signal: AbortSignal,
  onUpdate: (result: ComparisonResult) => void,
  endpoint = '/v1/chat/completions',
  logPayloads = true,
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
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'text/event-stream', 'x-niu-log-payloads': String(logPayloads) },
      body: JSON.stringify({ model, messages, max_completion_tokens: maxTokens, temperature, stream: true }),
      signal,
    });
    attemptId = response.headers.get('x-niu-attempt-id');
    if (response.status === 401 && endpoint.startsWith('/admin/')) {
      const session = await fetch('/admin/v1/session', { headers: { authorization: `Bearer ${apiKey}` }, signal });
      if (session.status === 401) {
        sessionStorage.setItem('niu.login-return', location.pathname + location.search);
        window.location.assign(`${import.meta.env.BASE_URL}login`);
        throw new Error('Your session expired. Redirecting to sign in…');
      }
    }
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

export default function PlaygroundView({ token, models, modelsLoading = false, modelsError = '', onRetryModels, initialScope }: {
  token: string;
  models: string[];
  modelsLoading?: boolean;
  modelsError?: string;
  onRetryModels?: () => Promise<void>;
  initialScope: Scope | null;
}) {
  const { isMobile, setOpenMobile, openMobile, open, toggleSidebar } = useSidebar();
  const location = useLocation();
  const comparisonController = useRef<AbortController | null>(null);
  const customizedModels = useRef(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const historyToggleRef = useRef<HTMLButtonElement>(null);
  const historyDialogOpener = useRef<HTMLButtonElement | null>(null);
  const historyActionButtons = useRef(new Map<string, HTMLButtonElement>());
  function restoreHistoryFocus(event: Event) {
    event.preventDefault();
    const opener = historyDialogOpener.current;
    (opener?.isConnected ? opener : historyToggleRef.current)?.focus();
    historyDialogOpener.current = null;
  }
  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const resize = new ResizeObserver(() => {
      transcriptRef.current?.style.setProperty('padding-bottom', `${composer.getBoundingClientRect().height + 24}px`);
    });
    resize.observe(composer);
    return () => resize.disconnect();
  }, [initialScope, models.length]);
  const dashboard=useDashboardContext();
  const { chatKeys, workspace, workspaces, session } = dashboard;
  const organization = initialScope?.organizationId ?? '';
  const workspaceId = initialScope?.workspaceId ?? '';
  const modelSignature = models.join('\u0000');
  const modelAliases = useMemo(() => [...new Set(models)], [modelSignature]);
  const [selectedModels, setSelectedModels] = useState<string[]>(() => modelAliases.slice(0, 2));
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelDetailsOpen, setModelDetailsOpen] = useState(false);
  const openModelPicker = () => {
    setModelDetailsOpen(false);
    setModelQuery('');
    setModelPickerOpen(true);
  };
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const availableKeys=useGenerationKeys(dashboard,apiSettingsOpen);
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState('');
  const [modelQuery, setModelQuery] = useState('');
  const [modelCategory, setModelCategory] = useState('popular');
  const [promptCategory, setPromptCategory] = useState<(typeof promptCategories)[number]['id']>('all');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [prompt, setPrompt] = useState('');
  const pendingExample = useRef<string | null>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const attachmentGeneration = useRef(0);
  useEffect(() => () => {attachmentGeneration.current += 1;}, [token, organization, workspaceId, session?.operator?.id]);
  const [attachments, setAttachments] = useState<Array<{name: string; type: string; content: string}>>([]);
  async function addAttachments(files: FileList | null) {
    if (!files || running) return;
    const generation = attachmentGeneration.current;
    if (attachments.length + files.length > 4) { setError('Attach up to four files.'); return; }
    for (const file of Array.from(files)) {
      if (file.size > 4 * 1024 * 1024) { setError(`${file.name} exceeds 4 MB.`); continue; }
      const image = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
      const text = file.type.startsWith('text/') || /\.(txt|md|csv|json|js|ts|py|html|css)$/i.test(file.name);
      if (!image && !text) { setError(`${file.name}: use PNG, JPEG, WebP, or a text file.`); continue; }
      try {
      const content = image ? await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }) : await file.text();
      if (generation !== attachmentGeneration.current) return;
      setAttachments(current => [...current, {name: file.name, type: image ? 'image' : 'text', content}].slice(0, 4));
      } catch { if (generation !== attachmentGeneration.current) return; setError(`Could not read ${file.name}. Try attaching it again.`); }
    }
    if (attachmentInput.current) attachmentInput.current.value = '';
  }
  const [maxTokens, setMaxTokens] = useState(512);
  const [temperature, setTemperature] = useState(0.7);
  const [logPayloads, setLogPayloads] = useState(true);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [results, setResults] = useState<ComparisonResult[] | null>(null);
  const [history, setHistory] = useState<SavedComparison[]>([]);
  const [activeComparisonId, setActiveComparisonId] = useState<string | null>(null);
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

  const historyEndpoint = `/admin/v1/organizations/${organization}/projects/${workspaceId}/chat-sessions`;
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
      if (historyScope.current !== identity) return;
      if (archived) {
        setHistory(items => items.filter(saved => saved.id !== item.id));
        if (activeComparisonId === item.id) startNewComparison();
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
  const requestedSession=new URLSearchParams(location.search).get('session');
  const startWithNewChat = new URLSearchParams(location.search).get('new') === '1';
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [historyRevision, setHistoryRevision] = useState(0);
  const draft=useChatDraft({token,endpoint:`/admin/v1/organizations/${organization}/projects/${workspaceId}/chat-draft`,
    identity:JSON.stringify([token,organization,workspaceId,session?.operator?.id]),
    enabled:Boolean(token&&organization&&workspaceId&&!historyLoading&&!historyError),
    value:{sessionId:activeComparisonId,prompt,models:selectedModels,attachments,settings:{systemPrompt,maxTokens,temperature,logPayloads}},
    restore:saved=>{
      if(requestedSession){const item=history.find(item=>item.id===requestedSession);if(item)openComparison(item);else {startNewComparison();setError('This session is unavailable or you no longer have access.');}return;}
      if(startWithNewChat) {startNewComparison();return;}
      if (saved.sessionId) {
        const conversation=history.find(item=>item.id===saved.sessionId);
        if(conversation) openComparison(conversation);
        else startNewComparison();
      } else startNewComparison();
      customizedModels.current=true;
      setSelectedModels(saved.models);setPrompt(saved.prompt);setAttachments(saved.attachments);
      setSystemPrompt(saved.settings.systemPrompt);setMaxTokens(saved.settings.maxTokens);
      setTemperature(saved.settings.temperature);setLogPayloads(saved.settings.logPayloads);
    }});
  useEffect(() => {
    const controller = new AbortController();
    setHistory([]);
    setResults(null);
    setActiveComparisonId(null);
    setHistoryLoading(true);
    setHistoryError('');setSettingsSaving(false);setSettingsSaveError('');
    if (!token || !organization || !workspaceId) return;
    fetch(historyEndpoint, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(response => responseData<SavedComparison[]>(response))
      .then(async items => {
        if (controller.signal.aborted) return;
        // One-time migration of history created by the former browser-only implementation.
        // Remove that copy only after PostgreSQL has acknowledged every imported record.
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
        if (controller.signal.aborted) return;
        const restoreResults = (results: ComparisonResult[]) => results.map(result =>
          result.phase === 'connecting' || result.phase === 'streaming'
            ? { ...result, phase: 'cancelled' as const } : result);
        const restored = items.map(item => ({ ...item, results: restoreResults(item.results),
          turns: item.turns?.map(turn => ({ ...turn, results: restoreResults(turn.results) })),
        }));
        setHistory(restored);
        const initial=requestedSession ? restored.find(item=>item.id===requestedSession) : restored[0];
        if(initial&&!startWithNewChat)openComparison(initial);
        else if(requestedSession&&!startWithNewChat)setError('This session is unavailable or you no longer have access.');
      })
      .catch(() => { if (!controller.signal.aborted) setHistoryError('Could not load chat history.'); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [token, historyEndpoint, session?.operator?.id, historyRevision]);

  // A new-generation URL is an action, not a permanent draft-restoration mode.
  // Confirm the fresh composer before consuming it so reload restores that draft.
  useEffect(() => {
    if (!startWithNewChat || !draft.ready || draft.error) return;
    let cancelled = false;
    void draft.flush().then(saved => {
      if (!saved || cancelled) return;
      const params = new URLSearchParams(location.search);
      params.delete('new');
      const query = params.toString();
      navigate(`${location.pathname}${query ? `?${query}` : ''}${location.hash}`, {replace:true});
    });
    return () => {cancelled = true;};
  }, [startWithNewChat, draft.ready, draft.error, location.search, navigate]);

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

  async function saveComparison(item: SavedComparison) {
    const response = await fetch(`${historyEndpoint}/${item.id}`, {
      method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!response.ok) throw new Error('Could not save this chat. Check your connection and try again.');
  }

  const workspaceRoot = workspace
    ? `/workspaces/${workspacePathSegment(workspace, workspaces)}`
    : '/workspaces/default';
  const sessionKeys = chatKeys.filter(key => key.organizationId === organization && key.projectId === workspaceId);
  const [workspaceKeys, setWorkspaceKeys] = useState<Array<{id: string; name: string; allowed_models?: string[]; revoked: boolean; expired: boolean}>>([]);
  const [keyLoadError, setKeyLoadError] = useState('');
  useEffect(() => {
    setWorkspaceKeys([]);
  }, [token, organization, workspaceId]);
  useEffect(() => {
    if (!token || !organization || !workspaceId) return;
    const controller = new AbortController();
    setKeyLoadError('');
    fetch(`/admin/v1/organizations/${organization}/projects/${workspaceId}/keys`, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('Could not load API keys. Reopen this menu to retry.'); return response.json(); })
      .then(value => { if (!controller.signal.aborted) setWorkspaceKeys(value.data.filter((key: {revoked: boolean; expired: boolean}) => !key.revoked && !key.expired)); })
      .catch(error => { if (!controller.signal.aborted) setKeyLoadError(error.message); });
    return () => controller.abort();
  }, [apiSettingsOpen, token, organization, workspaceId]);
  const keyChoices = [...sessionKeys, ...workspaceKeys.filter(key => !sessionKeys.some(saved => saved.id === key.id))];
  const selectedKey = sessionKeys.find(key => key.id === selectedKeyId);
  const managedKey = workspaceKeys.find(key => key.id === selectedKeyId);
  const allowedModels = managedKey?.allowed_models ?? selectedKey?.allowedModels;
  const usableModels = useMemo(() => allowedModels && !allowedModels.includes('*')
    ? modelAliases.filter(model => allowedModels.includes(model))
    : modelAliases, [modelAliases, allowedModels]);
  const apiKey = managedKey ? token : selectedKey?.token ?? manualKey.trim();
  const chatEndpoint = managedKey ? `/admin/v1/organizations/${organization}/projects/${workspaceId}/keys/${managedKey.id}/chat/completions` : '/v1/chat/completions';
  const keyIds = keyChoices.map(key => key.id).join('\u0000');
  const preferredKey = new URLSearchParams(location.search).get('key');
  const preferredModel = new URLSearchParams(location.search).get('model');

  useEffect(() => {
    const preferred = preferredKey;
    if (preferred && keyChoices.some(key => key.id === preferred)) setSelectedKeyId(preferred);
    else if (!selectedKeyId || !keyChoices.some(key => key.id === selectedKeyId)) setSelectedKeyId(keyChoices[0]?.id ?? 'manual');
  }, [preferredKey, keyIds]);

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
      if (!customizedModels.current) return usableModels.slice(0, 2);
      const available = current.filter(model => usableModels.includes(model));
      return available;
    });
  }, [usableModels, selectedKeyId, modelsLoading, modelsError]);

  const comparisonGeneration = useRef(0);
  useEffect(() => () => {
    comparisonGeneration.current += 1;
    comparisonController.current?.abort();
  }, [historyIdentity]);

  function startNewComparison() {
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

  function openComparison(item: SavedComparison) {
    attachmentGeneration.current += 1;
    if (attachmentInput.current) attachmentInput.current.value = '';
    if (running) comparisonController.current?.abort();
    setRunning(false);
    setActiveComparisonId(item.id);
    setPrompt('');
    setAttachments([]);
    setSystemPrompt(item.settings?.systemPrompt ?? '');
    setMaxTokens(item.settings?.maxTokens ?? 512);
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

  async function loadCharges(attemptIds: string[], signal?: AbortSignal) {
    if (!attemptIds.length) return new Map<string, RequestLedgerEntry>();
    const base = '/admin/v1/organizations/' + encodeURIComponent(organization) + '/projects/' + encodeURIComponent(workspaceId);
    const response = await fetch(base + '/requests?limit=100', { signal, headers: { authorization: 'Bearer ' + token } });
    const entries = await responseData<RequestLedgerEntry[]>(response);
    return new Map(entries.filter(entry => attemptIds.includes(entry.attempt_id)).map(entry => [entry.attempt_id, entry]));
  }

  async function compare(event?: FormEvent<HTMLFormElement>, example?: string) {
    event?.preventDefault();
    if (running || settingsSaving || historyLoading || !draft.ready || draft.error) return;
    if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) { setChatSettingsOpen(true); return; }
    const submittedPrompt = example ?? prompt;
    setNotice('');
    setError('');
    if (!organization || !workspaceId || !submittedPrompt.trim() || selectedModels.length < minComparisonModels || selectedModels.length > maxComparisonModels) return;
    if (!apiKey) {
      if (example) pendingExample.current = example;
      setApiSettingsOpen(true);
      return;
    }
    if (usableModels.length < minComparisonModels) {
      setApiSettingsOpen(true);
      return;
    }

    pendingExample.current = null;
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
    setRunning(true);
    const draftSaved = await draft.flush();
    if (generation !== comparisonGeneration.current) return;
    if (!draftSaved) {setRunning(false);return;}
    try { await saveComparison(saved); }
    catch (cause) {
      if (generation === comparisonGeneration.current) {setError((cause as Error).message);setRunning(false);}
      return;
    }
    if (generation !== comparisonGeneration.current) return;
    attachmentGeneration.current += 1;
    if (attachmentInput.current) attachmentInput.current.value = '';
    setPrompt('');
    setAttachments([]);
    setActiveComparisonId(comparisonId);
    setResults(initialResults);
    setHistory(current => [saved, ...current.filter(item => item.id !== comparisonId)]);
    await draft.flush({sessionId:comparisonId,prompt:'',models:selectedModels,attachments:[],settings:{systemPrompt,maxTokens,temperature,logPayloads}});
    if (generation !== comparisonGeneration.current) return;
    const controller = new AbortController();
    comparisonController.current = controller;
    try {
      const updateResult = (next: ComparisonResult) => {
        saved.results = saved.results.map(result => result.model === next.model ? next : result);
        saved.turns = [...previousTurns, { ...currentTurn, results: saved.results }];
        if (generation !== comparisonGeneration.current) return;
        setResults(current => current?.map(item => item.model === next.model ? { ...item, ...next } : item) ?? current);
        setHistory(current => current.map(item => item.id === comparisonId
          ? { ...saved }
          : item));
      };
      const completed = await Promise.all(selectedModels.map(model => {
        const messages: ConversationMessage[] = systemPrompt.trim() ? [{ role: 'system', content: systemPrompt.trim() }] : [];
        messages.push(...branchMessages(previousTurns, model), userMessage(currentTurn));
        return runModel(model, apiKey, messages, maxTokens, temperature, controller.signal, updateResult, chatEndpoint, logPayloads);
      }));
      saved.results = completed;
      saved.turns = [...previousTurns, { ...currentTurn, results: completed }];
      if (generation !== comparisonGeneration.current) return;
      const attemptIds = completed.flatMap(result => result.attemptId ? [result.attemptId] : []);
      try {
        const charges = await loadCharges(attemptIds, controller.signal);
        if (generation !== comparisonGeneration.current) return;
        const priced = completed.map(result => {
          const entry = result.attemptId ? charges.get(result.attemptId) : undefined;
          return {
            ...result,
            customerChargeNanos: entry?.customer_charge_status === 'charged' ? entry.customer_charge_nanos : null,
            customerChargeStatus: entry?.customer_charge_status ?? 'unknown',
            customerChargeCurrency: entry?.customer_charge_currency ?? null,
          };
        });
        saved.results = priced;
        saved.turns = [...previousTurns, { ...currentTurn, results: priced }];
        setResults(priced);
        setHistory(current => current.map(item => item.id === comparisonId ? { ...saved } : item));
      } catch {
        if (generation !== comparisonGeneration.current) return;
        saved.results = completed;
        saved.turns = [...previousTurns, { ...currentTurn, results: completed }];
        setResults(completed);
        setHistory(current => current.map(item => item.id === comparisonId ? { ...saved } : item));
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
      try { await saveComparison(saved); }
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

  const canSubmit = Boolean(organization && workspaceId && draft.ready && !draft.error && prompt.trim() && selectedModels.length >= minComparisonModels && selectedModels.length <= maxComparisonModels && temperature >= 0 && temperature <= 2 && Number.isSafeInteger(maxTokens) && maxTokens > 0 && !running && !settingsSaving && !historyLoading && !modelsLoading);
  const activeComparison = history.find(item => item.id === activeComparisonId);
  const selectedKeyLabel = managedKey?.name ?? selectedKey?.name ?? (manualKey ? 'Workspace key added' : 'Choose API key');
  const visiblePromptExamples = promptExamples.filter(item => promptCategory === 'all' || item.category === promptCategory);

  return <div className="playground-view">
    <div className="playground-chat-layout">
      <Sidebar className="niu-workspace-sidebar playground-history" mobileClassName="niu-workspace-sidebar-mobile" mobileContentProps={{ onCloseAutoFocus: event => { if (historyToggleRef.current?.isConnected) { event.preventDefault(); historyToggleRef.current.focus(); } }, onInteractOutside: event => { const target = event.detail.originalEvent.target; if (target instanceof Element && target.closest('.app-rail, .account-menu, [data-slot="dropdown-menu-sub-content"]')) event.preventDefault(); } }} mobileStyle={{ left: 'var(--rail)', top: 0, bottom: 0, height: '100dvh', width: 'min(var(--context), calc(100vw - var(--rail)))' }} id="chat-history" aria-label="Recent comparisons">
        <SidebarHeader className="sidebar-heading">
          <h2 className="sidebar-heading-row">Generations</h2>
        </SidebarHeader>
        <SidebarContent className="playground-history-list" aria-label="Saved chats">
          <div className="playground-history-controls">

          <Button type="button" variant="outline" className="playground-new-chat" onClick={()=>{startNewComparison();navigate(`/generations?new=1${workspaceId ? `&workspace=${encodeURIComponent(workspaceId)}`:''}`);if(isMobile)setOpenMobile(false);}} disabled={running || settingsSaving || !draft.ready}><MessageSquarePlus size={16} />New generation</Button>
          </div>
          {historyError && <div className="p-3"><p role="alert" className="text-sm text-destructive">{historyError}</p><Button variant="ghost" onClick={()=>setHistoryRevision(value=>value+1)}>Retry chat history</Button></div>}
          <SessionHistory context={dashboard} currentKeys={workspaceKeys} pending={historyLoading || !draft.ready} failed={Boolean(historyError)} chats={history} activeChat={activeComparisonId} disabled={running || settingsSaving || !draft.ready}
            onChat={id=>{const item=history.find(item=>item.id===id);if(item){openComparison(item);navigate(`/generations?workspace=${encodeURIComponent(workspaceId)}&session=${encodeURIComponent(id)}`);if(isMobile)setOpenMobile(false);}}}
            chatActions={id=>{const item=history.find(item=>item.id===id);if(!item)return null;return (
              <DropdownMenu><DropdownMenuTrigger asChild><SidebarMenuAction ref={element => { if (element) historyActionButtons.current.set(item.id, element); else historyActionButtons.current.delete(item.id); }} showOnHover disabled={running || settingsSaving || !draft.ready} aria-label={`Actions for ${sessionTitle(item)}`}><MoreHorizontal /></SidebarMenuAction></DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start"><DropdownMenuItem onSelect={() => { historyDialogOpener.current = historyActionButtons.current.get(item.id) ?? null; setRenamingChat(item); setChatTitle(sessionTitle(item)); setRenameError(''); if (isMobile) setOpenMobile(false); }}><Pencil size={14} />Rename</DropdownMenuItem><DropdownMenuItem disabled={exporting} onSelect={() => { void exportComparison(item); if (isMobile) setOpenMobile(false); }}><Download size={14} />{exporting ? 'Exporting…' : 'Export'}</DropdownMenuItem><DropdownMenuItem disabled={archiveBusy || running} onSelect={() => { void changeArchive(item, true); if (isMobile) setOpenMobile(false); }}><Archive size={14} />Archive</DropdownMenuItem><DropdownMenuItem onSelect={() => { historyDialogOpener.current = historyActionButtons.current.get(item.id) ?? null; setDeletingChat(item); setDeleteError(''); if (isMobile) setOpenMobile(false); }}><Trash size={14} />Delete</DropdownMenuItem></DropdownMenuContent>
              </DropdownMenu>);}} />
        </SidebarContent>
        <SidebarFooter><Button variant="ghost" className="justify-start" onClick={event => { historyDialogOpener.current = event.currentTarget; setArchiveOpen(true); if (isMobile) setOpenMobile(false); }}><Archive size={15} />Archived chats</Button></SidebarFooter>
      </Sidebar>

      <section className="playground-chat-main" aria-label="Model comparison chat">
        <header className="playground-chat-toolbar"><div className="playground-header-navigation"><Button variant="ghost" size="icon" className="sidebar-toggle" ref={historyToggleRef} onClick={toggleSidebar} aria-label="Toggle chat history" aria-controls="chat-history" aria-expanded={isMobile ? openMobile : open}>{(isMobile ? openMobile : open) ? <IconLayoutSidebarLeftCollapse /> : <IconLayoutSidebarLeftExpand />}</Button><a className="mobile-header-brand" href={import.meta.env.BASE_URL} aria-label="niu.io home"><img src={logo} alt="" /></a></div>
          <h1 className="playground-chat-title">{activeComparison ? sessionTitle(activeComparison) : 'New generation'}</h1>

          <div className="playground-toolbar-actions">
            <Button type="button" variant="outline" className="playground-key-trigger" onClick={() => setApiSettingsOpen(true)} aria-label={'API key: ' + selectedKeyLabel}>
              <KeyRound size={16} /><span>{selectedKeyLabel}</span>
            </Button>
          </div>
        </header>

        <div ref={transcriptRef} className="playground-transcript" aria-live="polite">
          {error && !results && <p role="alert" className="playground-chat-error">{error}</p>}
          {modelsError && <div role="alert" className="playground-chat-error">{modelsError}{onRetryModels && <Button type="button" variant="ghost" disabled={modelsLoading} onClick={()=>void onRetryModels()}>Retry model catalog</Button>}</div>}
          {!initialScope
            ? <div className="playground-chat-empty"><FlaskConical size={26} /><h2>Add an API key</h2><p>Use an API key to authorize generations and track usage.</p><Button asChild variant="outline"><Link to="/workspaces">Manage API keys</Link></Button></div>
            : !results && !prompt.trim()
                ? <div className="playground-first-run">
                  <div className="playground-first-run-heading"><h2>What would you like to create?</h2><p>Write, build, compare models or generate a video.</p>{modelsLoading ? <p role="status">Loading model catalog…</p> : !modelsError && modelAliases.length===0 ? <p>No text models are available. Ask a platform administrator to add a model route to the catalog.</p> : null}</div>
                  <div className="playground-starter-picker" aria-label="Example tasks">
                    <Tabs value={promptCategory} onValueChange={value => {if(value==='video'){navigate(`/generations?mode=video&new=1${workspaceId ? `&workspace=${encodeURIComponent(workspaceId)}`:''}`);return;}setPromptCategory(value as typeof promptCategory);}} className="playground-starter-tabs">
                      <TabsList aria-label="Task category" className="playground-starter-categories">
                        {promptCategories.map(category => <TabsTrigger key={category.id} value={category.id} className="playground-starter-category">{category.label}</TabsTrigger>)}
                      </TabsList>
                    </Tabs>
                    <div className="playground-starters" aria-label="Example prompts">
                      {visiblePromptExamples.map(item => <Button key={item.id} type="button" className="playground-starter" disabled={running || settingsSaving || !draft.ready || (modelsLoading || modelAliases.length === 0)} onClick={() => {setPrompt(item.text); void compare(undefined, item.text); }}><strong>{item.title}</strong><span>{item.summary}</span><ArrowRight size={16} aria-hidden="true" /></Button>)}
                    </div>
                  </div>
                </div>
                : !results
                ? null
                : <>{(activeComparison?.turns ?? [{ prompt: activeComparison?.prompt ?? '', results }]).map((turn, turnIndex) => <div className="playground-comparison-thread" key={turnIndex}>
                  <div className="playground-user-prompt"><span>You</span><p>{turn.prompt}</p></div>
                  {error && <p role="alert" className="playground-chat-error">{error}</p>}
                  <section className="playground-results" aria-labelledby={`playground-results-title-${turnIndex}`}>
                    <div className="playground-results-heading"><h2 id={`playground-results-title-${turnIndex}`}>Responses</h2><span>{turn.results.length} {turn.results.length === 1 ? 'model' : 'models'}</span></div>
                    <div className="playground-result-grid" data-model-count={turn.results.length}>{turn.results.map((result, index) => <article className="panel playground-result-card" key={result.model + '-' + index}>
                      <div className="playground-result-card-heading"><div><ProviderLogo provider={modelIdentity({ id: result.model })} size="small" /><h3>{result.model}</h3></div><Badge variant={result.phase === 'failed' ? 'destructive' : 'secondary'}>{result.phase === 'failed' ? 'Failed' : result.phase === 'cancelled' ? 'Cancelled' : result.phase === 'connecting' ? 'Connecting' : result.phase === 'streaming' ? 'Generating' : 'Complete'}</Badge></div>
                      {result.phase === 'failed' ? <p className="playground-response-error">{result.error}</p> : result.content ? <div className="playground-response"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { trust: false, strict: false }]]}>{mathDelimiters(result.content)}</ReactMarkdown></div> : result.phase === 'cancelled' ? <p className="playground-response-error">Cancelled before any output arrived.</p> : <div className="playground-response playground-response-pending">{result.phase === 'streaming' ? 'Waiting for more output…' : 'Waiting for a response…'}</div>}
                      <div className="playground-result-footer">
                        <div className="playground-card-metrics">
                          <div><Clock3 size={15} /><span>Time</span><strong>{result.elapsedMs.toLocaleString()} ms</strong></div>
                          <div><Hash size={15} /><span>Tokens</span><strong>{result.totalTokens === null ? 'Unknown' : result.totalTokens.toLocaleString()}</strong></div>
                          <div><CircleDollarSign size={15} /><span>Customer charge</span><strong>{customerCharge(result)}</strong></div>
                        </div>
                        <div className="playground-result-actions">
                          {result.content && <Button type="button" variant="ghost" size="sm" aria-label={'Copy ' + result.model + ' response'} onClick={() => void copyResponse(`${turnIndex}:${result.model}`, result.content)}><ClipboardCopy size={14} />{copiedResponse === `${turnIndex}:${result.model}` ? 'Copied' : 'Copy'}</Button>}
                          {result.attemptId && <Link className="playground-attempt-link" to={workspaceRoot + '/executions?modelAlias=' + encodeURIComponent(result.model) + '#gateway-attempt-' + encodeURIComponent(result.attemptId)}>Inspect request<ArrowUpRight size={13} /></Link>}
                        </div>
                      </div>
                    </article>)}</div>
                    {turn.results.length > 1 && <details className="playground-measurement-details">
                      <summary><Timer size={16} />Compare measured usage</summary>
                      <div className="playground-measurements">
                        <div className="playground-metric-table-wrap"><ShadcnTable className="playground-metric-table" style={{ minWidth: (516 + (turn.results.length - 2) * 224) + 'px' }}><caption className="playground-table-caption">Each value comes from these requests. Missing gateway evidence remains unknown.</caption><TableHeader><TableRow>
                          <TableHead scope="col">Measure</TableHead>
                          {turn.results.map((result, index) => <Fragment key={result.model}>
                            <TableHead scope="col" className={index === 0 ? 'playground-baseline-column' : undefined}>{index === 0 ? <>Baseline<br /><span>{result.model}</span></> : result.model}</TableHead>
                            {index > 0 && <TableHead scope="col" className="playground-delta-heading" aria-label={'Difference for ' + result.model + ' versus baseline'}>Δ vs baseline</TableHead>}
                          </Fragment>)}
                        </TableRow></TableHeader><TableBody>{comparisonMetrics.map(metric => <TableRow key={metric.key}>
                          <TableHead scope="row">{metric.label}</TableHead>
                          {turn.results.map((result, index) => <Fragment key={result.model}>
                            <TableCell className={index === 0 ? 'playground-baseline-column' : undefined}>{metricValue(result, metric.key)}</TableCell>
                            {index > 0 && <TableCell className="playground-delta-cell">{turn.results[0] ? metricDifference(turn.results[0], result, metric.key) : 'Not comparable'}</TableCell>}
                          </Fragment>)}
                        </TableRow>)}</TableBody></ShadcnTable></div>
                      </div>
                    </details>}
                  </section>
                </div>)}</>}
          {notice && <p className="playground-result-notice" role="status">{notice}</p>}
          {!historyLoading && !historyError && !draft.ready && !draft.error && <p role="status" className="playground-result-notice">Loading draft…</p>}
          {draft.error && <div role="alert" className="playground-chat-error">{draft.error}<Button type="button" variant="ghost" onClick={draft.retry}>{draft.conflict?'Load saved draft':draft.ready?'Retry saving draft':'Retry loading draft'}</Button></div>}
        </div>

        {initialScope && modelAliases.length >= minComparisonModels && <Popover open={chatSettingsOpen} onOpenChange={open => {if (open) {setSettingsSaveError('');setChatSettingsOpen(true);} else void closeChatSettings();}}><form ref={composerRef} onSubmit={compare} className="playground-composer" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void addAttachments(event.dataTransfer.files); }}>
          <PopoverAnchor asChild><div className="playground-composer-surface">
            <Label htmlFor="playground-user-prompt" className="sr-only">Prompt for all selected models</Label>
            <Textarea id="playground-user-prompt" rows={2} maxLength={12000} required disabled={running || settingsSaving || !draft.ready} value={prompt} onChange={event => { setPrompt(event.target.value); setNotice(''); setError(''); }} onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (canSubmit) event.currentTarget.form?.requestSubmit();
              }
            }} placeholder="Message models…" />
            {attachments.length > 0 && <div className="flex flex-wrap gap-2 py-2">{attachments.map((file, index) => <div key={index} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">{file.type === 'image' && <img src={file.content} alt="" className="size-8 rounded object-cover" />}<span>{file.name}</span><Button type="button" variant="ghost" size="icon" disabled={running || settingsSaving || !draft.ready} aria-label={`Remove ${file.name}`} onClick={() => setAttachments(current => current.filter((_, i) => i !== index))}><X size={14}/></Button></div>)}</div>}
            <div className="playground-composer-actions">
              <Input ref={attachmentInput} type="file" className="hidden" aria-label="Upload chat attachments" multiple accept="image/png,image/jpeg,image/webp,text/*,.md,.json,.csv,.py,.ts,.js" onChange={event => void addAttachments(event.target.files)} />
              <Button type="button" variant="ghost" size="icon" disabled={running || settingsSaving || !draft.ready} aria-label="Attach files" onClick={() => attachmentInput.current?.click()}><Paperclip size={18}/></Button>
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <HoverCard open={modelDetailsOpen && !modelPickerOpen} onOpenChange={(open) => setModelDetailsOpen(open && !modelPickerOpen)} openDelay={150} closeDelay={250}>
                  <HoverCardTrigger asChild>
                    <Button type="button" variant="ghost" className="h-9 gap-2 px-2" disabled={running || settingsSaving || !draft.ready} aria-label={`Edit comparison models (${selectedModels.length} selected)`} onClick={openModelPicker}>
                      <span className="flex items-center -space-x-2" aria-hidden="true">{selectedModels.map(model => <span key={model} className="rounded-full border-2 border-background bg-background"><ProviderLogo provider={modelIdentity({id: model})} size="small" /></span>)}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{selectedModels.length}</span>
                    </Button>
                  </HoverCardTrigger>
                  <HoverCardContent side="top" align="start" sideOffset={12} collisionPadding={12} className="w-[min(24rem,calc(100vw-2rem))] space-y-3">
                    <div className="flex items-center justify-between"><strong className="text-sm">Comparison models</strong><Button type="button" variant="ghost" size="sm" disabled={running || settingsSaving || !draft.ready} onClick={openModelPicker}>Edit</Button></div>
                    <div className="space-y-2">{selectedModels.map(model => <div key={model} className="flex items-center gap-3">
                      <ProviderLogo provider={modelIdentity({id: model})} size="small" />
                      <Link className="min-w-0 flex-1 break-words text-sm hover:underline" to={`${workspaceRoot}/models/${model.split('/').map(encodeURIComponent).join('/')}`}>{model}</Link>
                      <Button type="button" variant="ghost" size="icon" disabled={running || settingsSaving || !draft.ready} aria-label={`Remove ${model}`} onClick={() => toggleModel(model)}><X size={14} /></Button>
                    </div>)}</div>
                    <Button type="button" variant="outline" size="sm" disabled={running || settingsSaving || !draft.ready} onClick={openModelPicker}><Plus size={14} />Add models</Button>
                  </HoverCardContent>
                </HoverCard>
                <Button type="button" variant="ghost" size="icon" aria-label="Choose models" title="Choose models" onClick={openModelPicker} disabled={running || modelAliases.length === 0}><Plus size={18} /></Button>
              </div>

                <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" disabled={running || settingsSaving || !draft.ready} aria-label="Chat settings" title="Chat settings"><Settings2 size={18} /></Button></PopoverTrigger>
              {running
                ? <Button type="button" size="icon" className="rounded-full" aria-label="Stop generating" onClick={cancelComparison}><Square size={14} /></Button>
                : <Button type="submit" size="icon" className="rounded-full" aria-label={`Send to ${selectedModels.length} ${selectedModels.length === 1 ? 'model' : 'models'}`}  disabled={!canSubmit}><ArrowUp size={19} /></Button>}
            </div>
          </div></PopoverAnchor>
        </form>
                <PopoverContent side="top" align="end" sideOffset={12} collisionPadding={12} aria-labelledby="chat-settings-title" className="w-[min(24rem,calc(100vw-2rem))] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto space-y-4">
                  {settingsSaving && <p role="status" className="text-sm text-muted-foreground">Saving settings…</p>}
                  {settingsSaveError && <div className="grid gap-2"><p role="alert" className="text-sm text-destructive">{settingsSaveError}</p><Button type="button" variant="secondary" disabled={settingsSaving} onClick={() => void closeChatSettings()}>Retry saving settings</Button></div>}
                  <div className="flex items-center justify-between gap-3"><h2 id="chat-settings-title" className="text-sm font-semibold">Chat settings</h2><Button type="button" variant="ghost" size="icon" aria-label="Close chat settings" disabled={settingsSaving} onClick={() => void closeChatSettings()}><X size={16} /></Button></div>
        <div className="flex items-start gap-3"><Checkbox id="chat-log-payloads" checked={logPayloads} disabled={running || settingsSaving || !draft.ready} onCheckedChange={value => setLogPayloads(value === true)} /><div className="space-y-1"><Label htmlFor="chat-log-payloads">Save payloads in Logs</Label><p className="text-sm text-muted-foreground">Keep request and response content in this workspace for 24 hours. Applies to new requests only.</p></div></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="playground-max-tokens">Max output tokens</Label><Input id="playground-max-tokens" type="number" min="1" step="1" disabled={running || settingsSaving || !draft.ready} value={Number.isNaN(maxTokens) ? '' : maxTokens} aria-invalid={!Number.isSafeInteger(maxTokens) || maxTokens <= 0} onChange={event => setMaxTokens(event.target.value === '' ? NaN : Number(event.target.value))} />{(!Number.isSafeInteger(maxTokens) || maxTokens <= 0) && <p role="alert" className="text-sm text-destructive">Enter a positive whole number.</p>}</div>
        <div className="space-y-2"><Label htmlFor="playground-temperature">Temperature</Label><Input id="playground-temperature" type="number" min="0" max="2" step="0.1" disabled={running || settingsSaving || !draft.ready} value={Number.isNaN(temperature) ? '' : temperature} aria-invalid={!Number.isFinite(temperature) || temperature < 0 || temperature > 2} onChange={event => setTemperature(event.target.value === '' ? NaN : Number(event.target.value))} />{(!Number.isFinite(temperature) || temperature < 0 || temperature > 2) && <p role="alert" className="text-sm text-destructive">Enter a temperature from 0 to 2.</p>}</div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="playground-system-prompt">System instructions</Label><Textarea id="playground-system-prompt" rows={4} maxLength={12000} disabled={running || settingsSaving || !draft.ready} value={systemPrompt} onChange={event => setSystemPrompt(event.target.value)} placeholder="Optional" /></div>

      </div>
                </PopoverContent>
        </Popover>}
      </section>
    </div>

    <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
      <DialogContent className="sm:max-w-lg" onCloseAutoFocus={restoreHistoryFocus}><DialogHeader><DialogTitle>Archived chats</DialogTitle><DialogDescription>Restore a conversation to your chat history.</DialogDescription></DialogHeader>
        {archiveError && <div className="grid justify-items-start gap-2"><p role="alert" className="text-sm text-destructive">{archiveError}</p>{archiveReadFailed && <Button variant="secondary" disabled={archiveLoading} onClick={() => setArchiveRevision(value => value + 1)}>Retry</Button>}</div>}
        {archiveLoading ? <p role="status">Loading archived chats…</p> : archivedChats.length === 0 ? (archiveError ? null : <Empty><EmptyHeader><EmptyMedia variant="icon"><Archive aria-hidden="true"/></EmptyMedia><EmptyTitle>No archived chats</EmptyTitle></EmptyHeader></Empty>) : <div className="max-h-[60vh] overflow-auto"><ShadcnTable className="table-fixed"><TableHeader><TableRow><TableHead>Chat</TableHead><TableHead className="w-32 text-right">Action</TableHead></TableRow></TableHeader><TableBody>{archivedChats.map(item => <TableRow key={item.id}><TableCell className="whitespace-normal break-words">{sessionTitle(item)}</TableCell><TableCell className="text-right"><Button variant="ghost" disabled={archiveBusy || running} onClick={() => void changeArchive(item, false)} aria-label={`Restore ${sessionTitle(item)}`}>Restore</Button></TableCell></TableRow>)}</TableBody></ShadcnTable></div>}
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(deletingChat)} onOpenChange={open => { if (!open && !deleting) setDeletingChat(null); }}>
      <DialogContent className="sm:max-w-sm" onCloseAutoFocus={restoreHistoryFocus}><DialogHeader><DialogTitle>Delete chat?</DialogTitle><DialogDescription>This removes the saved conversation. Request logs and billing records are kept.</DialogDescription></DialogHeader>
        {deleteError && <p role="alert">{deleteError}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" disabled={deleting} onClick={() => setDeletingChat(null)}>Cancel</Button><Button variant="destructive" disabled={deleting} onClick={async () => {
          if (!deletingChat || deleting) return;
          const item = deletingChat, endpoint = historyEndpoint, identity = historyIdentity;
          setDeleting(true); setDeleteError('');
          try {
            const response = await fetch(`${endpoint}/${item.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
            if (!response.ok) throw new Error('delete failed');
            if (historyScope.current !== identity) return;
            setHistory(items => items.filter(saved => saved.id !== item.id));
            if (activeComparisonId === item.id) startNewComparison();
            setDeletingChat(null);
          } catch { if (historyScope.current === identity) setDeleteError('Could not delete this chat. Try again.'); }
          finally { setDeleting(false); }
        }}>{deleting ? 'Deleting…' : 'Delete chat'}</Button></div>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(renamingChat)} onOpenChange={open => { if (!open && !renaming) setRenamingChat(null); }}>
      <DialogContent className="sm:max-w-sm" onCloseAutoFocus={restoreHistoryFocus}><DialogHeader><DialogTitle>Rename chat</DialogTitle><DialogDescription className="sr-only">Set a title for this conversation.</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={async event => {
          event.preventDefault(); if (!renamingChat || !chatTitle.trim() || renaming) return;
          setRenaming(true); setRenameError('');
          const updated = { ...renamingChat, title: chatTitle.trim() };
          try { await saveComparison(updated); setHistory(items => items.map(item => item.id === updated.id ? updated : item)); setRenamingChat(null); }
          catch { setRenameError('Could not rename this chat. Try again.'); }
          finally { setRenaming(false); }
        }}>
          <Input aria-label="Chat title" value={chatTitle} onChange={event => setChatTitle(event.target.value)} maxLength={120} autoFocus />
          {renameError && <p role="alert">{renameError}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={renaming} onClick={() => setRenamingChat(null)}>Cancel</Button><Button type="submit" disabled={renaming || !chatTitle.trim()}>{renaming ? 'Saving…' : 'Save'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
      <DialogContent className="niu-modal playground-model-dialog" showCloseButton={false}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>Choose models</DialogTitle><DialogDescription>Select one to four enabled routes. Each receives the same prompt.</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
        </DialogHeader>
      <div className="playground-model-picker">
        <label className="model-search"><span className="sr-only">Search models</span><Input autoFocus value={modelQuery} onChange={event => setModelQuery(event.target.value)} placeholder="Search model routes" /></label>
        <Tabs value={activeModelCategory?.id} onValueChange={value => { setModelCategory(value); setModelQuery(''); }}>
          <TabsList className="playground-model-categories" aria-label="Model categories">
            {modelCategories.map(category => <TabsTrigger key={category.id} value={category.id} className="playground-model-category">{category.label}<span>{category.models.length}</span></TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="playground-model-picker-list">{filteredModelAliases.map(model => {
          const selected = selectedModels.includes(model);
          return <Button key={model} type="button" className="playground-model-picker-option" aria-pressed={selected} disabled={!selected && selectedModels.length >= maxComparisonModels} onClick={() => toggleModel(model)}>
            <ProviderLogo provider={modelIdentity({ id: model })} size="small" /><span>{model}</span>{selected && <Check size={16} />}
          </Button>;
        })}{filteredModelAliases.length === 0 && <p className="model-no-results">{modelsLoading ? 'Loading models…' : modelsError ? 'Model catalog unavailable.' : 'No model routes found.'}</p>}</div>
        {((modelQuery.trim() ? usableModels.filter(model => model.toLowerCase().includes(modelQuery.trim().toLowerCase())).length : activeModelCategory?.models.length ?? usableModels.length) > filteredModelAliases.length) && <p className="playground-model-picker-hint">Showing {filteredModelAliases.length} routes. Refine your search to find another.</p>}
      </div>
    </DialogContent>
    </Dialog>

    <Dialog open={apiSettingsOpen} onOpenChange={open => { setApiSettingsOpen(open); if (!open) pendingExample.current = null; }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>API key</DialogTitle><DialogDescription>Select an API key for this generation. Its workspace supplies billing and limits.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          {availableKeys.error && <p role="alert" className="text-sm text-destructive">{availableKeys.error}</p>}
          {keyLoadError && <p role="alert" className="text-sm text-destructive">{keyLoadError}</p>}
          <div className="space-y-2"><Label htmlFor="playground-api-key">Key</Label>
            <DropdownMenu><DropdownMenuTrigger asChild><Button id="playground-api-key" aria-label="API key" disabled={running || settingsSaving || !draft.ready} variant="outline" className="w-full justify-between font-normal">{keyChoices.find(key => key.id === selectedKeyId)?.name ?? 'Use another key'}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={selectedKeyId || 'manual'} onValueChange={value => {const chosen=availableKeys.keys.find(key=>key.id===value);if(chosen&&chosen.workspace.id!==workspaceId){navigate(`/generations?new=1&workspace=${encodeURIComponent(chosen.workspace.id)}&key=${encodeURIComponent(value)}`);return;} setSelectedKeyId(value); setManualKey(''); setResults(null); setError(''); }}>
              {(availableKeys.keys.length?availableKeys.keys:keyChoices.map(key=>({...key,workspace}))).map(key => <DropdownMenuRadioItem key={key.id} value={key.id}>{key.name}{key.workspace && key.workspace.id!==workspaceId ? ` · ${key.workspace.name}`:''}</DropdownMenuRadioItem>)}<DropdownMenuRadioItem value="manual">Use another key</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
          </div>
          {!selectedKey && !managedKey && <div className="space-y-2"><Label htmlFor="playground-existing-key">Key secret</Label><Input id="playground-existing-key" type="password" autoComplete="off" spellCheck={false} disabled={running || settingsSaving || !draft.ready} value={manualKey} onChange={event => { setManualKey(event.target.value); setError(''); }} placeholder="Paste your API key" /><p className="text-sm text-muted-foreground">Paste a workspace API key to use it in this chat.</p></div>}
          {selectedKey && usableModels.length < minComparisonModels && <p role="alert" className="text-sm text-destructive">This key does not allow any available models.</p>}
        </div>
        <div className="flex justify-between gap-3"><Button asChild variant="ghost"><Link to={workspaceRoot + '/keys'}>Manage keys<ArrowUpRight size={15} /></Link></Button><Button disabled={!apiKey} onClick={() => { setApiSettingsOpen(false); if (pendingExample.current && apiKey) void compare(undefined, pendingExample.current); }}>Done</Button></div>
    </DialogContent>
    </Dialog>
  </div>;
}
