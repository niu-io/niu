import { useRef } from 'react';
import { GenerationSessionBindings } from '@/features/generations/GenerationsLayout';
import { generationCapability } from '@/features/models/generation-capabilities';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { workspacePathSegment } from '@/app/workspace-route';
import VideoView from '../video/VideoView';
import { useDashboardContext } from '@/app/dashboard-context';
import { useModelPopularity } from '@/app/useModelPopularity';
import PlaygroundView from './components/PlaygroundView';
import VideoSessionView from '../generations/VideoSessionView';

export default function PlaygroundRoute() {
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

  const videoSession = Boolean(search.get('intent') || search.get('job') || search.get('new') === 'video');
  const savedVideoSession=search.get('video-session');
  if(savedVideoSession)return <VideoSessionView key={`${token}:${workspace?.id??''}:${savedVideoSession}`} context={context} id={savedVideoSession}/>;
  const requestedModel=search.get('model');
  const requested=requestedModel ? models.find(model=>model.id===requestedModel) : undefined;
  if(!videoSession && !search.get('session') && requestedModel && !modelsLoading && !modelsError && (!requested || generationCapability(requested,'chat')===false)) {
    const workspaceQuery=workspace ? `workspace=${encodeURIComponent(workspacePathSegment(workspace,context.workspaces??[workspace]))}` : '';
    const videoAvailable=requested && generationCapability(requested,'video')===true;
    return <><GenerationSessionBindings trigger={historyTrigger} title={videoAvailable?"Video model":"Model unavailable"} history={{context}}/><Empty><EmptyHeader><EmptyTitle>{videoAvailable?'This model uses Video':'This model is unavailable in Chat'}</EmptyTitle><EmptyDescription>{videoAvailable?'Open the Video workflow to use the model you selected.':'The selected model is not currently available for Chat in this workspace. Choose another model to continue.'}</EmptyDescription></EmptyHeader><EmptyContent>{videoAvailable&&<Button asChild><Link to={`/generations?new=video&model=${encodeURIComponent(requestedModel)}${workspaceQuery?`&${workspaceQuery}`:''}`}>Open in Video</Link></Button>}<Button asChild variant="outline"><Link to={`/models${workspaceQuery?`?${workspaceQuery}`:''}`}>Choose a model</Link></Button></EmptyContent></Empty></>;
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
