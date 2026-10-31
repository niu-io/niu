import { useEffect, useRef, useState } from 'react';

export type ChatDraft = {
  sessionId: string | null;
  prompt: string;
  models: string[];
  attachments: Array<{name:string;type:string;content:string}>;
  settings: {systemPrompt:string;maxTokens:number;temperature:number;logPayloads:boolean};
};
type Snapshot = {payload:ChatDraft|null;revision:number};
type DraftState = {ready:boolean;saving:boolean;error:string;conflict:boolean};
function snapshot(value:unknown):Snapshot {
  const data=(value as {data?:Snapshot})?.data;
  if (!data || !Number.isSafeInteger(data.revision) || data.revision<0) throw new Error('Invalid draft response');
  const p=data.payload;
  if (p !== null && (!p || typeof p.prompt!=='string' || (p.sessionId!==null && typeof p.sessionId!=='string')
    || !Array.isArray(p.models) || p.models.length>4 || !p.models.every(m=>typeof m==='string')
    || !Array.isArray(p.attachments) || p.attachments.length>4 || !p.attachments.every(a=>a && typeof a.name==='string' && ['image','text'].includes(a.type) && typeof a.content==='string')
    || !p.settings || typeof p.settings.systemPrompt!=='string' || !Number.isSafeInteger(p.settings.maxTokens) || p.settings.maxTokens<=0
    || !Number.isFinite(p.settings.temperature) || p.settings.temperature<0 || p.settings.temperature>2 || typeof p.settings.logPayloads!=='boolean')) throw new Error('Invalid draft response');
  return {revision:data.revision,payload:p===null?null:{sessionId:p.sessionId,prompt:p.prompt,models:p.models,
    attachments:p.attachments.map(a=>({name:a.name,type:a.type,content:a.content})),
    settings:{systemPrompt:p.settings.systemPrompt,maxTokens:p.settings.maxTokens,temperature:p.settings.temperature,logPayloads:p.settings.logPayloads}}};
}

/** Backend-owned composer state. No browser storage participates in persistence. */
export function useChatDraft({token,endpoint,identity,enabled,value,restore}: {
  token:string;endpoint:string;identity:string;enabled:boolean;value:ChatDraft;restore:(draft:ChatDraft)=>void;
}) {
  const current=useRef(value);current.current=value;
  const onRestore=useRef(restore);onRestore.current=restore;
  const [state,setState]=useState<DraftState>({ready:false,saving:false,error:'',conflict:false});
  const [load,setLoad]=useState(0);
  const control=useRef<{flush:()=>Promise<boolean>;retry:()=>void}|null>(null);
  const serialized=JSON.stringify(value);
  const liveIdentity=useRef(identity);liveIdentity.current=identity;
  useEffect(()=>{
    if (!enabled) {control.current=null;setState({ready:false,saving:false,error:'',conflict:false});return;}
    const controller=new AbortController();
    let ready=false,revision=0,confirmed='',failed=false;
    let active:Promise<boolean>|null=null;
    const valid=()=>!controller.signal.aborted && liveIdentity.current===identity;
    const flush=():Promise<boolean>=>{
      if (!ready || failed || !valid()) return Promise.resolve(false);
      if (active) return active;
      active=(async()=>{
        while(valid()) {
          const payload=current.current,body=JSON.stringify(payload);
          if (body===confirmed) return true;
          if (!Number.isSafeInteger(payload.settings.maxTokens) || payload.settings.maxTokens<=0 || !Number.isFinite(payload.settings.temperature) || payload.settings.temperature<0 || payload.settings.temperature>2) return false;
          setState({ready:true,saving:true,error:'',conflict:false});
          try {
            const response=await fetch(endpoint,{method:'PUT',cache:'no-store',signal:controller.signal,
              headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({expected_revision:revision,payload})});
            if (!response.ok) {
              failed=true;
              if (valid()) setState({ready:true,saving:false,error:response.status===409?'This draft changed in another tab. Load the saved draft before continuing.':'Could not save your draft. Your changes are still here.',conflict:response.status===409});
              return false;
            }
            const saved=snapshot(await response.json());
            if (!valid()) return false;
            if (saved.revision!==revision+1 || JSON.stringify(saved.payload)!==body) throw new Error('Unconfirmed draft');
            revision=saved.revision;confirmed=body;
          } catch {
            failed=true;
            if (valid()) setState({ready:true,saving:false,error:'Could not confirm your saved draft. Load the saved draft before continuing.',conflict:true});
            return false;
          }
        }
        return false;
      })().finally(()=>{active=null;if(valid()&&!failed)setState({ready:true,saving:false,error:'',conflict:false});});
      return active;
    };
    control.current={flush,retry:()=>{failed=false;void flush();}};
    setState({ready:false,saving:false,error:'',conflict:false});
    void fetch(endpoint,{headers:{authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error('Draft read failed');return snapshot(await response.json());})
      .then(saved=>{
        if (!valid()) return;
        revision=saved.revision;
        if(saved.payload) {confirmed=JSON.stringify(saved.payload);onRestore.current(saved.payload);}
        else confirmed=JSON.stringify(current.current);
        ready=true;setState({ready:true,saving:false,error:'',conflict:false});
      }).catch(()=>{if(valid())setState({ready:false,saving:false,error:'Could not load your saved draft.',conflict:false});});
    return ()=>{controller.abort();control.current=null;};
  },[token,endpoint,identity,enabled,load]);
  useEffect(()=>{
    if(!state.ready || state.error)return;
    const timer=setTimeout(()=>void control.current?.flush(),500);
    return ()=>clearTimeout(timer);
  },[serialized,state.ready,state.error]);
  return {...state,flush:(next?:ChatDraft)=>{if(next)current.current=next;return control.current?.flush()??Promise.resolve(false);},retry:()=>{
    if(!state.ready || state.conflict)setLoad(value=>value+1);else control.current?.retry();
  }};
}
