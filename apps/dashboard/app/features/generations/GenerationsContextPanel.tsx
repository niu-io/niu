import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  IconCheck,
  IconClock,
  IconCode,
  IconCoin,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconFileText,
  IconHash,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconLoader2,
  IconPlayerPlay,
  IconSparkles,
  IconVideo,
  IconX,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProviderLogo from '@/components/ProviderLogo';
import { catalogTitle, disambiguatedCatalogTitle, modelIdentity } from '@/lib/providers';
import { readLocale as readUILocale, translateUI, useLocale as useUILocale } from '@/shell/ui-locale';
import { generationOutcome } from '../playground/generation-outcome';

export type GenerationContextRunState =
  | 'connecting'
  | 'streaming'
  | 'queued'
  | 'running'
  | 'complete'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'saved'
  | 'not_dispatched'
  | 'unknown';

export type GenerationContextRun = {
  id: string;
  reference?: string;
  turnIndex: number;
  turnAnchor?: string;
  prompt: string;
  model: string;
  modelTitle: string;
  kind: 'chat' | 'video';
  state: GenerationContextRunState;
  statusLabel: string;
  statusDetail?: string;
  error?: string | null;
  elapsedMs?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  customerChargeText?: string | null;
  logsHref?: string | null;
  settingsSummary?: Array<{ label: string; value: string }>;
  customDetails?: ReactNode;
};

export type GenerationContextDeliverable = {
  id: string;
  turnIndex: number;
  turnAnchor?: string;
  runId?: string;
  title: string;
  subtitle: string;
  kind: 'code' | 'document' | 'video';
  language?: string;
  preview?: string;
  content?: string;
  filename?: string;
  href?: string;
  statusLabel?: string;
};

export type GenerationsContextPanelData = {
  runs: GenerationContextRun[];
  deliverables: GenerationContextDeliverable[];
  initialRunId?: string | null;
};

type OpenContextEventDetail = {
  tab?: 'runs' | 'deliverables';
  runId?: string;
};

const OPEN_CONTEXT_EVENT = 'niu:generations-context-open';
const VIDEO_TURN_UPDATE_EVENT = 'niu:generations-video-turn-run';

const registeredVideoTurnRuns = new Map<string, GenerationContextRun>();

export function openGenerationsContextRun(runId?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<OpenContextEventDetail>(OPEN_CONTEXT_EVENT, {
    detail: { tab: 'runs', runId },
  }));
}

export function openGenerationsContextDeliverables() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<OpenContextEventDetail>(OPEN_CONTEXT_EVENT, {
    detail: { tab: 'deliverables' },
  }));
}

export function useRegisterVideoTurnRun(sessionKey: string, run: GenerationContextRun | null) {
  const latestRun = useRef(run);
  latestRun.current = run;
  const runId = run?.id ?? '';
  const state = run?.state ?? 'unknown';
  const statusLabel = run?.statusLabel ?? '';
  const hasDetails = Boolean(run?.customDetails);
  useEffect(() => {
    const current = latestRun.current;
    if (!sessionKey || !runId || !current) return;
    const key = `${sessionKey}:${runId}`;
    registeredVideoTurnRuns.set(key, current);
    window.dispatchEvent(new CustomEvent(VIDEO_TURN_UPDATE_EVENT));
    return () => {
      registeredVideoTurnRuns.delete(key);
      window.dispatchEvent(new CustomEvent(VIDEO_TURN_UPDATE_EVENT));
    };
  }, [sessionKey, runId, state, statusLabel, hasDetails]);
}

export function isRunActive(state: GenerationContextRunState) {
  return state === 'connecting' || state === 'streaming' || state === 'queued' || state === 'running';
}

function extensionForLanguage(lang?: string) {
  const normalized = (lang ?? '').trim().toLowerCase();
  const map: Record<string, string> = {
    ts: 'ts', typescript: 'ts', tsx: 'tsx', js: 'js', javascript: 'js', jsx: 'jsx',
    py: 'py', python: 'py', rs: 'rs', rust: 'rs', go: 'go', java: 'java',
    json: 'json', html: 'html', css: 'css', sql: 'sql', sh: 'sh', bash: 'sh',
    yaml: 'yml', yml: 'yml', md: 'md', markdown: 'md',
  };
  return map[normalized] ?? 'txt';
}

export function buildChatContextPanelData<
  T extends {
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
  },
