import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import type {PlatformUnitInfo} from '../lib/money';
export type BillingMode='currency'|'credits';
type CurrencyState={
  currency:string;
  billingMode:BillingMode;
  unit:PlatformUnitInfo|null;
  error:string;
  ready?:boolean;
  failed?:boolean;
  reload:()=>void;
};
// No guessed currency while durable platform configuration is unavailable.
const CurrencyContext=createContext<CurrencyState>({
  currency:'',
  billingMode:'currency',
  unit:null,
  error:'',
  ready:false,
  reload:()=>{},
});
export function usePlatformCurrency(){return useContext(CurrencyContext);}
export function PlatformCurrencyProvider({children}:{children:ReactNode}){
 const [failed,setFailed]=useState(false);
 const [ready,setReady]=useState(false);
 const [currency,setCurrency]=useState('');
 const [billingMode,setBillingMode]=useState<BillingMode>('currency');
 const [unit,setUnit]=useState<PlatformUnitInfo|null>(null);
 const [error,setError]=useState('');
 const [revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();setError('');setReady(false);setFailed(false);
 void fetch('/v1/currency',{signal:controller.signal}).then(async response=>{
  if(!response.ok)throw new Error('Platform currency is unavailable.');
  const body=await response.json();
  const value=body?.data?.currency;
  if(value!==null && (typeof value!=='string'|| !/^[A-Z]{3}$/.test(value)))throw new Error('Invalid platform currency.');
  const rawMode=body?.data?.billing_mode;
  const nextMode:BillingMode=rawMode==='credits'?'credits':'currency';
  const rawUnit=body?.data?.unit;
  const nextUnit:PlatformUnitInfo|null=rawUnit&&typeof rawUnit==='object'&&typeof rawUnit.name==='string'
   ?{
     revision:String(rawUnit.revision??'1'),
     name:rawUnit.name,
     display_precision:typeof rawUnit.display_precision==='number'?rawUnit.display_precision:2,
     atoms_per_unit:String(rawUnit.atoms_per_unit??'1000000000'),
   }
   :null;
  if(!controller.signal.aborted){
   setCurrency(value??'');
   setBillingMode(nextMode);
   setUnit(nextUnit);
   if(!value&&nextMode==='currency')setError('Configure the platform currency in Admin → Settings.');
  }
 }).catch(cause=>{if(!controller.signal.aborted){setFailed(true);setCurrency('');setError(cause instanceof Error?cause.message:'Platform currency is unavailable.');}}).finally(()=>{if(!controller.signal.aborted)setReady(true);});
 return ()=>controller.abort();},[revision]);
 return <CurrencyContext.Provider value={{currency,billingMode,unit,error,ready,failed,reload:()=>setRevision(value=>value+1)}}>{children}</CurrencyContext.Provider>;
}
