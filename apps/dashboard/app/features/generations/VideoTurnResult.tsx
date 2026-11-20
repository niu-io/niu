import { pollVisibleVideoJob } from '../video/visible-job-poll';
import { authenticatedFetch as fetch } from '@/lib/authenticated-fetch';
import { useLocale as useUILocale, translateUI } from '@/shell/ui-locale';
import { formatDurationMs } from '@/lib/duration';
import { isQueryFresh, peekQuery } from '@/lib/query-cache';
import { catalogTitle } from '@/lib/providers';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { IconInfoCircle as InfoCircle, IconLoader2 as Loader, IconRefresh as RefreshCw } from '@tabler/icons-react';
import type { VideoJobBilling, VideoTransportTimings } from '@niu-io/sdk';
import type { GenerationsTurn } from '@niu-io/sdk/generations-sessions';
import { NiuAdminClient, type GenerationTask, type TenantScope } from '@niu-io/sdk/admin';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FormSectionSkeleton, ListRowsSkeleton } from '@/components/PageSkeletons';
import { workspacePathSegment } from '@/shell/workspace-route';
import type { DashboardContext } from '@/shell/dashboard-context';
import VideoResult from '../video/VideoResult';
import VideoBilling from '../video/VideoBilling';
import VideoLifecycle from '../video/VideoLifecycle';
import { videoStatusLabel } from '../video/status';
import { openGenerationsAssetsPanel } from './GenerationsLayout';
import { openGenerationsContextRun, useRegisterVideoTurnRun, type GenerationContextRun, type GenerationContextRunState } from './GenerationsContextPanel';
import {
  VIDEO_DIAGNOSTICS_FRESH_MS,
  VIDEO_FRESH_MS,
  invalidateVideoTask,
  isTerminalVideoState,
  primeVideoDiagnostics,
  primeVideoTask,
  videoDiagnosticsCacheKey,
  videoTaskCacheKey,
  type VideoTaskDiagnostics,
} from './video-cache';
import './generations.css';
import '../video/video.css';

function message(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}
function savedTask(response: unknown, requested: string, sessionId: string, turnId: string): GenerationTask {
  const task = response && typeof response === 'object' && 'data' in response ? response.data as GenerationTask : null;
  if (!task || task.kind !== 'video' || (task.id !== requested && task.reference !== requested)
    || !task.model?.trim() || !Object.hasOwn(videoStatusLabel, task.state)
    || (task.session_id && task.session_id !== sessionId) || (task.turn_id && task.turn_id !== turnId)) {
    throw new Error('The server returned an unexpected saved video.');
  }
  return task;
}

/**
 * One saved Video turn. Selecting a session renders every result in place; the
 * caller supplies a current workspace key only for explicit recovery reads.
 */
