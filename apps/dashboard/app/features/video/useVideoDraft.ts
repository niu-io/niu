import {useEffect,useRef,useState} from 'react';
import {NiuAPIError} from '@niu-io/sdk';
import type {NiuAdminClient,TenantScope,VideoComposerDraftPayload,VideoComposerDraftState} from '@niu-io/sdk/admin';

type Client=Pick<NiuAdminClient,'getVideoComposerDraft'|'saveVideoComposerDraft'>;
export type VideoDraftTicket={identity:string;revision:number;payload:VideoComposerDraftPayload};
type State={identity:string;ready:boolean;saving:boolean;error:string;conflict:boolean;confirmed:string;revision:number};
function serialized(value:unknown):string {
  const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==='object'
    ? Object.fromEntries(Object.entries(value).sort(([left],[right])=>left.localeCompare(right)).map(([key,item])=>[key,canonical(item)])):value;
  return JSON.stringify(canonical(value));
}
function checked(result:VideoComposerDraftState){
  const data=result?.data;
  if(!data||!Number.isSafeInteger(data.revision)||data.revision<0||!['empty','retained','expired'].includes(data.content_state)
    ||(data.expires_at_ms!==null&&(typeof data.expires_at_ms!=='string'||!/^\d+$/.test(data.expires_at_ms)))
    ||(data.payload!==null&&(!data.payload||typeof data.payload.prompt!=='string'||!data.payload.controls||!Array.isArray(data.payload.references))))throw new Error('Invalid saved Video draft');
  if((data.content_state==='retained')!==(data.payload!==null))throw new Error('Invalid saved Video draft');
  return data;
}
/** Backend-owned mutable composition. No browser storage or immutable intents. */
export function useVideoDraft({client,scope,identity,contextIdentity,enabled,canWrite,edited,paused,value,restore}:{
  client:Client|null;scope:TenantScope|null;identity:string;contextIdentity:string;enabled:boolean;canWrite:boolean;edited:boolean;paused:boolean;
  value:VideoComposerDraftPayload;restore:(payload:VideoComposerDraftPayload|null)=>void;
}){
  const live=useRef({identity,contextIdentity,value});live.current={identity,contextIdentity,value};
  const onRestore=useRef(restore);onRestore.current=restore;
  const initial:State={identity,ready:false,saving:false,error:'',conflict:false,confirmed:'',revision:0};
  const [state,setState]=useState(initial),[reload,setReload]=useState(0);
  const write=useRef<AbortController|null>(null);
  const control=useRef<(()=>Promise<VideoDraftTicket|null>)|null>(null);
  const previousContext=useRef(contextIdentity);
  useEffect(()=>{
    if(previousContext.current===contextIdentity)return;
    previousContext.current=contextIdentity;
    // A request already accepted by the backend cannot be undone by abort.
    // Preserve the latest input and require an explicit authoritative reload.
    write.current?.abort();
  },[contextIdentity]);
  useEffect(()=>{
    if(!enabled||!client||!scope){control.current=null;setState({...initial,identity});return;}
    const controller=new AbortController();
    let ready=false,failed=false,revision=0,confirmed='';
    let active:Promise<VideoDraftTicket|null>|null=null;
    const valid=()=>!controller.signal.aborted&&live.current.identity===identity;
    const flush=():Promise<VideoDraftTicket|null>=>{
      if(!ready||failed||!valid()||!canWrite)return Promise.resolve(null);
      if(active)return active;
      active=(async()=>{
        while(valid()){
          const payload=live.current.value,body=serialized(payload);
          if(body===confirmed)return {identity,revision,payload};
          const pending=new AbortController();write.current=pending;
          const context=live.current.contextIdentity;
          const abort=()=>pending.abort();controller.signal.addEventListener('abort',abort,{once:true});
          setState({identity,ready:true,saving:true,error:'',conflict:false,confirmed,revision});
          try{
            const saved=checked(await client.saveVideoComposerDraft(scope,payload,revision,{signal:pending.signal}));
            if(!valid())return null;
            if(pending.signal.aborted||context!==live.current.contextIdentity)throw new Error('Draft context changed');
            if(saved.revision!==revision+1||serialized(saved.payload)!==body)throw new Error('Unconfirmed draft');
            revision=saved.revision;confirmed=body;
          }catch(error){
            failed=true;
            if(valid())setState({identity,ready:true,saving:false,error:error instanceof NiuAPIError&&error.status===409
              ? 'This Video draft changed in another tab. Your input is still here. Load the saved draft before continuing.'
              : 'Could not confirm your saved Video draft. Your input is still here. Load the saved draft before continuing.',conflict:true,confirmed,revision});
            return null;
          }finally{controller.signal.removeEventListener('abort',abort);if(write.current===pending)write.current=null;}
        }
        return null;
      })().finally(()=>{active=null;if(valid()&&!failed)setState({identity,ready:true,saving:false,error:'',conflict:false,confirmed,revision});});
      return active;
    };
    control.current=flush;
    setState({...initial,identity});
    void client.getVideoComposerDraft(scope,{signal:controller.signal}).then(checked).then(saved=>{
      if(!valid())return;
      revision=saved.revision;
      // Restore runs before readiness permits defaults or autosave.
      onRestore.current(saved.payload);
      confirmed=saved.payload===null?'':serialized(saved.payload);
      ready=true;setState({identity,ready:true,saving:false,error:'',conflict:false,confirmed,revision});
    }).catch(()=>{if(valid())setState({...initial,identity,error:'Could not load your saved Video draft. Your input is still here.'});});
    return()=>{controller.abort();write.current?.abort();control.current=null;};
  // Scope belongs to identity; value/restore are live refs, not load dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[client,scope?.organizationId,scope?.projectId,identity,enabled,canWrite,reload]);
  const own=state.identity===identity?state:initial;
  const body=serialized(value);
  const dirty=enabled&&own.ready&&(edited||own.confirmed!=='')&&body!==own.confirmed;
  useEffect(()=>{
    if(!dirty||own.error||!canWrite||paused)return;
    const timer=setTimeout(()=>void control.current?.(),500);return()=>clearTimeout(timer);
  },[body,dirty,own.error,canWrite,paused]);
  return {...own,dirty,flush:()=>control.current?.()??Promise.resolve(null),reload:()=>setReload(current=>current+1),
    clearMatching:async(ticket:VideoDraftTicket)=>{
      if(!client||!scope||ticket.identity!==live.current.identity)return false;
      try{
        const saved=checked(await client.saveVideoComposerDraft(scope,null,ticket.revision));
        if(saved.payload!==null||saved.revision!==ticket.revision+1)throw new Error('Unconfirmed draft clear');
        return true;
      }catch{return false;}
    }};
}
