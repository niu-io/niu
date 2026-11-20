import { authenticatedFetch as fetch } from '@/lib/authenticated-fetch';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { peekQuery } from '@/lib/query-cache';
import { resolveWorkspacePathSegment } from '@/shell/workspace-route';
import { NiuAdminClient, type GenerationTask } from '@niu-io/sdk/admin';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import type { DashboardContext } from '@/shell/dashboard-context';
import { resolveLegacyVideoLink } from './legacy-video-link';
import { videoTaskCacheKey } from './video-cache';
import '../video/video.css';

/**
 * Old `?intent=`/`?job=` result links redirect to the session and turn that own
 * the result. Records without a readable session keep the legacy Video surface
 * so authorized recovery and the original error states stay available.
 */
export default function LegacyVideoLink({context,fallback,jobOverride}:{context:DashboardContext;fallback:ReactNode;jobOverride?:string}) {
  const { t: uiT } = useUILocale();
  const location=useLocation();
  const navigate=useNavigate();
  const client=useMemo(()=>context.token ? new NiuAdminClient({ fetch,adminToken:context.token,baseURL:new URL('/api/v1',window.location.origin).href}) : null,[context.token]);
  const workspace=context.workspace;
  const search=useMemo(()=>new URLSearchParams(location.search),[location.search]);
  const intent=search.get('intent')??'';
  const job=search.get('job')??jobOverride??'';
  const compose=search.get('compose')==='1';
  const requestedWorkspace=search.get('workspace')??'';
  const foreignWorkspace=Boolean(requestedWorkspace && workspace && (() => {
    const target=resolveWorkspacePathSegment(requestedWorkspace,context.workspaces??[workspace]);
    return Boolean(target&&target.id!==workspace.id);
  })());
  const cachedStandalone=Boolean(
    !compose && !foreignWorkspace && client && workspace && !intent && job && context.token &&
    peekQuery<GenerationTask>(context.token, videoTaskCacheKey(workspace.id, job), {persist:true})?.session_id === null,
  );
  const { token } = context;
  const [settled,setSettled]=useState<'resolving'|'fallback'>(()=>(cachedStandalone || compose || !client || !workspace || (!intent && !job)) ? 'fallback' : 'resolving');
  useEffect(()=>{
    if(compose||!client||!workspace||(!intent&&!job)||cachedStandalone){setSettled('fallback');return;}
    // The shell applies an explicit workspace query before the result resolves.
    // Never resolve the old link against a different workspace's scope.
    if(foreignWorkspace){setSettled('resolving');return;}
    const controller=new AbortController();
    let active=true;
    setSettled('resolving');
    const timeout=window.setTimeout(()=>{controller.abort();if(active)setSettled('fallback');},8000);
    void resolveLegacyVideoLink(client,{organizationId:workspace.organization_id,projectId:workspace.id},{intent,job},{signal:controller.signal,token})
      .then(target=>{
        if(!active)return;
        if(target)navigate(target,{replace:true});
        else setSettled('fallback');
      })
      .catch(()=>{if(active)setSettled('fallback');})
      .finally(()=>window.clearTimeout(timeout));
    return()=>{active=false;window.clearTimeout(timeout);controller.abort();};
  },[compose,client,workspace,intent,job,foreignWorkspace,cachedStandalone,token,navigate]);
  if(settled==='fallback')return <>{fallback}</>;
  return <div className="video-shell">
    <section className="video-main" aria-label={uiT("Opening saved Video")}><div className="video-content"><div className="video-conversation">
      <FormSectionSkeleton fields={2} label={uiT("Opening saved video…")}/>
    </div></div></section>
  </div>;
}
