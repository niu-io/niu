import {useEffect,useState} from 'react';
import type {DashboardContext} from '@/app/dashboard-context';
import {keyRequest,projectKeyPath,type ProjectKey} from '@/features/keys/api';

/** Discover usable video models with workspace/key authorization, never from aliases. */
export function useWorkspaceVideo(context:DashboardContext){
  const scope=JSON.stringify([context.token,context.workspace?.organization_id,context.workspace?.id]);
  const [available,setAvailable]=useState<{scope:string;value:boolean}>({scope:'',value:false});
  useEffect(()=>{
    const controller=new AbortController();
    const workspace=context.workspace;
    if(!workspace||!context.token)return;
    const base=projectKeyPath(workspace.organization_id,workspace.id);
    void (async()=>{
      const keys=await keyRequest<{data:ProjectKey[]}>(context.token,base,'GET',undefined,controller.signal);
      const queue=keys.data.filter(key=>!key.revoked&&!key.expired);
      let found=false;
      await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{
        while(queue.length&&!found&&!controller.signal.aborted){
          const key=queue.shift()!;
          try{const page=await keyRequest<{data:unknown[]}>(context.token,`${base}/${encodeURIComponent(key.id)}/video/models`,'GET',undefined,controller.signal);if(page.data.length)found=true;}catch{ /* Failed discovery does not advertise a capability. */ }
        }
      }));
      if(!controller.signal.aborted)setAvailable({scope,value:found});
    })().catch(()=>{if(!controller.signal.aborted)setAvailable({scope,value:false});});
    return()=>controller.abort();
  },[scope]);
  return available.scope===scope&&available.value;
}
