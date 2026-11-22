import { authenticatedFetch as fetch } from '@/lib/authenticated-fetch';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { IconArchive as Archive, IconArrowUp as ArrowUp, IconChevronDown as ChevronDown, IconKey as KeyIcon, IconLock as LockIcon, IconAdjustmentsHorizontal as Settings } from '@tabler/icons-react';
import { NiuAPIError, type VideoModel, type VideoModelList } from '@niu-io/sdk';
import { NiuAdminClient, type VideoIntentRequest, type VideoComposerDraftPayload } from '@niu-io/sdk/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { workspaceKeyPath } from '../keys/api';
import { useVideoDraft } from '../video/useVideoDraft';
import { useDraftNavigation } from '../playground/useDraftNavigation';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { translateUI, useLocale as useUILocale } from '@/shell/ui-locale';
import ProviderLogo from '@/components/ProviderLogo';
import { catalogTitle, modelIdentity } from '@/lib/providers';
import { invalidateQueries, isQueryFresh, peekQuery, primeQuery } from '@/lib/query-cache';
import { workspacePathSegment } from '@/shell/workspace-route';
import type { DashboardContext } from '@/shell/dashboard-context';
import type { useGenerationKeys } from './useGenerationKeys';
import { VIDEO_MODELS_FRESH_MS, videoModelsCacheKey } from './video-cache';
import { controlLabels, initialControls, needsUnquotedConfirmation, videoRequest, validateSavedVideoReferences, type ControlValues } from '../video/request';
import { matchesVideoIntentRequest, prepareVideoSessionIntent, videoDraftSubmissionIds } from '../video/session-intent';
import { VideoIntent } from '../video/intent';
import type { VideoGenerationsSession } from '@niu-io/sdk/generations-sessions';
import '../video/video.css';

function message(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}
function titleFor(promptText: string, modelName: string) {
  const line = promptText.split('\n').map(item => item.trim()).find(Boolean) ?? '';
  let title = line || (modelName.trim() ? `${translateUI("Video")} · ${modelName.trim()}` : translateUI("Video request"));
  const bytes = new TextEncoder();
  while (bytes.encode(title).length > 200) title = title.slice(0, -1);
  return title.trim() || translateUI("Video request");
}
function pickDefaultVideoModel(list: VideoModel[]): VideoModel | undefined {
  return list.find(item => item.id === 'fastrouter/seedance-2.0-mini') ?? list[0];
}

