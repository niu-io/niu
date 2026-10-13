import {useEffect,useMemo,useRef,useState} from 'react';
import {useDashboardContext} from '@/app/dashboard-context';
import {keyRequest,projectKeyPath,type ProjectKey} from '@/features/keys/api';
import {type MediaAssetGroup,type MediaAsset} from '../../../../../../sdks/javascript/src/media-assets';
import {NiuAdminClient} from '../../../../../../sdks/javascript/src/admin';
import type {MediaVerificationSession} from '../../../../../../sdks/javascript/src/media-verification';

async function allPages<T>(read:(after?:string)=>Promise<{data:T[];next_cursor:string|null}>){
 const rows:T[]=[];const cursors=new Set<string>();let after:string|undefined;
 do{const page=await read(after);rows.push(...page.data);after=page.next_cursor??undefined;if(after&&cursors.has(after))throw new Error('Could not finish loading materials.');if(after)cursors.add(after);}while(after);
 return {data:rows};
}

export type NativeMaterialsContext = {keyId:string;model:string};

export function useMaterials(preferredModel?:string,nativeContext?:NativeMaterialsContext){
 const context=useDashboardContext(), workspace=context.workspace;
 const [revision,setRevision]=useState(0);
 const identity=JSON.stringify([context.token,context.session?.operator?.id??context.session?.kind,workspace?.organization_id,workspace?.id,preferredModel,nativeContext?.keyId,nativeContext?.model]);
 const liveIdentity=useRef(identity);liveIdentity.current=identity;
 const [binding,setBinding]=useState<{identity:string;model:string;keyId:string}|null>(null);
 const reloadController=useRef<AbortController|null>(null);
 const [groups,setGroups]=useState<MediaAssetGroup[]>([]),[assets,setAssets]=useState<MediaAsset[]>([]),[sessions,setSessions]=useState<MediaVerificationSession[]>([]);
 const [group,setGroup]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const admin=useMemo(()=>new NiuAdminClient({adminToken:context.token,baseURL:new URL('/admin/v1',window.location.origin).href}),[context.token]);
 const client=useMemo(()=>binding?.identity===identity&&workspace ? admin.dashboardMedia({organizationId:workspace.organization_id,projectId:workspace.id},binding.keyId):null,[binding,identity,admin,workspace?.organization_id,workspace?.id]);
 useEffect(()=>()=>reloadController.current?.abort(),[client,group]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setBinding(null);setGroups([]);setAssets([]);setSessions([]);setGroup('');setError('');
  if(!workspace){setLoading(false);return;}
  void(async()=>{
   if(nativeContext){
    const api=admin.dashboardMedia({organizationId:workspace.organization_id,projectId:workspace.id},nativeContext.keyId);
    const capabilities=await api.capabilities(nativeContext.model,{signal:controller.signal});
    if(controller.signal.aborted)return;
    if(!capabilities.modules.some(module=>module.module==='volcengine'&&module.model_alias===nativeContext.model))throw new Error('This model has no native Supplier tools.');
    const page=await allPages(after=>api.groups.list({model:nativeContext.model,limit:100,after},{signal:controller.signal}));
    if(controller.signal.aborted)return;
    setBinding({identity,keyId:nativeContext.keyId,model:nativeContext.model});setGroups(page.data);setGroup(page.data.find(group=>group.status!=='deleted')?.id??'');return;
   }
   const base=projectKeyPath(workspace.organization_id,workspace.id);const keys=await keyRequest<{data:ProjectKey[]}>(context.token,base,'GET',undefined,controller.signal);
   let failure='No available video model supports materials in this workspace.';
   for(const key of keys.data.filter(k=>!k.revoked&&!k.expired)){
    const keyBase=`${base}/${encodeURIComponent(key.id)}`;
    const models=await keyRequest<{data:{id:string}[]}>(context.token,keyBase+'/video/models','GET',undefined,controller.signal);
    for(const model of models.data.filter(m=>!preferredModel||m.id===preferredModel)){
     const api=admin.dashboardMedia({organizationId:workspace.organization_id,projectId:workspace.id},key.id);
     try{const capabilities=await api.capabilities(model.id,{signal:controller.signal});
      if(controller.signal.aborted)return;
      if(!capabilities.modules.some(module=>module.module==='volcengine'&&module.model_alias===model.id))continue;
      const page=await allPages(after=>api.groups.list({model:model.id,limit:100,after},{signal:controller.signal}));if(controller.signal.aborted)return;setBinding({identity,keyId:key.id,model:model.id});setGroups(page.data);setGroup(page.data.find(group=>group.status!=='deleted')?.id??'');return;}catch(e){if(controller.signal.aborted)return;failure=e instanceof Error?e.message:failure;}
    }
   }throw new Error(failure);
  })().catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[identity,admin,revision]);
 async function reload(){
  if(!client||!binding||binding.identity!==identity)return;
  reloadController.current?.abort();const controller=new AbortController();reloadController.current=controller;
  try{
   const [g,s]=await Promise.all([allPages(after=>client.groups.list({model:binding.model,limit:100,after},{signal:controller.signal})),allPages(after=>client.verification.list({model:binding.model,limit:100,after},{signal:controller.signal}))]);
   if(controller.signal.aborted||liveIdentity.current!==identity)return;
   setGroups(g.data);setSessions(s.data);
   if(group){const a=await allPages(after=>client.assets.list({model:binding.model,group_id:group,limit:100,after},{signal:controller.signal}));if(!controller.signal.aborted&&liveIdentity.current===identity)setAssets(a.data);}
  }finally{if(reloadController.current===controller)reloadController.current=null;}
 }

 useEffect(()=>{if(!client||!binding)return;const controller=new AbortController();setAssets([]);void Promise.all([allPages(after=>client.verification.list({model:binding.model,limit:100,after},{signal:controller.signal})).then(p=>{if(!controller.signal.aborted)setSessions(p.data);}),group?allPages(after=>client.assets.list({model:binding.model,group_id:group,limit:100,after},{signal:controller.signal})).then(p=>{if(!controller.signal.aborted)setAssets(p.data);}):Promise.resolve()]).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[client,group]);
 return {retry:()=>setRevision(v=>v+1),client,model:binding?.model,groups,assets,sessions,group,setGroup,error,setError,loading,reload,canWrite:context.session?.permissions.write===true};
}
