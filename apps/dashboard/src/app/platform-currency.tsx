import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
type CurrencyState={currency:string;error:string;ready?:boolean;failed?:boolean;reload:()=>void};
// No guessed currency while durable platform configuration is unavailable.
const CurrencyContext=createContext<CurrencyState>({currency:'',error:'',ready:false,reload:()=>{}});
export function usePlatformCurrency(){return useContext(CurrencyContext);}
export function PlatformCurrencyProvider({children}:{children:ReactNode}){
 const [failed,setFailed]=useState(false);
 const [ready,setReady]=useState(false);const [currency,setCurrency]=useState('');const [error,setError]=useState('');const [revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();setError('');setReady(false);setFailed(false);
 void fetch('/v1/currency',{signal:controller.signal}).then(async response=>{
  if(!response.ok)throw new Error('Platform currency is unavailable.');
  const body=await response.json();const value=body?.data?.currency;
  if(value!==null && (typeof value!=='string'|| !/^[A-Z]{3}$/.test(value)))throw new Error('Invalid platform currency.');
  if(!controller.signal.aborted){setCurrency(value??'');if(!value)setError('Configure the platform currency in Admin → Settings.');}
 }).catch(cause=>{if(!controller.signal.aborted){setFailed(true);setCurrency('');setError(cause instanceof Error?cause.message:'Platform currency is unavailable.');}}).finally(()=>{if(!controller.signal.aborted)setReady(true);});
 return ()=>controller.abort();},[revision]);
 return <CurrencyContext.Provider value={{currency,error,ready,failed,reload:()=>setRevision(value=>value+1)}}>{children}</CurrencyContext.Provider>;
}
