import {useEffect,useState} from 'react';
import type {DashboardContext,Workspace} from '@/app/dashboard-context';
import {keyRequest,projectKeyPath,type ProjectKey} from '@/features/keys/api';

/** Metadata only: the selected key's workspace supplies authorization and billing scope. */
export function useGenerationKeys(context:DashboardContext,enabled:boolean){
  const [keys,setKeys]=useState<Array<ProjectKey & {workspace:Workspace}>>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const workspaces=context.workspaces?.length?context.workspaces:context.workspace?[context.workspace]:[];
  const identity=JSON.stringify(workspaces.map(item=>[item.organization_id,item.id]));
  useEffect(()=>{
    const controller=new AbortController();setKeys([]);setError('');setLoading(false);
    if(!enabled||!context.token)return;
    setLoading(true);
    void(async()=>{
      const queue=[...workspaces];
      const rows:Array<ProjectKey & {workspace:Workspace}>=[];
      let failed=false;
      await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{
        while(queue.length&&!controller.signal.aborted){
          const workspace=queue.shift()!;
          try {
          const page=await keyRequest<{data:ProjectKey[]}>(context.token,projectKeyPath(workspace.organization_id,workspace.id),'GET',undefined,controller.signal);
          rows.push(...page.data.filter(key=>!key.revoked&&!key.expired).map(key=>({...key,workspace})));
          } catch {failed=true;}
        }
      }));
      if(!controller.signal.aborted){setKeys(rows.sort((a,b)=>a.name.localeCompare(b.name)));if(failed)setError('Some API keys could not be loaded.');}
    })().finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[context.token,identity,enabled]);
  return {keys,loading,error};
}