>(
  turns: Array<{
    prompt: string;
    results: T[];
  }>,
  formatCharge: (result: T) => string,
  catalogModels: Array<{ id: string; display_name?: string | null }> = [],
  workspaceRoot = '/workspaces/default',
  settings?: { systemPrompt: string; maxTokens: number; temperature: number; logPayloads?: boolean },
): GenerationsContextPanelData {
  const runs: GenerationContextRun[] = [];
  const deliverables: GenerationContextDeliverable[] = [];
  const locale = readUILocale();

  turns.forEach((turn, index) => {
    const turnIndex = index + 1;
    const turnAnchor = `generation-turn-${turnIndex}`;
    turn.results.forEach((result, modelIndex) => {
      const runId = `turn-${turnIndex}:${result.model}:${modelIndex}`;
      const modelObj = catalogModels.find(item => item.id === result.model) ?? { id: result.model };
      const modelTitle = disambiguatedCatalogTitle(modelObj, catalogModels);
      const outcome = generationOutcome(result.finishReason);
      const statusLabel =
        result.phase === 'failed' ? translateUI('Failed')
        : result.phase === 'cancelled' ? translateUI('Cancelled')
        : result.phase === 'connecting' ? translateUI('Connecting')
        : result.phase === 'streaming' ? translateUI('Generating')
        : translateUI(outcome.label);

      const settingsSummary: Array<{ label: string; value: string }> = [];
      if (settings) {
        settingsSummary.push(
          { label: translateUI('Max output tokens'), value: settings.maxTokens.toLocaleString(locale) },
          { label: translateUI('Temperature'), value: String(settings.temperature) },
          { label: translateUI('System instructions'), value: settings.systemPrompt.trim() ? translateUI('Configured') : translateUI('None') },
        );
      }

      runs.push({
        id: runId,
        reference: result.attemptReference ?? undefined,
        turnIndex,
        turnAnchor,
        prompt: turn.prompt,
        model: result.model,
        modelTitle,
        kind: 'chat',
        state: result.phase,
        statusLabel,
        statusDetail: result.phase === 'complete' && outcome.detail ? translateUI(outcome.detail) : undefined,
        error: result.error,
        elapsedMs: result.elapsedMs,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        customerChargeText: formatCharge(result),
        logsHref: result.attemptId
          ? `${workspaceRoot}/executions?modelAlias=${encodeURIComponent(result.model)}#gateway-attempt-${encodeURIComponent(result.attemptReference ?? result.attemptId)}`
          : null,
        settingsSummary,
      });

      if (result.content.trim()) {
        const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
        let blockCount = 0;
        for (const match of result.content.matchAll(codeBlockRegex)) {
          const lang = match[1]?.trim() || 'code';
          const code = match[2]?.trim() ?? '';
          if (!code) continue;
          blockCount += 1;
          const firstLine = code.split('\n').find(line => line.trim())?.trim().slice(0, 64) || `${lang.toUpperCase()} snippet`;
          deliverables.push({
            id: `${runId}:code:${blockCount}`,
            turnIndex,
            turnAnchor,
            runId,
            title: firstLine,
            subtitle: `${translateUI('Turn')} ${turnIndex} · ${modelTitle}`,
            kind: 'code',
            language: lang,
            preview: code.split('\n').slice(0, 8).join('\n'),
            content: code,
            filename: `turn-${turnIndex}-${blockCount}.${extensionForLanguage(lang)}`,
            statusLabel,
          });
        }
        if (blockCount === 0 && result.phase === 'complete') {
          const summaryLine = turn.prompt.split('\n')[0]?.trim().slice(0, 60) || catalogTitle({ id: result.model });
          deliverables.push({
            id: `${runId}:doc`,
            turnIndex,
            turnAnchor,
            runId,
            title: summaryLine,
            subtitle: `${translateUI('Turn')} ${turnIndex} · ${modelTitle}`,
            kind: 'document',
            language: 'markdown',
            preview: result.content.trim().slice(0, 220),
            content: result.content,
            filename: `turn-${turnIndex}-response.md`,
            statusLabel,
          });
        }
      }
    });
  });

  return { runs, deliverables };
}

export function GenerationsContextTrigger({
  panel,
  open,
  onToggle,
}: {
  panel: GenerationsContextPanelData;
  open: boolean;
  onToggle: () => void;
}) {
  const { t: uiT } = useUILocale();
  const activeCount = panel.runs.filter(run => isRunActive(run.state)).length;
  const totalItems = panel.runs.length + panel.deliverables.length;

  return (
    <Button
      type="button"
      variant={open ? 'secondary' : 'outline'}
      className="generations-context-trigger"
      onClick={onToggle}
      aria-label={uiT('Toggle context panel')}
      aria-controls="generations-context-panel"
      aria-expanded={open}
    >
      {activeCount > 0 ? (
        <IconLoader2 size={16} className="animate-spin text-primary" aria-hidden="true" />
      ) : open ? (
        <IconLayoutSidebarRightCollapse size={16} aria-hidden="true" />
      ) : (
        <IconLayoutSidebarRightExpand size={16} aria-hidden="true" />
      )}
      <span>{uiT('Context')}</span>
      {totalItems > 0 && (
        <span className="generations-context-trigger-count" aria-hidden="true">
          {activeCount > 0 ? `${activeCount} ${uiT('running')}` : panel.runs.length}
        </span>
      )}
    </Button>
  );
}

