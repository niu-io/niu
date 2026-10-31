import {useEffect,useState} from 'react';
import type {DashboardContext,Workspace} from '@/shell/dashboard-context';
import {cachedKeyGet,peekCachedKeyGet,workspaceKeyPath,type ProjectKey} from '@/features/keys/api';

/** Metadata only: the selected key's workspace supplies authorization and billing scope. */
export function useGenerationKeys(context:DashboardContext,enabled:boolean){
  const workspaces=context.workspaces?.length?context.workspaces:context.workspace?[context.workspace]:[];
  const readCached = () => {
    if (!enabled || !context.token || !workspaces.length) return [];
    const rows: Array<ProjectKey & { workspace: Workspace }> = [];
    for (const workspace of workspaces) {
      const page = peekCachedKeyGet<{ data: ProjectKey[] }>(context.token, workspaceKeyPath(workspace.id));
      if (!page || !Array.isArray(page.data)) return [];
      rows.push(...page.data.filter(key => !key.revoked && !key.expired).map(key => ({ ...key, workspace })));
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  };
  const [keys,setKeys]=useState<Array<ProjectKey & {workspace:Workspace}>>(readCached);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const identity=JSON.stringify(workspaces.map(item=>[item.organization_id,item.id]));
  useEffect(()=>{
    const controller=new AbortController();
    const seeded=readCached();
    setKeys(seeded);setError('');setLoading(false);
    if(!enabled||!context.token)return;
    setLoading(seeded.length === 0);
    void(async()=>{
      const queue=[...workspaces];
      const rows:Array<ProjectKey & {workspace:Workspace}>=[];
      let failed=false;
      await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{
        while(queue.length&&!controller.signal.aborted){
          const workspace=queue.shift()!;
          try {
          const page=await cachedKeyGet<{data:ProjectKey[]}>(context.token,workspaceKeyPath(workspace.id),{signal:controller.signal});
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

