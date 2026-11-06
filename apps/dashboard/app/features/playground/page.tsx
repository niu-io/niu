import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useRef } from 'react';
import { GenerationSessionBindings } from '@/features/generations/GenerationsLayout';
import { generationCapability } from '@/features/models/generation-capabilities';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { workspacePathSegment } from '@/shell/workspace-route';
import VideoView from '../video/VideoView';
import { useDashboardContext } from '@/shell/dashboard-context';
import { useModelPopularity } from '@/shell/useModelPopularity';
import PlaygroundView from './components/PlaygroundView';
import VideoSessionView from '../generations/VideoSessionView';
import LegacyVideoLink from '../generations/LegacyVideoLink';

export default function PlaygroundRoute() {
  const { t: uiT } = useUILocale();
  const context = useDashboardContext();
  const historyTrigger=useRef<HTMLButtonElement|null>(null);
  const [search] = useSearchParams();
  const { workspace, models, modelsLoading, modelsError, refreshModels, token } = context;
  const ranked = useModelPopularity(models, token, workspace?.organization_id, workspace?.id);
  // Missing modality metadata remains a legacy compatibility route, not proof
  // of Chat support. Outputs without text never enter Chat.
  const chatModels = ranked.models.filter(model => generationCapability(model,'chat') !== false);
  const initialScope = workspace ? {
    organizationId: workspace.organization_id,
    workspaceId: workspace.id,
    organizationName: workspace.organization_name,
    workspaceName: workspace.name,
  } : null;

  const location = useLocation();
  const { session: routeParamSession } = useParams<{ session?: string }>();
  const pathMatch = /^\/generations\/([^/?#]+)\/?$/.exec(location.pathname);
  const pathSession = routeParamSession ?? (pathMatch ? decodeURIComponent(pathMatch[1]) : null);
  const videoSession = Boolean(search.get('intent') || search.get('job') || search.get('new') === 'video');
  const savedVideoSession =
    search.get('video-session') ??
    (pathSession && /^video-[1-9][0-9]{0,18}$/.test(pathSession) ? pathSession : null);
  if(savedVideoSession)return <VideoSessionView key={`${token}:${workspace?.id??''}:${savedVideoSession}`} context={context} id={savedVideoSession}/>;
  // Old result deep links resolve to the session that owns them. The composer
  // owns its session/turn hints until submission, and explicit continuation
  // carries compose=1, so both keep the editable surface.
  const legacyVideoLink = Boolean(search.get('intent') || search.get('job')) && search.get('compose') !== '1' && !search.get('session') && !search.get('turn');
  if(legacyVideoLink)return <LegacyVideoLink key={`${token}:${workspace?.id??''}:${search.get('intent')??''}:${search.get('job')??''}`} context={context} fallback={<VideoView key={`${token}:${workspace?.id??''}`} context={context}/>} />;
  const hasChatSession = Boolean((pathSession && !savedVideoSession) || search.get('session'));
  const requestedModel=search.get('model');
  const requested=requestedModel ? models.find(model=>model.id===requestedModel) : undefined;
  if(!videoSession && !hasChatSession && requestedModel && !modelsLoading && !modelsError && (!requested || generationCapability(requested,'chat')===false)) {
    const workspaceQuery=workspace ? `workspace=${encodeURIComponent(workspacePathSegment(workspace,context.workspaces??[workspace]))}` : '';
    const videoAvailable=requested && generationCapability(requested,'video')===true;
    return <><GenerationSessionBindings trigger={historyTrigger} title={videoAvailable?uiT("Video model"):uiT("Model unavailable")} history={{context}}/><Empty><EmptyHeader><EmptyTitle>{videoAvailable?uiT("This model uses Video"):uiT("This model is unavailable in Chat")}</EmptyTitle><EmptyDescription>{videoAvailable?uiT("Open the Video workflow to use the model you selected."):uiT("The selected model is not currently available for Chat in this workspace. Choose another model to continue.")}</EmptyDescription></EmptyHeader><EmptyContent>{videoAvailable&&<Button asChild><Link to={`/generations?new=video&model=${encodeURIComponent(requestedModel)}${workspaceQuery?`&${workspaceQuery}`:''}`}>{uiT("Open in Video")}</Link></Button>}<Button asChild variant="outline"><Link to={`/models${workspaceQuery?`?${workspaceQuery}`:''}`}>{uiT("Choose a model")}</Link></Button></EmptyContent></Empty></>;
  }

  return <>
    {videoSession ? <VideoView key={`${token}:${workspace?.id ?? ''}`} context={context} /> : <PlaygroundView
      key={`${token}:${workspace?.id ?? ''}`}
      token={token}
      models={chatModels.map(model => model.id)}
      unverifiedModels={chatModels.filter(model => generationCapability(model,'chat') === null).map(model => model.id)}
      modelsLoading={modelsLoading}
      modelsError={modelsError}
      onRetryModels={refreshModels}
      initialScope={initialScope}
    />}
  </>;
}
