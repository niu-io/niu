import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { IconArrowUp as ArrowUp, IconChevronDown as ChevronDown } from '@tabler/icons-react';
import type { VideoModel, VideoModelList } from '@niu-io/sdk';
import { NiuAdminClient, type VideoIntentRequest } from '@niu-io/sdk/admin';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import ProviderLogo from '@/components/ProviderLogo';
import { catalogTitle, modelIdentity } from '@/lib/providers';
import { workspacePathSegment } from '@/shell/workspace-route';
import type { DashboardContext } from '@/shell/dashboard-context';
import { useGenerationKeys } from './useGenerationKeys';
import { initialControls, videoRequest, type ControlValues } from '../video/request';
import { prepareVideoSessionIntent } from '../video/session-intent';
import { VideoIntent } from '../video/intent';
import type { VideoGenerationsSession } from '@niu-io/sdk/generations-sessions';
import '../video/video.css';

function message(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}
function titleFor(promptText: string, modelName: string) {
  const line = promptText.split('\n').map(item => item.trim()).find(Boolean) ?? '';
  let title = line || (modelName.trim() ? `Video · ${modelName.trim()}` : 'Video request');
  const bytes = new TextEncoder();
  while (bytes.encode(title).length > 200) title = title.slice(0, -1);
  return title.trim() || 'Video request';
}

