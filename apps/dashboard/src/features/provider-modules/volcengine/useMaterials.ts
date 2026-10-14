import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useDashboardContext} from '@/app/dashboard-context';
import {keyRequest,workspaceKeyPath,type ProjectKey} from '@/features/keys/api';
import {type MediaAssetGroup,type MediaAsset,type MediaAssetOperation} from '../../../../../../sdks/javascript/src/media-assets';
import {NiuAdminClient,type NativeProviderModule} from '../../../../../../sdks/javascript/src/admin';
import type {MediaVerificationSession} from '../../../../../../sdks/javascript/src/media-verification';

async function allPages<T>(read:(after?:string)=>Promise<{data:T[];next_cursor:string|null}>){
 const rows:T[]=[];const cursors=new Set<string>();let after:string|undefined;
 do{const page=await read(after);rows.push(...page.data);after=page.next_cursor??undefined;if(after&&cursors.has(after))throw new Error('Could not finish loading materials.');if(after)cursors.add(after);}while(after);
 return {data:rows};
}

export type NativeMaterialsContext = {keyId:string;model:string};

export type NativeContextChoice = {keyId:string;keyName:string;module:NativeProviderModule};
export function useMaterials(preferredModel?:string,nativeContext?:NativeMaterialsContext,selection?:NativeMaterialsContext){
 const context=useDashboardContext(), workspace=context.workspace;
 const [revision,setRevision]=useState(0);
 const requested=nativeContext??selection;
 const discoveryIdentity=JSON.stringify([context.token,workspace?.organization_id,workspace?.id]);
 const [discovery,setDiscovery]=useState<{identity:string;loading:boolean;keys:ProjectKey[];choices:NativeContextChoice[];errors:string[]}>({identity:'',loading:true,keys:[],choices:[],errors:[]});
 const identity=JSON.stringify([context.token,context.session?.operator?.id??context.session?.kind,workspace?.organization_id,workspace?.id,preferredModel,requested?.keyId,requested?.model]);
 const liveIdentity=useRef(identity);liveIdentity.current=identity;
 const [binding,setBinding]=useState<{identity:string;model:string;keyId:string;module:NativeProviderModule}|null>(null);
 const reloadController=useRef<AbortController|null>(null);
 const [groups,setGroups]=useState<MediaAssetGroup[]>([]),[assets,setAssets]=useState<MediaAsset[]>([]),[sessions,setSessions]=useState<MediaVerificationSession[]>([]);
 const [group,setGroup]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const admin=useMemo(()=>new NiuAdminClient({adminToken:context.token,baseURL:new URL('/admin/v1',window.location.origin).href}),[context.token]);
 useEffect(()=>{
  if(nativeContext)return;
  const controller=new AbortController();setDiscovery({identity:discoveryIdentity,loading:true,keys:[],choices:[],errors:[]});
  if(!workspace){setDiscovery({identity:discoveryIdentity,loading:false,keys:[],choices:[],errors:[]});return()=>controller.abort();}
  void(async()=>{
   const page=await keyRequest<{data:ProjectKey[]}>(context.token,workspaceKeyPath(workspace.id),'GET',undefined,controller.signal);
   const keys=page.data,queue=keys.filter(key=>!key.revoked&&!key.expired),choices:NativeContextChoice[]=[],errors:string[]=[];
   await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{
    while(queue.length&&!controller.signal.aborted){
     const key=queue.shift()!;
     try{
      const found=await admin.dashboardMedia({organizationId:workspace.organization_id,projectId:workspace.id},key.id).capabilities(undefined,{signal:controller.signal});
      if(!found.complete)throw new Error('Native tool discovery did not complete.');
      const modules=found.modules.filter(module=>module.module==='volcengine');
      const ambiguous=modules.filter(module=>modules.filter(candidate=>candidate.model_alias===module.model_alias).length!==1);
      if(ambiguous.length)errors.push(`${key.name}: ambiguous model/account contexts cannot be selected by this API.`);
      choices.push(...modules.filter(module=>!ambiguous.includes(module)).map(module=>({keyId:key.id,keyName:key.name,module})));
     }catch(error){if(!controller.signal.aborted)errors.push(`${key.name}: ${error instanceof Error?error.message:'Discovery failed.'}`);}
    }
   }));
   if(!controller.signal.aborted)setDiscovery({identity:discoveryIdentity,loading:false,keys,choices,errors});
  })().catch(error=>{if(!controller.signal.aborted)setDiscovery({identity:discoveryIdentity,loading:false,keys:[],choices:[],errors:[error instanceof Error?error.message:'Native tool discovery failed.']});});
  return()=>controller.abort();
 },[discoveryIdentity,admin,revision,Boolean(nativeContext)]);
 const discoveryPending=!nativeContext&&(discovery.identity!==discoveryIdentity||discovery.loading);
 const client=useMemo(()=>binding?.identity===identity&&workspace ? admin.dashboardMedia({organizationId:workspace.organization_id,projectId:workspace.id},binding.keyId):null,[binding,identity,admin,workspace?.organization_id,workspace?.id]);
 const historyClient=useMemo(()=>workspace&&requested?.keyId&&requested.model&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(requested.keyId)
  ? admin.mediaOperationHistory({organizationId:workspace.organization_id,projectId:workspace.id},{keyId:requested.keyId,model:requested.model}):null,[admin,workspace?.organization_id,workspace?.id,requested?.keyId,requested?.model]);
 const [operationHistory,setOperationHistory]=useState<{identity:string;rows:MediaAssetOperation[];complete:boolean;loading:boolean;error:string}>({identity:'',rows:[],complete:false,loading:false,error:''});
 const operationController=useRef<AbortController|null>(null);
 const reloadOperations=useCallback(async()=>{
  if(!historyClient)return;
  operationController.current?.abort();const controller=new AbortController();operationController.current=controller;
  setOperationHistory(previous=>({identity,rows:previous.identity===identity?previous.rows:[],complete:false,loading:true,error:''}));
  try{
   const page=await allPages(after=>historyClient.list({limit:100,after},{signal:controller.signal}));
   if(!controller.signal.aborted&&liveIdentity.current===identity)setOperationHistory({identity,rows:page.data,complete:true,loading:false,error:''});
  }catch(error){if(!controller.signal.aborted&&liveIdentity.current===identity)setOperationHistory(previous=>({...previous,loading:false,error:error instanceof Error?error.message:'Could not load saved operations.'}));}
 },[historyClient,identity]);
 useEffect(()=>{if(historyClient)void reloadOperations();return()=>operationController.current?.abort();},[historyClient,reloadOperations]);
 const checkOperation=useCallback(async(id:string)=>{
  if(!historyClient)return;
  operationController.current?.abort();const controller=new AbortController();operationController.current=controller;
  setOperationHistory(previous=>({...previous,loading:true,error:''}));
  try{
   const result=await historyClient.retrieve(id,{signal:controller.signal});
   if(!controller.signal.aborted&&liveIdentity.current===identity)setOperationHistory(previous=>({...previous,loading:false,rows:previous.rows.map(row=>row.id===id?result.data:row)}));
  }catch(error){if(!controller.signal.aborted&&liveIdentity.current===identity)setOperationHistory(previous=>({...previous,loading:false,error:`${error instanceof Error?error.message:'Could not check the saved operation.'} Its outcome has not been changed by this check.`}));}
 },[historyClient,identity]);
 const operations=operationHistory.identity===identity?operationHistory.rows:[];
 const operationsLoading=!!historyClient&&(operationHistory.identity!==identity||operationHistory.loading);
 const operationsReady=operationHistory.identity===identity&&operationHistory.complete;
 const operationsError=operationHistory.identity===identity?operationHistory.error:'';
 useEffect(()=>()=>reloadController.current?.abort(),[client,group]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setBinding(null);setGroups([]);setAssets([]);setSessions([]);setGroup('');setError('');
  if(!workspace){setLoading(false);return;}
  void(async()=>{
   if(!requested?.keyId||!requested.model||discoveryPending)return;
   if(!nativeContext){
    if(!discovery.keys.some(key=>key.id===requested.keyId&&!key.revoked&&!key.expired))throw new Error('The selected API key is not active in this workspace.');
    const choices=discovery.choices.filter(choice=>choice.keyId===requested.keyId&&choice.module.model_alias===requested.model);
    if(choices.length!==1)throw new Error(choices.length>1?'This model has ambiguous native contexts; no account was selected.':'The selected model has no discovered native tools. Check discovery errors or choose a supported model.');
   }
   const api=admin.dashboardMedia({organizationId:workspace.organization_id,projectId:workspace.id},requested.keyId);
   const capabilities=await api.capabilities(requested.model,{signal:controller.signal});
   if(controller.signal.aborted)return;
   const modules=capabilities.modules.filter(module=>module.module==='volcengine'&&module.model_alias===requested.model);
   if(!capabilities.complete||modules.length!==1)throw new Error(modules.length>1?'This model has ambiguous native contexts; no account was selected.':'This model has no native Provider tools.');
   const page=await allPages(after=>api.groups.list({model:requested.model,limit:100,after},{signal:controller.signal}));
   if(controller.signal.aborted)return;
   setBinding({identity,keyId:requested.keyId,model:requested.model,module:modules[0]});setGroups(page.data);setGroup(page.data.find(group=>group.status!=='deleted')?.id??'');

  })().catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[identity,admin,revision,discoveryPending,discovery]);
 async function reload(){
  await reloadOperations();
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
 const cancelPreparedOperation=async(id:string,model:string)=>{
  if(!workspace||!context.session?.permissions.write)throw new Error('Workspace Write access is required.');
  return admin.cancelPreparedMediaOperation({organizationId:workspace.organization_id,projectId:workspace.id},id,model);
 };
 return {historyClient,historyModel:requested?.model,historyKey:discovery.identity===discoveryIdentity?discovery.keys.find(key=>key.id===requested?.keyId):undefined,cancelPreparedOperation,operations,operationsReady,operationsLoading,operationsError,reloadOperations,checkOperation,discoveryLoading:discoveryPending,contextKeys:discovery.identity===discoveryIdentity?discovery.keys:[],contextChoices:discovery.identity===discoveryIdentity?discovery.choices:[],discoveryErrors:discovery.identity===discoveryIdentity?discovery.errors:[],selection:requested,currentModule:binding?.identity===identity?binding.module:undefined,retry:()=>setRevision(v=>v+1),client,model:binding?.model,groups,assets,sessions,group,setGroup,error,setError,loading:loading||discoveryPending,reload,canWrite:context.session?.permissions.write===true};
}