/** The saved result stays on this page. The next video is described here. */
export default function VideoSessionComposer({context, session, onSubmitted, available, keyId, onRestoreKey, keyEditRevision, onKeySelectionReadyChange}: {
  context: DashboardContext; session: VideoGenerationsSession; onSubmitted: () => void;
  available: ReturnType<typeof useGenerationKeys>; keyId: string; onRestoreKey: (key: string) => void; keyEditRevision: number; onKeySelectionReadyChange: (ready:boolean) => void;
}) {
  const { t: uiT } = useUILocale();
  const {token, workspace} = context;
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const pendingReference = search.get('pending');
  const updatePendingReference = (reference: string | null) => setSearch(current => {
    const next = new URLSearchParams(current);
    if (reference) next.set('pending', reference); else next.delete('pending');
    return next;
  }, {replace: true});
  const canWrite = Boolean(context.session?.permissions.write);
  const workspacePath = workspace ? `/workspaces/${workspacePathSegment(workspace, context.workspaces ?? [workspace])}` : '/workspaces/default';
  const keys = available.keys.filter(key => key.workspace.id === workspace?.id);
  const activeKeyId = keyId;
  const cover = session.archived ? 'archived' : !canWrite ? 'readonly' : available.error && !keys.length ? 'keys' : !available.loading && !keys.some(key=>key.id===activeKeyId) ? 'nokey' : null;
  const initialModels = token && activeKeyId && !cover
    ? peekQuery<VideoModel[]>(token, videoModelsCacheKey(activeKeyId), {persist: true})
    : undefined;
  const initialDefault = initialModels ? pickDefaultVideoModel(initialModels) : undefined;
  const [models, setModels] = useState<VideoModel[]>(() => initialModels ?? []);
  const [modelId, setModelId] = useState(() => initialDefault?.id ?? '');
  const [controls, setControls] = useState<ControlValues>(() => (initialDefault ? initialControls(initialDefault) : {}));
  const [prompt, setPrompt] = useState('');
  const promptRef=useRef<HTMLTextAreaElement>(null);
  const [edited,setEdited]=useState(false);
  const [restored,setRestored]=useState(false);
  const [references,setReferences]=useState<VideoComposerDraftPayload['references']>([]);
  const restoreContext=useRef<{key:string;model:string}|null>(null);
  const initialKeyEdit=useRef(keyEditRevision);
  useEffect(()=>{if(keyEditRevision!==initialKeyEdit.current){initialKeyEdit.current=keyEditRevision;restoreContext.current=null;setEdited(true);}},[keyEditRevision]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unquotedConfirmation, setUnquotedConfirmation] = useState<string | null>(null);
  const submitLock = useRef(false);
  const mountedRef = useRef(true);
  const scopeIdentity = JSON.stringify([token, workspace?.id, context.session?.operator?.id, session.id]);
  const scopeRef = useRef(scopeIdentity);
  scopeRef.current = scopeIdentity;
  const generateControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generateControllerRef.current?.abort();
      generateControllerRef.current = null;
    };
  }, []);
  useEffect(() => () => {
    generateControllerRef.current?.abort();
    generateControllerRef.current = null;
  }, [scopeIdentity]);
  const generateRef = useRef<HTMLButtonElement>(null);
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;
  const client = useMemo(() => token ? new NiuAdminClient({ fetch,adminToken: token, baseURL: new URL('/api/v1', window.location.origin).href}) : null, [token]);
  const model = models.find(item => item.id === modelId);
  const payload:VideoComposerDraftPayload={keyId:activeKeyId||null,sessionId:session.id,model:modelId||null,prompt,controls:Object.fromEntries(Object.entries(controls).filter(([name])=>['duration','seed','frames_per_second','resolution','ratio','omni_reference_task_type','watermark','camera_fixed','return_last_frame'].includes(name))) as VideoComposerDraftPayload['controls'],references};
  const draft=useVideoDraft({client,scope:workspace?{organizationId:workspace.organization_id,projectId:workspace.id}:null,
    identity:JSON.stringify([token,workspace?.id,context.session?.operator?.id,session.id]),enabled:Boolean(token&&workspace&&!session.archived),canWrite,
    edited,paused:loading||busy||(!edited&&!restored),value:payload,restore:saved=>{
      // A different conversation must not consume or overwrite the retained draft.
      if(!saved || saved.sessionId!==session.id || edited || keyEditRevision!==initialKeyEdit.current)return;
      setRestored(true);setPrompt(saved.prompt);setReferences(saved.references);
      const restoredModel=saved.model??'';
      restoreContext.current={key:saved.keyId??'',model:restoredModel};
      if(saved.keyId)onRestoreKey(saved.keyId);
      setModelId(restoredModel);modelIdRef.current=restoredModel;
      setControls(Object.fromEntries(Object.entries(saved.controls).map(([name,value])=>[name,typeof value==='number'?String(value):value])) as ControlValues);
    }});
  const unquotedOwnerFunded = needsUnquotedConfirmation(model, controls);
  const confirmationIdentity = JSON.stringify([token, workspace?.id, context.session?.operator?.id, session.id, keyEditRevision, canWrite, payload, model]);
  const latestConfirmationIdentity = useRef(confirmationIdentity);
  latestConfirmationIdentity.current = confirmationIdentity;
  const confirmationMatches = unquotedOwnerFunded && unquotedConfirmation === confirmationIdentity;
  const restoringDraft=Boolean(token&&workspace&&!session.archived)&&!draft.ready&&!draft.error;
  useEffect(()=>{onKeySelectionReadyChange(!restoringDraft&&!busy&&!loading);},[restoringDraft,busy,loading,onKeySelectionReadyChange]);
  const navigation = useDraftNavigation({
    hasUnsavedChanges: () => submitLock.current || (edited && (!draft.ready || draft.dirty)),
    flush: async () => (submitLock.current ? false : Boolean(await draft.flush())),
  });
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    if (!token || !activeKeyId || cover) {
      setModels([]);
      setLoading(false);
      return;
    }
    const cacheKey = videoModelsCacheKey(activeKeyId);
    const cached = peekQuery<VideoModel[]>(token, cacheKey, {persist: true});
    if (cached) {
      setModels(cached);
      if (restoreContext.current?.key!==activeKeyId && !cached.some(item => item.id === modelIdRef.current)) {
        const next = pickDefaultVideoModel(cached);
        setModelId(next?.id ?? '');
        setControls(next ? initialControls(next) : {});
      }
      setLoading(false);
      if (isQueryFresh(token, cacheKey, VIDEO_MODELS_FRESH_MS)) {
        return () => controller.abort();
      }
    } else {
      setModels([]);
      setLoading(true);
    }
    void fetch('/v1/video/models', {headers: {authorization: `Bearer ${token}`, 'x-niu-key-id': activeKeyId}, signal: controller.signal})
      .then(async response => {
        const payload = await response.json().catch(() => null) as VideoModelList | null;
        if (!response.ok) throw new Error('Video models could not be loaded.');
        return payload;
      })
      .then(payload => {
        if (controller.signal.aborted || !payload) return;
        primeQuery(token, cacheKey, payload.data, {persist: true});
        setModels(payload.data);
        const keepCurrent = restoreContext.current?.key===activeKeyId || payload.data.some(item => item.id === modelIdRef.current);
        if (!keepCurrent) {
          const next = pickDefaultVideoModel(payload.data);
          setModelId(next?.id ?? '');
          setControls(next ? initialControls(next) : {});
        }
      })
      .catch(caught => { if (!controller.signal.aborted && !cached) setError(message(caught)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, activeKeyId, cover]);
  async function generate(confirmedIdentity?: string) {
    if (!client || !workspace || !model || !activeKeyId || !canWrite || busy || submitLock.current || pendingReference || loading || restoringDraft || cover) return;
    setError('');
    if (model.requires_image && !references.length) { setError('This model requires a reference image.'); return; }
    let request: VideoIntentRequest;
    try {
      if(references.length || model.workspace_asset)validateSavedVideoReferences(model,references);
      request = videoRequest(references.length?{...model,requires_image:false}:model, prompt, controls) as VideoIntentRequest;
      request.content.push(...references);
    }
    catch (caught) { setError(message(caught)); return; }
    if (unquotedOwnerFunded && confirmedIdentity !== confirmationIdentity) {
      setUnquotedConfirmation(confirmationIdentity);
      return;
    }
    setUnquotedConfirmation(null);
    submitLock.current = true;
    setBusy(true);
    const runScope = scopeRef.current;
    const controller = new AbortController();
    generateControllerRef.current = controller;
    const isStale = () => !mountedRef.current || controller.signal.aborted || scopeRef.current !== runScope;
    let preparingSavedDraft = false;
    let preparationAttempted = false;
    let preparedReference = '';
    try {
      const ticket=await draft.flush();
      if (isStale()) return;
      if (latestConfirmationIdentity.current !== confirmationIdentity) throw new Error("The request or access changed. Close this dialog and review the current request.");
      if (!unquotedOwnerFunded) {
        const estimate = await fetch('/v1/video/estimate', {
          method: 'POST', headers: {authorization: `Bearer ${token}`, 'x-niu-key-id': activeKeyId, 'content-type': 'application/json'},
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        if (isStale()) return;
        const estimated = await estimate.json().catch(() => null);
        if (isStale()) return;
        if (!estimate.ok) throw new Error(estimated?.error?.message ?? 'The video could not be estimated.');
      }
      const {intentId, turnId} = ticket
        ? await videoDraftSubmissionIds(ticket.identity, ticket.revision)
        : {intentId: crypto.randomUUID(), turnId: crypto.randomUUID()};
      if (isStale()) return;
      const intent = new VideoIntent(client, {organizationId: workspace.organization_id, projectId: workspace.id}, intentId);
      preparingSavedDraft = Boolean(ticket);
      preparationAttempted = true;
      const prepared = await prepareVideoSessionIntent(client, {organizationId: workspace.organization_id, projectId: workspace.id}, {
        sessionId: session.id, turnId, intentId, keyId: activeKeyId, title: titleFor(prompt, model.id), request,
      });
      if (isStale()) return;
      if (!prepared.intent.reference) throw new Error('The saved video request identity does not match this link.');
      preparedReference = prepared.intent.reference;
      updatePendingReference(preparedReference);
      // The input now belongs to a durable, actor-private saved request. Retire
      // only its matching draft before dispatch, so a lost response or reload
      // cannot present the same input as a fresh generation.
      const cleared = ticket ? await draft.clearMatching(ticket) : true;
      if (isStale()) return;
      if (ticket && !cleared) {
        throw new Error('The request was saved, but its unfinished draft remains. Open the saved request before submitting.');
      }
      setPrompt('');setReferences([]);setEdited(false);setRestored(false);
      draft.reload();
      await intent.restore();
      if (isStale()) return;
      await intent.submit();
      if (isStale()) return;
      updatePendingReference(null);
      onSubmitted();
    } catch (caught) {
      if (isStale()) return;
      if (caught instanceof NiuAPIError && caught.status === 401) {
        invalidateQueries(workspaceKeyPath(workspace.id));
        available.reload();
      }
      setError(preparingSavedDraft && !preparedReference
        ? 'Could not confirm the saved request. Your draft is retained. Retrying this unchanged draft uses the same request.'
        : message(caught));
      if (preparationAttempted) onSubmitted();
    } finally {
      if (generateControllerRef.current === controller) {
        generateControllerRef.current = null;
      }
      submitLock.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }
  async function recoverSubmission() {
    if (!client || !workspace || !pendingReference || busy || submitLock.current || loading || restoringDraft || !draft.ready) return;
    setBusy(true);setError('');
    try {
      const {data: intent} = await client.getVideoIntent({organizationId: workspace.organization_id, projectId: workspace.id}, pendingReference);
      if (intent.session_binding?.session_id !== session.id) throw new Error('The saved video request identity does not match this link.');
      if (intent.job) {
        if (prompt.trim() && model && intent.request && activeKeyId === intent.key_id) {
          const currentRequest = videoRequest(references.length ? {...model, requires_image: false} : model, prompt, controls) as VideoIntentRequest;
          currentRequest.content.push(...references);
          if (matchesVideoIntentRequest(currentRequest, intent.request)) {
            const ticket = await draft.flush();
            if (!ticket || !await draft.clearMatching(ticket)) throw new Error('Video submission was confirmed, but its draft could not be cleared. The saved draft may remain; do not resubmit it.');
            setPrompt('');setReferences([]);setEdited(false);setRestored(false);draft.reload();
          }
        }
        // Reuse the saved-request resolver to focus the original result, rather
        // than leave the user at an unrelated earlier turn in this session.
        navigate(`/generations?intent=${encodeURIComponent(pendingReference)}&workspace=${encodeURIComponent(workspacePathSegment(workspace,context.workspaces??[workspace]))}`, {replace: true});
        onSubmitted();
      } else {
        setError('Restore the original submission status before continuing.');
      }
    } catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  }
  return <><Dialog open={unquotedConfirmation !== null} onOpenChange={open => { if (!open) setUnquotedConfirmation(null); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto" onCloseAutoFocus={event => { event.preventDefault(); generateRef.current?.focus(); }}>
      <DialogHeader><DialogTitle>{uiT("Generate video with your Provider account")}</DialogTitle><DialogDescription>{uiT("No output estimate is available for this video configuration. Your Provider may charge your account. This sends the request once; an uncertain outcome must be checked before another submission.")}</DialogDescription></DialogHeader>
      <p className="break-words text-sm">{model && catalogTitle({id: model.id})}</p>
      {!confirmationMatches && <p role="alert" className="text-sm text-destructive">{uiT("The request or access changed. Close this dialog and review the current request.")}</p>}
      <DialogFooter><Button variant="outline" onClick={() => setUnquotedConfirmation(null)}>{uiT("Cancel")}</Button><Button disabled={!confirmationMatches || !canWrite || busy || loading || restoringDraft || Boolean(cover)} onClick={() => { if (confirmationMatches && unquotedConfirmation) void generate(unquotedConfirmation); }}>{uiT("Generate video")}</Button></DialogFooter>
    </DialogContent>
  </Dialog><Dialog open={navigation.failed} onOpenChange={open=>{if(!open)navigation.stay();}}><DialogContent className="max-h-[90dvh] overflow-y-auto" onCloseAutoFocus={event=>{event.preventDefault();promptRef.current?.focus();}}><DialogHeader><DialogTitle>{uiT("Draft not saved")}</DialogTitle><DialogDescription>{uiT("Your latest changes are still here. Stay to review and save them, or leave without saving these changes.")}</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={navigation.leave}>{uiT("Leave without saving")}</Button><Button variant="outline" onClick={navigation.stay}>{uiT("Stay here")}</Button></DialogFooter></DialogContent></Dialog><form className="playground-composer" onSubmit={event => { event.preventDefault(); void generate(); }}>
    <div className={`playground-composer-surface${cover ? ' is-blocked' : ''}`}>
      <div className="video-composer-fields">
        {draft.error&&<div role="alert" className="video-error">{uiT(draft.error)}<Button type="button" variant="ghost" onClick={()=>{setEdited(false);draft.reload();}}>{uiT("Load saved draft")}</Button></div>}
        {pendingReference && <div role="status" className="video-muted"><p>{uiT("The outcome is unresolved. Do not resubmit this generation.")}</p><Button type="button" variant="outline" disabled={busy || loading || restoringDraft || !draft.ready} onClick={() => void recoverSubmission()}>{uiT("Check status")}</Button><Button asChild variant="link"><Link to={`/generations?intent=${encodeURIComponent(pendingReference)}&workspace=${encodeURIComponent(workspace ? workspacePathSegment(workspace,context.workspaces??[workspace]):'default')}`}>{uiT("Open saved request")}</Link></Button></div>}
        {edited&&(draft.saving||navigation.pending)&&<p role="status" className="video-muted">{uiT("Saving draft…")}</p>}
        <Label htmlFor="session-video-prompt" className="sr-only">{uiT("Prompt")}</Label>
        <Textarea ref={promptRef} id="session-video-prompt" placeholder={uiT("Describe your video…")} rows={2} value={prompt} onChange={event => {setEdited(true);setPrompt(event.target.value);}} disabled={busy || loading || restoringDraft || Boolean(cover)} />
        {references.length>0&&<p className="video-muted">{uiT("This draft includes saved reference materials. Open the full composer to review them.")}{" "}<Button asChild variant="link"><Link to={`/generations?new=video&workspace=${encodeURIComponent(workspace ? workspacePathSegment(workspace,context.workspaces??[workspace]):'default')}`}>{uiT("Open saved draft")}</Link></Button></p>}
        {unquotedOwnerFunded && !cover && <p role="status" className="video-muted">{uiT("Estimate unavailable. Your Provider may charge your account.")}</p>}
        {error && !cover && <p role="alert" className="video-error">{uiT(error)}</p>}
        <div className="playground-composer-actions"><div className="video-composer-options">
          {models.length > 0 ? <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" className="video-model-choice" aria-label={uiT("Video model")} disabled={busy || restoringDraft}>{modelId && <ProviderLogo provider={modelIdentity(context.models?.find(item => item.id === modelId) ?? { id: modelId })} size="small" />}<span className="truncate">{modelId ? catalogTitle({ id: modelId }) : uiT("Choose video model")}{modelId && catalogTitle({ id: modelId }) !== modelId ? <span className="sr-only"> {modelId}</span> : null}</span><ChevronDown size={14} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={modelId} onValueChange={id => { setEdited(true);restoreContext.current=null; const next = models.find(item => item.id === id); setModelId(id); setControls(next ? initialControls(next) : {}); }}>{models.map(item => { const label = catalogTitle({ id: item.id }); return <DropdownMenuRadioItem key={item.id} value={item.id}><ProviderLogo provider={modelIdentity(context.models?.find(candidate => candidate.id === item.id) ?? { id: item.id })} size="small" />{label}{label !== item.id ? <span className="sr-only"> {item.id}</span> : null}</DropdownMenuRadioItem>; })}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu> : <Button type="button" variant="ghost" className="video-model-choice" disabled>{uiT("Choose video model")}</Button>}
          {model&&<Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={uiT("Additional settings")} disabled={busy || restoringDraft}><Settings size={18}/></Button></PopoverTrigger><PopoverContent side="top" align="end" aria-label={uiT("Video settings")} className="video-settings-popover"><h2>{uiT("Video settings")}</h2><div className="video-controls">
            {Object.entries(model.controls).map(([name,rule])=><div key={name} className="video-field"><Label htmlFor={`session-video-${name}`}>{uiT(controlLabels[name]??name)}</Label>
              {rule.kind==='choice'?<DropdownMenu><DropdownMenuTrigger asChild><Button id={`session-video-${name}`} variant="outline" className="video-choice" disabled={busy || restoringDraft}>{String(controls[name]??uiT("Choose…"))}<ChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={String(controls[name]??'')} onValueChange={value=>{setEdited(true);setControls(current=>{const next={...current,[name]:value};if(name==='resolution'&&model.output&&!model.output.allow_unmapped_output&&!model.output.specifications.some(spec=>spec.resolution===value&&spec.ratio===current.ratio)){const spec=model.output.specifications.find(spec=>spec.resolution===value);if(spec)next.ratio=spec.ratio;}return next;});}}>{rule.values.filter(value=>name!=='ratio'||!model.output||model.output.allow_unmapped_output||model.output.specifications.some(spec=>spec.resolution===controls.resolution&&spec.ratio===value)).map(value=><DropdownMenuRadioItem key={value} value={value}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
                :rule.kind==='integer'?<><Input id={`session-video-${name}`} type="number" min={rule.minimum} max={rule.maximum} step={1} value={String(controls[name]??'')} disabled={busy || restoringDraft} onChange={event=>{setEdited(true);setControls(current=>({...current,[name]:event.target.value}));}}/><small className="video-muted">{rule.minimum}–{rule.maximum}</small></>
                :<Checkbox id={`session-video-${name}`} checked={controls[name]===true} disabled={busy || restoringDraft} onCheckedChange={checked=>{setEdited(true);setControls(current=>({...current,[name]:checked===true}));}}/>}
            </div>)}
            <Button type="button" variant="ghost" disabled={busy || restoringDraft} onClick={()=>{setEdited(true);setControls(initialControls(model));}}>{uiT("Reset settings")}</Button>
          </div></PopoverContent></Popover>}

        </div>
        <Button ref={generateRef} type="submit" size="icon" aria-label={uiT("Generate video")} disabled={busy || Boolean(pendingReference) || loading || restoringDraft || !prompt.trim() || !model || references.length>0 || (model.requires_image&&!references.length) || Boolean(cover)}><ArrowUp size={20} /></Button>
        </div>
        {model?.requires_image && !references.length && <p className="video-muted">{uiT("This model requires a reference image.")}</p>}
      </div>
      {cover === 'archived' && <div className="composer-cover" role="status"><div className="composer-cover-body"><span className="composer-cover-icon" aria-hidden="true"><Archive size={17} /></span><div className="composer-cover-copy"><p>{uiT("Archived")}</p><p className="video-muted">{uiT("Restore this session from Archived sessions to return it to history.")}</p></div></div></div>}
      {cover === 'readonly' && <div className="composer-cover" role="status"><div className="composer-cover-body"><span className="composer-cover-icon" aria-hidden="true"><LockIcon size={17} /></span><div className="composer-cover-copy"><p>{uiT("Generation needs write access.")}</p><p className="video-muted">{uiT("A member with write access can describe the next video here.")}</p></div></div></div>}
      {cover === 'keys' && <div className="composer-cover" role="status"><div className="composer-cover-body"><span className="composer-cover-icon" aria-hidden="true"><KeyIcon size={17} /></span><div className="composer-cover-copy"><p>{uiT("API keys unavailable")}</p></div></div><div className="composer-cover-actions"><Button type="button" onClick={available.reload}>{uiT("Retry")}</Button></div></div>}
      {cover === 'nokey' && <div className="composer-cover" role="status"><div className="composer-cover-body"><span className="composer-cover-icon" aria-hidden="true"><KeyIcon size={17} /></span><div className="composer-cover-copy"><p>{uiT("Select or create an active API key to continue.")}</p></div></div><div className="composer-cover-actions"><Button asChild><Link to={`${workspacePath}/keys`} state={{createKey: true, returnTo: window.location.pathname + window.location.search}}>{uiT("Create API key")}</Link></Button></div></div>}
    </div>
  </form></>;
}