/** The saved result stays on this page. The next video is described here. */
export default function VideoSessionComposer({context, session, onSubmitted}: {
  context: DashboardContext; session: VideoGenerationsSession; onSubmitted: () => void;
}) {
  const { t: uiT } = useUILocale();
  const {token, workspace} = context;
  const canWrite = Boolean(context.session?.permissions.write);
  const workspacePath = workspace ? `/workspaces/${workspacePathSegment(workspace, context.workspaces ?? [workspace])}` : '/workspaces/default';
  const available = useGenerationKeys(workspace ? {...context, workspaces: [workspace]} : context, Boolean(token && workspace && canWrite && !session.archived));
  const keys = available.keys.filter(key => key.workspace.id === workspace?.id);
  const [keyId, setKeyId] = useState('');
  const [models, setModels] = useState<VideoModel[]>([]);
  const [modelId, setModelId] = useState('');
  const [controls, setControls] = useState<ControlValues>({});
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const client = useMemo(() => token ? new NiuAdminClient({adminToken: token, baseURL: new URL('/api/v1', window.location.origin).href}) : null, [token]);
  const model = models.find(item => item.id === modelId);
  const cover = session.archived ? 'archived' : !canWrite ? 'readonly' : !available.loading && !keys.length ? 'nokey' : null;
  useEffect(() => {
    setKeyId(current => keys.some(key => key.id === current) ? current : keys[0]?.id ?? '');
  }, [keys]);
  useEffect(() => {
    const controller = new AbortController();
    setModels([]);
    setError('');
    if (!token || !keyId || cover) return;
    setLoading(true);
    void fetch('/v1/video/models', {headers: {authorization: `Bearer ${token}`, 'x-niu-key-id': keyId}, signal: controller.signal})
      .then(async response => {
        const payload = await response.json().catch(() => null) as VideoModelList | null;
        if (!response.ok) throw new Error('Video models could not be loaded.');
        return payload;
      })
      .then(payload => {
        if (controller.signal.aborted || !payload) return;
        const next = payload.data.find(item => item.id === 'fastrouter/seedance-2.0-mini') ?? payload.data[0];
        setModels(payload.data);
        setModelId(next?.id ?? '');
        setControls(next ? initialControls(next) : {});
      })
      .catch(caught => { if (!controller.signal.aborted) setError(message(caught)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, keyId, cover]);
  async function generate() {
    if (!client || !workspace || !model || !canWrite || busy || cover) return;
    setError('');
    if (model.requires_image) { setError('This model requires a reference image.'); return; }
    let request: VideoIntentRequest;
    try { request = videoRequest(model, prompt, controls) as VideoIntentRequest; }
    catch (caught) { setError(message(caught)); return; }
    setBusy(true);
    try {
      const estimate = await fetch('/v1/video/estimate', {
        method: 'POST', headers: {authorization: `Bearer ${token}`, 'x-niu-key-id': keyId, 'content-type': 'application/json'},
        body: JSON.stringify(request),
      });
      const estimated = await estimate.json().catch(() => null);
      if (!estimate.ok) throw new Error(estimated?.error?.message ?? 'The video could not be estimated.');
      const intentId = crypto.randomUUID();
      const intent = new VideoIntent(client, {organizationId: workspace.organization_id, projectId: workspace.id}, intentId);
      await prepareVideoSessionIntent(client, {organizationId: workspace.organization_id, projectId: workspace.id}, {
        sessionId: session.id, turnId: crypto.randomUUID(), intentId, keyId, title: titleFor(prompt, model.id), request,
      });
      await intent.restore();
      await intent.submit();
      setPrompt('');
      onSubmitted();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  return <form className="playground-composer" onSubmit={event => { event.preventDefault(); void generate(); }}>
    <div className={`playground-composer-surface${cover ? ' is-blocked' : ''}`}>
      <div className="video-composer-fields">
        <Label htmlFor="session-video-prompt" className="sr-only">{uiT("Prompt")}</Label>
        <Textarea id="session-video-prompt" placeholder={uiT("Describe your video…")} rows={2} value={prompt} onChange={event => setPrompt(event.target.value)} disabled={busy || loading || Boolean(cover)} />
        {error && !cover && <p role="alert" className="video-error">{['This model requires a reference image.', 'Video models could not be loaded.', 'The video could not be estimated.', 'Enter a prompt.'].includes(error) ? uiT(error) : error}</p>}
        <div className="playground-composer-actions"><div className="video-composer-options">
          {models.length > 0 ? <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" className="video-model-choice" aria-label={uiT("Video model")} disabled={busy}>{modelId && <ProviderLogo provider={modelIdentity(context.models?.find(item => item.id === modelId) ?? { id: modelId })} size="small" />}<span className="truncate">{modelId ? catalogTitle({ id: modelId }) : uiT("Choose video model")}{modelId && catalogTitle({ id: modelId }) !== modelId ? <span className="sr-only"> {modelId}</span> : null}</span><ChevronDown size={14} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={modelId} onValueChange={id => { const next = models.find(item => item.id === id); setModelId(id); setControls(next ? initialControls(next) : {}); }}>{models.map(item => { const label = catalogTitle({ id: item.id }); return <DropdownMenuRadioItem key={item.id} value={item.id}><ProviderLogo provider={modelIdentity(context.models?.find(candidate => candidate.id === item.id) ?? { id: item.id })} size="small" />{label}{label !== item.id ? <span className="sr-only"> {item.id}</span> : null}</DropdownMenuRadioItem>; })}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu> : <Button type="button" variant="ghost" className="video-model-choice" disabled>{uiT("Choose video model")}</Button>}
          {model && Object.entries(model.controls).filter(([name, rule]) => ['resolution', 'ratio', 'duration'].includes(name) && rule.kind === 'choice').map(([name, rule]) => <DropdownMenu key={name}><DropdownMenuTrigger asChild><Button type="button" variant="ghost" disabled={busy}>{String(controls[name] ?? uiT("Choose…"))}<ChevronDown size={14} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={String(controls[name] ?? '')} onValueChange={value => setControls(current => ({...current, [name]: value}))}>{rule.kind === 'choice' && rule.values.map(value => <DropdownMenuRadioItem key={value} value={value}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>)}
        </div>
        <Button type="submit" size="icon" aria-label={uiT("Generate video")} disabled={busy || loading || !prompt.trim() || !model || model.requires_image || Boolean(cover)}><ArrowUp size={20} /></Button>
        </div>
        {model?.requires_image && <p className="video-muted">{uiT("This model requires a reference image.")}</p>}
      </div>
      {cover === 'archived' && <div className="composer-cover" role="status"><p>{uiT("Archived")}</p><p className="video-muted">{uiT("Restore this session from Archived sessions to return it to history.")}</p></div>}
      {cover === 'readonly' && <div className="composer-cover" role="status"><p>{uiT("Generation needs write access.")}</p><p className="video-muted">{uiT("A member with write access can describe the next video here.")}</p></div>}
      {cover === 'nokey' && <div className="composer-cover" role="status"><p>{uiT("This API key is invalid. Choose another or create a new one to continue.")}</p><div className="composer-cover-actions"><Button asChild><Link to={`${workspacePath}/keys`} state={{createKey: true, returnTo: window.location.pathname + window.location.search}}>{uiT("Create API key")}</Link></Button></div></div>}
    </div>
  </form>;
}