export default function VideoTurnResult({context, sessionId, turn, turnIndex = 1, turnAnchor, keyId, refreshKey = 0}: {
  context: DashboardContext; sessionId: string; turn: GenerationsTurn; turnIndex?: number; turnAnchor?: string; keyId?: string; refreshKey?: number;
}) {
  const { t: uiT } = useUILocale();
  const navigate = useNavigate();
  const { token, workspace, session } = context;
  const canWrite = Boolean(session?.permissions.write);
  const taskReference = turn.task?.reference ?? turn.task_id ?? '';
  const taskCacheKey = workspace && taskReference ? videoTaskCacheKey(workspace.id, taskReference) : '';
  const initialTask = token && taskCacheKey ? peekQuery<GenerationTask>(token, taskCacheKey, {persist: true}) ?? null : null;
  const initialDiagnostics = token && workspace && initialTask
    ? peekQuery<VideoTaskDiagnostics>(token, videoDiagnosticsCacheKey(workspace.id, initialTask.id), {persist: true})
    : undefined;
  const [task, setTask] = useState<GenerationTask | null>(initialTask);
  const [loading, setLoading] = useState(() => Boolean(taskReference && !initialTask));
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [billing, setBilling] = useState<VideoJobBilling | null>(() => initialDiagnostics?.billing ?? null);
  const [timings, setTimings] = useState<VideoTransportTimings | null>(() => initialDiagnostics?.timings ?? null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState('');
  const [intentBusy, setIntentBusy] = useState(false);
  const lock = useRef(false);
  const lastTaskFetchRef = useRef({ identity: '', refreshKey: 0, revision: 0 });
  const activeDiagTaskRef = useRef<string | null>(initialTask?.id ?? null);
  const lastDiagFetchRef = useRef({ taskId: '', refreshKey: 0, revision: 0 });
  const lastDiagStateRef = useRef({ taskId: initialTask?.id ?? '', state: initialTask?.state ?? '' });
  const client = useMemo(() => token ? new NiuAdminClient({ fetch,adminToken: token, baseURL: new URL('/api/v1', window.location.origin).href}) : null, [token]);
  const orgId = workspace?.organization_id ?? '';
  const workspaceId = workspace?.id ?? '';
  const scope = useMemo<TenantScope | null>(() => orgId && workspaceId ? {organizationId: orgId, projectId: workspaceId} : null, [orgId, workspaceId]);
  const workspacePath = workspace ? `/workspaces/${workspacePathSegment(workspace, context.workspaces ?? [workspace])}` : '';
  const intent = turn.intent;

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    if (!client || !scope || !workspaceId || !taskReference) {
      setTask(null);
      setLoading(false);
      return () => controller.abort();
    }
    const taskIdentity = `${scope.organizationId}:${scope.projectId}:${sessionId}:${turn.id}:${taskReference}`;
    const forceTask = lastTaskFetchRef.current.identity === taskIdentity
      && (lastTaskFetchRef.current.refreshKey !== refreshKey || lastTaskFetchRef.current.revision !== revision);
    lastTaskFetchRef.current = { identity: taskIdentity, refreshKey, revision };
    const cached = token && taskCacheKey ? peekQuery<GenerationTask>(token, taskCacheKey, {persist: true}) : undefined;
    if (cached) {
      setTask(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    if (!forceTask && cached && isTerminalVideoState(cached.state) && token && isQueryFresh(token, taskCacheKey, VIDEO_FRESH_MS)) {
      return () => controller.abort();
    }
    void client.generations(scope).tasks.retrieve(taskReference, {signal: controller.signal})
      .then(response => savedTask(response, taskReference, sessionId, turn.id))
      .then(value => {
        if (!controller.signal.aborted) {
          primeVideoTask(token, workspaceId, value);
          setTask(value);
        }
      })
      .catch(() => { if (!controller.signal.aborted) setError('This saved video could not be loaded. Check workspace access and reload.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [client, scope, workspaceId, taskReference, sessionId, turn.id, refreshKey, revision, token, taskCacheKey]);

  const activeTaskId = task?.id ?? '';
  const activeTaskState = task?.state ?? '';
  const activeTaskRef = task?.reference ?? '';

  useEffect(() => {
    const controller = new AbortController();
    setDetailError('');
    if (!client || !scope || !workspaceId || !activeTaskId) {
      activeDiagTaskRef.current = null;
      setBilling(null);
      setTimings(null);
      setDiagnosticsLoading(false);
      return () => controller.abort();
    }
    const diagKey = videoDiagnosticsCacheKey(workspaceId, activeTaskId);
    const cachedDiag = token ? peekQuery<VideoTaskDiagnostics>(token, diagKey, {persist: true}) : undefined;
    const sameTask = activeDiagTaskRef.current === activeTaskId;
    const forceDiag = sameTask && (lastDiagFetchRef.current.refreshKey !== refreshKey || lastDiagFetchRef.current.revision !== revision);
    const becameTerminal = lastDiagStateRef.current.taskId === activeTaskId
      && lastDiagStateRef.current.state !== activeTaskState
      && isTerminalVideoState(activeTaskState);
    lastDiagFetchRef.current = { taskId: activeTaskId, refreshKey, revision };
    lastDiagStateRef.current = { taskId: activeTaskId, state: activeTaskState };
    activeDiagTaskRef.current = activeTaskId;
    if (cachedDiag) {
      setBilling(cachedDiag.billing);
      setTimings(cachedDiag.timings);
    } else if (!sameTask) {
      setBilling(null);
      setTimings(null);
    }
    if (!forceDiag && !becameTerminal && cachedDiag && isTerminalVideoState(activeTaskState) && token && isQueryFresh(token, diagKey, VIDEO_DIAGNOSTICS_FRESH_MS)) {
      setDiagnosticsLoading(false);
      return () => controller.abort();
    }
    setDiagnosticsLoading(!cachedDiag);
    void client.generations(scope).tasks.diagnostics(activeTaskId, {signal: controller.signal})
      .then(value => {
        if (controller.signal.aborted) return;
        primeVideoDiagnostics(token, workspaceId, activeTaskId, { billing: value.billing, timings: value.timings });
        setBilling(value.billing);
        setTimings(value.timings);
      })
      .catch(() => { if (!controller.signal.aborted) setDetailError('Video details could not be loaded. Reload status to try again.'); })
      .finally(() => { if (!controller.signal.aborted) setDiagnosticsLoading(false); });
    return () => controller.abort();
  }, [client, scope, workspaceId, activeTaskId, activeTaskState, refreshKey, revision, token]);

  async function checkProvider(id: string, signal?: AbortSignal) {
    if (!keyId) throw new Error('An active API key is required to check the Provider.');
    const response = await fetch(`/v1/video/jobs/${encodeURIComponent(id)}/refresh`, {
      method: 'POST',
      headers: {authorization: `Bearer ${token}`, 'x-niu-key-id': keyId, 'content-type': 'application/json'},
      body: '{}',
      signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error?.message ?? 'The Provider check could not be completed.');
  }
  const checkProviderRef = useRef(checkProvider);
  checkProviderRef.current = checkProvider;

  // Only reconcile an existing saved job. Polling never creates or retries it.
  useEffect(() => {
    if (!client || !scope || !workspaceId || !activeTaskId || !['queued', 'running', 'unknown'].includes(activeTaskState)) return;
    return pollVisibleVideoJob(async signal => {
      if (lock.current) return;
      try {
        if (canWrite && keyId) await checkProviderRef.current(activeTaskId, signal);
        if (signal.aborted) return;
        const queryRef = activeTaskRef || activeTaskId;
        const value = savedTask(await client.generations(scope).tasks.retrieve(queryRef, {signal: signal}), queryRef, sessionId, turn.id);
        if (!signal.aborted) {
          primeVideoTask(token, workspaceId, value);
          setTask(value);
          setDetailError('');
          if (!['queued', 'running', 'unknown'].includes(value.state)) setRevision(item => item + 1);
        }
      } catch (caught) {
        if (!signal.aborted) setDetailError(message(caught));
      }
    });
  }, [client, scope, workspaceId, activeTaskId, activeTaskState, activeTaskRef, keyId, canWrite, sessionId, turn.id, token]);

  async function reloadStatus() {
    if (lock.current || !client || !scope || !task) return;
    setBusy('reload');
    try { setRevision(value => value + 1); }
    finally { setBusy(''); }
  }

  async function refreshProvider() {
    if (!client || !scope || !task || lock.current || !canWrite || !keyId) return;
    lock.current = true;setBusy('refresh');setDetailError('');
    try {
      await checkProvider(task.id);
      setRevision(value => value + 1);
    } catch (caught) {
      setDetailError(message(caught));
    } finally {
      lock.current = false;setBusy('');
    }
  }

  async function continueSavedRequest() {
    if (!client || !scope || !intent || intentBusy) return;
    setIntentBusy(true);setDetailError('');
    try {
      const reference = intent.reference ?? (await client.getVideoIntent(scope, intent.id)).data.reference;
      if (!reference) throw new Error('The saved request has no readable reference. Reload the session.');
      navigate(`/generations?intent=${encodeURIComponent(reference)}&compose=1`);
    } catch (caught) {
      setDetailError(message(caught));
    } finally {
      setIntentBusy(false);
    }
  }

  const model = task?.model ?? turn.task?.model ?? intent?.model;
  const status = task ? videoStatusLabel[task.state] ?? videoStatusLabel.unknown : '';
  const epoch = timings?.data[0]?.started_unix_ms ?? 0;
  const total = Math.max(1, ...(timings?.data.map(span => span.started_unix_ms - epoch + span.elapsed_ms) ?? []));
  const showContinue = Boolean(intent && intent.content_state === 'retained' && intent.submission_state !== 'dispatched' && !taskReference);
  const editable = Boolean(intent && intent.content_state === 'retained' && !showContinue);
  const statusMessage = !intent ? '' : intent.submission_state === 'not_dispatched'
    ? uiT("This request was not dispatched. Resolve the admission error before starting a new generation.")
    : intent.submission_state === 'saved'
      ? uiT("This saved request has not been submitted.")
      : uiT("No saved result is linked to this request.");

  const readableRun = (task?.reference ?? turn.task?.reference ?? '');
  const registeredRun: GenerationContextRun = {
    id: turn.id,
    reference: readableRun || turn.intent?.reference || undefined,
    turnIndex,
    turnAnchor,
    prompt: turn.instruction?.prompt ?? uiT("Saved video request"),
    model: model ?? 'video',
    modelTitle: model ? catalogTitle({ id: model }) : uiT("Video"),
    kind: 'video',
    state: (task?.state ?? 'saved') as GenerationContextRunState,
    statusLabel: task ? translateUI(status) : intent?.submission_state === 'not_dispatched' ? uiT("Not dispatched") : uiT("Saved request"),
    detailsKey: `${diagnosticsLoading}:${Boolean(billing)}:${timings?.data.length ?? -1}`,
    customDetails: task ? <div className="video-details">
      {timings?.lifecycle && <VideoLifecycle timing={timings.lifecycle} />}
      {timings?.data.length ? <div className="video-timings"><h3>{uiT("Transport time")}</h3><p className="video-muted">{uiT("Submission, status queries and result transfers; Provider queue and generation time are not measured here.")}</p>{timings.data.map((span, index) => <div className="video-span" key={index}><span>{span.phase === 'submission' ? uiT("Submission") : span.phase === 'query' ? uiT("Status query") : span.phase === 'result' ? uiT("Result transfer") : uiT("Other transport")}</span><div className="video-span-track"><i style={{marginLeft: `${(span.started_unix_ms - epoch) / total * 100}%`, width: `${Math.max(.5, span.elapsed_ms / total * 100)}%`}} /></div><small>{formatDurationMs(span.elapsed_ms)}</small></div>)}{timings.has_more && <small>{uiT("Showing the latest recorded requests.")}</small>}</div> : null}
      <h3>{uiT("Billing")}</h3>{billing ? <VideoBilling billing={billing} /> : diagnosticsLoading ? <ListRowsSkeleton rows={1} label={uiT("Loading billing…")} /> : <p>{uiT("Billing is unavailable.")}</p>}
      <Button asChild variant="link"><Link to={`${workspacePath}/executions?modelAlias=${encodeURIComponent(task.model)}#gateway-attempt-${encodeURIComponent(task.reference ?? task.id)}`}>{uiT("View in Logs")}</Link></Button>
    </div> : null,
  };
  useRegisterVideoTurnRun(sessionId, registeredRun);

  return <article className="video-response" aria-label={uiT("Video result")}>
    <div className="video-result-heading">
      <span className="video-response-model">{model ? catalogTitle({ id: model }) : uiT("Video")}</span>
      {/^run-[1-9][0-9]{0,18}$/.test(readableRun) && <Button type="button" variant="ghost" className="playground-status-trigger h-auto p-0" onClick={() => openGenerationsContextRun(turn.id)}><Badge variant="outline" className="font-mono text-xs">{readableRun}</Badge></Button>}
      {task ? <Button type="button" variant="ghost" className="playground-status-trigger h-auto p-0" onClick={() => openGenerationsContextRun(turn.id)}><Badge variant="secondary">{translateUI(status)}</Badge></Button>
        : intent ? <Badge variant="secondary">{intent.submission_state === 'not_dispatched' ? uiT("Not dispatched") : intent.submission_state === 'saved' ? uiT("Saved request") : uiT("Status unavailable")}</Badge>
          : null}
    </div>
    {error && <p role="alert" className="video-error">{uiT(error)}<Button variant="ghost" onClick={() => void reloadStatus()} disabled={Boolean(busy)}>{uiT("Reload status")}</Button></p>}
    {detailError && <p role="alert" className="video-error">{uiT(detailError)}</p>}
    {loading && !task && <FormSectionSkeleton fields={2} label={uiT("Loading saved video…")} />}
    {!loading && !task && !error && (showContinue
      ? <div className="video-artifact-placeholder"><h3>{statusMessage}</h3><p>{uiT("Continue the saved request in the Video composer.")}</p>
        {intent?.reference
          ? <Button asChild variant="outline"><Link to={`/generations?intent=${encodeURIComponent(intent.reference)}&compose=1`}>{uiT("Continue saved request")}</Link></Button>
          : <Button variant="outline" onClick={() => void continueSavedRequest()} disabled={intentBusy}>{intentBusy ? uiT("Opening…") : uiT("Continue saved request")}</Button>}
      </div>
      : <p className="video-muted">{statusMessage || uiT("No request or task is linked to this instruction.")}</p>)}
    {task?.state === 'succeeded' && client && scope && <VideoResult key={`${scope.projectId}/${task.id}`} client={client} scope={scope} task={task.id} keyId={canWrite ? keyId : undefined} canWrite={canWrite} libraryHref={`${workspacePath}/assets`} onOpenLibrary={openGenerationsAssetsPanel} initialArtifacts={task.artifacts} cacheScope={token} onArtifactsDeleted={() => { if (workspace) invalidateVideoTask(token, workspace.id, task.id, task.reference); setRevision(value => value + 1); }} />}
    {task && task.state !== 'succeeded' && <div className="video-artifact-placeholder">
      {(task.state === 'queued' || task.state === 'running') && <Loader className="animate-spin" />}
      <h3 role="status">{task.state === 'queued' ? uiT("Waiting to generate") : task.state === 'running' ? uiT("Generating your video…") : task.state === 'failed' ? uiT("Video generation failed") : uiT("Waiting for a confirmed status")}</h3>
      <p>{task.state === 'queued' ? uiT("Your request is queued. This conversation updates automatically.") : task.state === 'running' ? uiT("Your video will appear here when it is ready.") : task.state === 'failed' ? uiT("Open video details to inspect the recorded failure.") : uiT("The original task is being checked. Do not submit it again.")}</p>
    </div>}
    {task && <div className="video-actions">
      <Button variant="outline" onClick={() => void reloadStatus()} disabled={Boolean(busy) || loading}>{uiT("Reload status")}</Button>
      {canWrite && keyId && <Button variant="ghost" onClick={() => void refreshProvider()} disabled={Boolean(busy) || task.state === 'submission_unknown'}><RefreshCw size={14} />{busy === 'refresh' ? uiT("Checking…") : uiT("Check Provider")}</Button>}
      {editable && (intent?.reference
        ? <Button asChild variant="ghost"><Link to={`/generations?intent=${encodeURIComponent(intent.reference)}&compose=1`}>{uiT("Edit request")}</Link></Button>
        : <Button variant="ghost" onClick={() => void continueSavedRequest()} disabled={intentBusy}>{intentBusy ? uiT("Opening…") : uiT("Edit request")}</Button>)}
    </div>}
    {task && <Button type="button" variant="ghost" size="icon" className="video-details-trigger" aria-label={uiT("Video details")} onClick={() => openGenerationsContextRun(turn.id)}><InfoCircle size={18} /></Button>}
  </article>;
}
