import {useEffect,useMemo,useState} from 'react';
import {useDashboardContext} from '@/app/dashboard-context';
import {keyRequest,projectKeyPath,type ProjectKey} from '@/features/keys/api';
import {createMediaAssetsClient,type MediaAssetSender,type MediaAssetGroup,type MediaAsset} from '../../../../../../sdks/javascript/src/media-assets';
import type {MediaVerificationSession} from '../../../../../../sdks/javascript/src/media-verification';

async function allPages<T>(read:(after?:string)=>Promise<{data:T[];next_cursor:string|null}>){
 const rows:T[]=[];const cursors=new Set<string>();let after:string|undefined;
 do{const page=await read(after);rows.push(...page.data);after=page.next_cursor??undefined;if(after&&cursors.has(after))throw new Error('Could not finish loading materials.');if(after)cursors.add(after);}while(after);
 return {data:rows};
}

export function useMaterials(preferredModel?:string){
 const context=useDashboardContext(), workspace=context.workspace;
 const [revision,setRevision]=useState(0);
 const [binding,setBinding]=useState<{base:string;model:string}|null>(null);
 const [groups,setGroups]=useState<MediaAssetGroup[]>([]),[assets,setAssets]=useState<MediaAsset[]>([]),[sessions,setSessions]=useState<MediaVerificationSession[]>([]);
 const [group,setGroup]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const clientFor=(base:string)=>createMediaAssetsClient((async(path,method,body,options)=>{
  const response=await fetch(base+path,{method,signal:options?.signal,headers:{authorization:`Bearer ${context.token}`,...(body?{'content-type':'application/json'}:{}),...(options?.idempotencyKey?{'idempotency-key':options.idempotencyKey}:{})},body:body?JSON.stringify(body):undefined});
  const value=await response.json();if(!response.ok)throw new Error(value.error?.message??`Request failed (${response.status})`);return value;
 }) as MediaAssetSender);
 const client=useMemo(()=>binding?clientFor(binding.base):null,[binding,context.token]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setBinding(null);setGroups([]);setAssets([]);setSessions([]);setGroup('');setError('');
  if(!workspace){setLoading(false);return;}
  void(async()=>{const base=projectKeyPath(workspace.organization_id,workspace.id);const keys=await keyRequest<{data:ProjectKey[]}>(context.token,base,'GET',undefined,controller.signal);
   let failure='No available video model supports materials in this workspace.';
   for(const key of keys.data.filter(k=>!k.revoked&&!k.expired)){
    const keyBase=`${base}/${encodeURIComponent(key.id)}`;
    const models=await keyRequest<{data:{id:string}[]}>(context.token,keyBase+'/video/models','GET',undefined,controller.signal);
    for(const model of models.data.filter(m=>!preferredModel||m.id===preferredModel)){
     const api=clientFor(keyBase);
     try{const page=await allPages(after=>api.groups.list({model:model.id,limit:100,after},{signal:controller.signal}));if(controller.signal.aborted)return;setBinding({base:keyBase,model:model.id});setGroups(page.data);setGroup(page.data[0]?.id??'');return;}catch(e){failure=e instanceof Error?e.message:failure;}
    }
   }throw new Error(failure);
  })().catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[context.token,workspace?.id,workspace?.organization_id,preferredModel,revision]);
 async function reload(){if(!client||!binding)return;const [g,s]=await Promise.all([allPages(after=>client.groups.list({model:binding.model,limit:100,after})),allPages(after=>client.verification.list({model:binding.model,limit:100,after}))]);setGroups(g.data);setSessions(s.data);if(group){const a=await allPages(after=>client.assets.list({model:binding.model,group_id:group,limit:100,after}));setAssets(a.data);}}
 useEffect(()=>{if(!client||!binding)return;const controller=new AbortController();setAssets([]);void Promise.all([allPages(after=>client.verification.list({model:binding.model,limit:100,after},{signal:controller.signal})).then(p=>{if(!controller.signal.aborted)setSessions(p.data);}),group?allPages(after=>client.assets.list({model:binding.model,group_id:group,limit:100,after},{signal:controller.signal})).then(p=>{if(!controller.signal.aborted)setAssets(p.data);}):Promise.resolve()]).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[client,group]);
 return {retry:()=>setRevision(v=>v+1),client,model:binding?.model,groups,assets,sessions,group,setGroup,error,setError,loading,reload,canWrite:context.session?.permissions.write===true};
}
