import {useEffect,useState} from 'react';
import type {DashboardContext,Workspace} from '@/shell/dashboard-context';
import {cachedKeyGet,peekCachedKeyGet,workspaceKeyPath,type ProjectKey} from '@/features/keys/api';

/** Metadata only: the selected key's workspace supplies authorization and billing scope. */
export function useGenerationKeys(context:DashboardContext,enabled:boolean){
  const workspaces=context.workspaces?.length?context.workspaces:context.workspace?[context.workspace]:[];
  const readCacheSnapshot = () => {
    if (!enabled || !context.token || !workspaces.length) return { rows: [] as Array<ProjectKey & { workspace: Workspace }>, complete: true };
    const rows: Array<ProjectKey & { workspace: Workspace }> = [];
    let complete = true;
    for (const workspace of workspaces) {
      const page = peekCachedKeyGet<{ data: ProjectKey[] }>(context.token, workspaceKeyPath(workspace.id));
      if (!page || !Array.isArray(page.data)) {
        complete = false;
        continue;
      }
      rows.push(...page.data.filter(key => !key.revoked && !key.expired).map(key => ({ ...key, workspace })));
    }
    return { rows: rows.sort((a, b) => a.name.localeCompare(b.name)), complete };
  };
  const identity=JSON.stringify(workspaces.map(item=>[item.organization_id,item.id]));
  const [reloadTick, setReloadTick] = useState(0);
  const requestKey = enabled && context.token && workspaces.length ? `${context.token}:${identity}:${reloadTick}` : null;
  const [keys,setKeys]=useState<Array<ProjectKey & {workspace:Workspace}>>(() => readCacheSnapshot().rows);
  const [loading,setLoading]=useState(() => Boolean(requestKey && !readCacheSnapshot().complete));
  const [settledKey, setSettledKey] = useState<string | null>(() => requestKey && readCacheSnapshot().complete ? requestKey : null);
  const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    const seeded = readCacheSnapshot();
    setKeys(seeded.rows);setError('');
    if(!requestKey){setLoading(false);setSettledKey(null);return;}
    setLoading(!seeded.complete);
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
    })().finally(()=>{if(!controller.signal.aborted){setSettledKey(requestKey);setLoading(false);}});
    return()=>controller.abort();
  },[requestKey]);
  return {keys,loading: Boolean(requestKey) && (loading || settledKey !== requestKey),error,reload: () => setReloadTick(value => value + 1)};
}

