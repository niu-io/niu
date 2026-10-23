import {useEffect, useState} from 'react';

type State = {scope:string;retainContent:boolean;status:'loading'|'ready'|'blocked'|'error'; reason:string|null};
/** Fail closed, refresh after setup changes, and never retain stale readiness on failure. */
export function usePaymentReadiness(token:string, organization?:string|null) {
  const enabled=Boolean(token);
  const scope=JSON.stringify([token,organization??null]);
  const [state,setState]=useState<State>({scope:'',retainContent:false,status:'loading',reason:null});
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    if(!enabled) {setState({scope:'',retainContent:false,status:'loading',reason:null});return;}
    let alive=true;
    let pending:AbortController|undefined;
    const refresh=async()=>{
      pending?.abort();const controller=new AbortController();pending=controller;
      try {
        const response=await fetch('/api/v1/payments/readiness'+(organization ? '?organization='+encodeURIComponent(organization) : ''),{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error('Readiness unavailable');
        const {data}=await response.json();
        if(typeof data?.ready!=='boolean'||(data.reason!==null&&typeof data.reason!=='string'))throw new Error('Invalid readiness');
        if(alive&&!controller.signal.aborted)setState({scope,retainContent:data.ready,status:data.ready?'ready':'blocked',reason:data.reason});
      } catch {
        if(alive&&!controller.signal.aborted)setState(previous=>({scope,retainContent:previous.scope===scope&&previous.retainContent,status:'error',reason:null}));
      }
    };
    void refresh();const timer=window.setInterval(()=>void refresh(),10000);
    window.addEventListener('niu:payment-mode',refresh);
    window.addEventListener('focus',refresh);
    window.addEventListener('online',refresh);
    return()=>{alive=false;pending?.abort();clearInterval(timer);window.removeEventListener('niu:payment-mode',refresh);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);};
  },[enabled,token,organization,scope,revision]);
  return {...(state.scope===scope ? state : {retainContent:false,status:'loading' as const,reason:null}),retry:()=>{setState(previous=>({...previous,status:'loading',reason:null}));setRevision(value=>value+1);}};
}