export default function GenerationsContextPanel({
  sessionKey,
  panel,
  open,
  onOpenChange,
  activeTab,
  onTabChange,
  selectedRunId,
  onSelectRun,
}: {
  sessionKey?: string;
  panel: GenerationsContextPanelData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: 'runs' | 'deliverables';
  onTabChange: (tab: 'runs' | 'deliverables') => void;
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const locale = readUILocale();
  const [copiedId, setCopiedId] = useState('');
  const [, setVideoTurnRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setVideoTurnRevision(v => v + 1);
    window.addEventListener(VIDEO_TURN_UPDATE_EVENT, refresh);
    return () => window.removeEventListener(VIDEO_TURN_UPDATE_EVENT, refresh);
  }, []);

  const mergedRuns = panel.runs.map(run => {
    if (!sessionKey) return run;
    const hydrated = registeredVideoTurnRuns.get(`${sessionKey}:${run.id}`);
    return hydrated ? { ...run, ...hydrated } : run;
  });

  const activeRuns = mergedRuns.filter(run => isRunActive(run.state));
  const selectedRun = (() => {
    if (selectedRunId) {
      const matched = mergedRuns.find(run => run.id === selectedRunId || run.reference === selectedRunId);
      if (matched) return matched;
    }
    if (activeRuns.length > 0) return activeRuns[activeRuns.length - 1];
    return mergedRuns[mergedRuns.length - 1] ?? null;
  })();

  if (!open) return null;

  function jumpToTurn(anchor?: string) {
    if (!anchor || typeof document === 'undefined') return;
    const target = document.getElementById(anchor);
    if (!target) return;
    if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  }

  async function copyDeliverable(id: string, content: string) {
    try {
      if (!navigator.clipboard?.writeText) return;
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(current => (current === id ? '' : current)), 1800);
    } catch {
      /* Clipboard access is optional. */
    }
  }

  function downloadDeliverable(filename: string, content: string) {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <aside
      id="generations-context-panel"
      className="generations-context-panel"
      aria-label={uiT('Generation context')}
    >
      <div className="generations-context-header">
        <div className="min-w-0">
          <h2 className="generations-context-title">{uiT('Context')}</h2>
          <p className="generations-context-subtitle">
            {activeRuns.length > 0
              ? uiF('{0} running · {1} deliverables', [activeRuns.length, panel.deliverables.length])
              : uiF('{0} runs · {1} deliverables', [mergedRuns.length, panel.deliverables.length])}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={uiT('Close context panel')}
          onClick={() => onOpenChange(false)}
        >
          <IconX size={16} />
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={value => onTabChange(value as 'runs' | 'deliverables')}
        className="generations-context-tabs"
      >
        <div className="px-3 pt-2">
          <TabsList className="w-full" aria-label={uiT('Context sections')}>
            <TabsTrigger value="runs" className="flex-1 gap-1.5">
              <IconPlayerPlay size={14} aria-hidden="true" />
              <span>{uiT('Task runs')}</span>
              {mergedRuns.length > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">({mergedRuns.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="deliverables" className="flex-1 gap-1.5">
              <IconSparkles size={14} aria-hidden="true" />
              <span>{uiT('Deliverables')}</span>
              {panel.deliverables.length > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">({panel.deliverables.length})</span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="runs" className="generations-context-body">
          {mergedRuns.length === 0 ? (
            <Empty className="border-0 bg-transparent p-4">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconPlayerPlay size={18} aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{uiT('No runs in this session')}</EmptyTitle>
                <EmptyDescription>
                  {uiT('Send a message or start a generation to inspect live progress and run details here.')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="generations-context-runs">
              {mergedRuns.length > 1 && (
                <section className="generations-run-selector" aria-label={uiT('Session runs')}>
                  {[...mergedRuns].reverse().map(run => {
                    const isSelected = selectedRun?.id === run.id;
                    const active = isRunActive(run.state);
                    return (
                      <Button
                        key={run.id}
                        type="button"
                        variant="ghost"
                        className={`generations-run-item h-auto justify-start whitespace-normal font-normal${isSelected ? ' is-selected' : ''}`}
                        aria-current={isSelected ? 'true' : undefined}
                        onClick={() => onSelectRun(run.id)}
                      >
                        <div className="generations-run-item-top">
                          <span className="generations-run-item-model">
                            {run.kind === 'video' ? (
                              <IconVideo size={14} className="shrink-0 text-muted-foreground" />
                            ) : (
                              <ProviderLogo provider={modelIdentity({ id: run.model, catalog: { name: run.modelTitle } })} size="small" />
                            )}
                            <span className="truncate">{run.modelTitle}</span>
                          </span>
                          <Badge variant={run.state === 'failed' ? 'destructive' : active ? 'default' : 'secondary'}>
                            {active && <IconLoader2 size={12} className="mr-1 animate-spin" />}
                            {`${uiT('Turn')} ${run.turnIndex} · ${run.statusLabel}`}
                          </Badge>
                        </div>
                        <p className="generations-run-item-prompt">
                          {`“${run.prompt.split('\n')[0]?.slice(0, 80) || uiT('Saved request')}”`}
                        </p>
                      </Button>
                    );
                  })}
                </section>
              )}

              {selectedRun && (
                <section className="generations-run-inspector" aria-label={uiT('Selected run details')}>
                  <div className="generations-run-inspector-header">
                    <div className="flex min-w-0 items-center gap-2">
                      {selectedRun.kind === 'video' ? (
                        <IconVideo size={18} className="shrink-0 text-primary" />
                      ) : (
                        <ProviderLogo provider={modelIdentity({ id: selectedRun.model, catalog: { name: selectedRun.modelTitle } })} size="small" />
                      )}
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">{selectedRun.modelTitle}</h3>
                        <p className="truncate text-xs text-muted-foreground">
                          {selectedRun.reference && /^(?:run|req)-[1-9][0-9]{0,18}$/.test(selectedRun.reference)
                            ? `${uiT('Turn')} ${selectedRun.turnIndex} · ${selectedRun.reference}`
                            : `${uiT('Turn')} ${selectedRun.turnIndex}`}
                        </p>
                      </div>
                    </div>
                    <Badge variant={selectedRun.state === 'failed' ? 'destructive' : isRunActive(selectedRun.state) ? 'default' : 'secondary'}>
                      {isRunActive(selectedRun.state) && <IconLoader2 size={12} className="mr-1 animate-spin" />}
                      {`${uiT('Turn')} ${selectedRun.turnIndex} · ${selectedRun.statusLabel}`}
                    </Badge>
                  </div>

                  {isRunActive(selectedRun.state) && (
                    <div className="generations-run-progress" role="status">
                      <div className="generations-run-progress-title">
                        <IconLoader2 size={15} className="animate-spin text-primary" />
                        <strong>
                          {selectedRun.state === 'connecting'
                            ? uiT('Connecting to model route…')
                            : selectedRun.state === 'streaming'
                              ? uiT('Streaming response in real time…')
                              : selectedRun.state === 'queued'
                                ? uiT('Queued for generation…')
                                : uiT('Running generation task…')}
                        </strong>
                      </div>
                      <ol className="generations-run-steps">
                        <li className="is-done">
                          <IconCheck size={14} />
                          <span>{uiT('Request authorized and dispatched')}</span>
                        </li>
                        <li className="is-current">
                          <IconLoader2 size={14} className="animate-spin" />
                          <span>
                            {selectedRun.kind === 'video'
                              ? uiT('Generating media output')
                              : uiT('Receiving model output tokens')}
                          </span>
                        </li>
                        <li>
                          <span className="generations-run-step-dot" />
                          <span>{uiT('Record usage and customer charge')}</span>
                        </li>
                      </ol>
                    </div>
                  )}

                  {selectedRun.statusDetail && (
                    <p className="text-xs text-muted-foreground">{selectedRun.statusDetail}</p>
                  )}
                  {selectedRun.error && (
                    <p className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
                      {`${uiT('Error')}: ${uiT(selectedRun.error)}`}
                    </p>
                  )}

                  {selectedRun.kind === 'chat' && (
                    <dl className="generations-run-metrics">
                      <div>
                        <dt>
                          <IconClock size={14} />
                          <span>{uiT('Elapsed time')}</span>
                        </dt>
                        <dd>
                          {selectedRun.elapsedMs != null
                            ? `${selectedRun.elapsedMs.toLocaleString(locale)} ${uiT('ms')}`
                            : uiT('Unknown')}
                        </dd>
                      </div>
                      <div>
                        <dt>
                          <IconHash size={14} />
                          <span>{uiT('Prompt tokens')}</span>
                        </dt>
                        <dd>
                          {selectedRun.promptTokens != null
                            ? selectedRun.promptTokens.toLocaleString(locale)
                            : uiT('Unknown')}
                        </dd>
                      </div>
                      <div>
                        <dt>
                          <IconHash size={14} />
                          <span>{uiT('Output tokens')}</span>
                        </dt>
                        <dd>
                          {selectedRun.completionTokens != null
                            ? selectedRun.completionTokens.toLocaleString(locale)
                            : uiT('Unknown')}
                        </dd>
                      </div>
                      <div>
                        <dt>
                          <IconHash size={14} />
                          <span>{uiT('Total tokens')}</span>
                        </dt>
                        <dd>
                          {selectedRun.totalTokens != null
                            ? selectedRun.totalTokens.toLocaleString(locale)
                            : uiT('Unknown')}
                        </dd>
                      </div>
                      <div>
                        <dt>
                          <IconCoin size={14} />
                          <span>{uiT('Customer charge')}</span>
                        </dt>
                        <dd>{selectedRun.customerChargeText ? `${selectedRun.customerChargeText}` : uiT('Unknown')}</dd>
                      </div>
                    </dl>
                  )}

                  {selectedRun.settingsSummary && selectedRun.settingsSummary.length > 0 && (
                    <div className="generations-run-section">
                      <h4>{uiT('Generation parameters')}</h4>
                      <dl className="generations-run-metrics">
                        {selectedRun.settingsSummary.map(item => (
                          <div key={item.label}>
                            <dt><span>{item.label}</span></dt>
                            <dd>{item.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}

                  {selectedRun.customDetails && (
                    <div className="generations-run-custom-details">
                      {selectedRun.customDetails}
                    </div>
                  )}

                  <div className="generations-run-actions">
                    {selectedRun.turnAnchor && (
                      <Button type="button" variant="outline" size="sm" onClick={() => jumpToTurn(selectedRun.turnAnchor)}>
                        {uiT('Jump to message')}
                      </Button>
                    )}
                    {selectedRun.logsHref && (
                      <Button asChild variant="ghost" size="sm">
                        <Link to={selectedRun.logsHref}>
                          <span>{uiT('Open in Logs')}</span>
                          <IconExternalLink size={14} />
                        </Link>
                      </Button>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="deliverables" className="generations-context-body">
          {panel.deliverables.length === 0 ? (
            <Empty className="border-0 bg-transparent p-4">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconSparkles size={18} aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{uiT('No deliverables yet')}</EmptyTitle>
                <EmptyDescription>
                  {uiT('Code snippets, markdown documents, and generated videos from this conversation appear here.')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <section className="generations-deliverables-list" aria-label={uiT('Session deliverables')}>
              {[...panel.deliverables].reverse().map(item => (
                <article key={item.id} className="generations-deliverable-card">
                  <div className="generations-deliverable-header">
                    <div className="flex min-w-0 items-center gap-2">
                      {item.kind === 'code' ? (
                        <IconCode size={16} className="shrink-0 text-primary" />
                      ) : item.kind === 'video' ? (
                        <IconVideo size={16} className="shrink-0 text-primary" />
                      ) : (
                        <IconFileText size={16} className="shrink-0 text-primary" />
                      )}
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-medium">{item.title}</h3>
                        <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                      </div>
                    </div>
                    {item.language && (
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {item.language}
                      </Badge>
                    )}
                  </div>
                  {item.preview && (
                    <pre className="generations-deliverable-preview">
                      <code>{item.preview}</code>
                    </pre>
                  )}
                  <div className="generations-deliverable-actions">
                    {item.content && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void copyDeliverable(item.id, item.content!)}
                      >
                        <IconCopy size={14} />
                        <span>{copiedId === item.id ? uiT('Copied') : uiT('Copy')}</span>
                      </Button>
                    )}
                    {item.content && item.filename && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadDeliverable(item.filename!, item.content!)}
                      >
                        <IconDownload size={14} />
                        <span>{uiT('Download')}</span>
                      </Button>
                    )}
                    {item.runId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onSelectRun(item.runId!);
                          onTabChange('runs');
                        }}
                      >
                        {uiT('Generation details')}
                      </Button>
                    )}
                    {item.turnAnchor && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => jumpToTurn(item.turnAnchor)}
                      >
                        {uiT('Jump to message')}
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </section>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  );
}
export { OPEN_CONTEXT_EVENT, type OpenContextEventDetail };
