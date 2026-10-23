import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { request } from '@/features/providers/api';
import { amountFromNanos } from '@/lib/money';
import type { CustomerBalanceGiftCorrectionInput, IssuedCustomerBalanceGrant } from '@niu-io/sdk/admin';
import type { Editor } from './page';

const base=(organization:string,currency:string)=>`/api/v1/organizations/${encodeURIComponent(organization)}/billing/accounts/${currency}/grants`;
const date=(value:string)=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC',hourCycle:'h23'}).format(new Date(value));
const amount=(row:IssuedCustomerBalanceGrant)=>`${amountFromNanos(row.amount_nanos)} ${row.currency}`;

/** All original grants, including those issued before preparation existed. */
export function IssuedGiftHistory({token,organization,currency,onCorrect}:{token:string;organization:string;currency:string;onCorrect:(row:IssuedCustomerBalanceGrant)=>void}) {
  const [rows,setRows]=useState<IssuedCustomerBalanceGrant[]>([]),[cursor,setCursor]=useState<string|null>(null);
  const [loading,setLoading]=useState(false),[error,setError]=useState('');
  const active=useRef<AbortController|null>(null);
  async function load(before?:string){
    active.current?.abort();const controller=new AbortController();active.current=controller;
    setLoading(true);setError('');
    try{
      const page=await request<{data:IssuedCustomerBalanceGrant[];next_before:string|null}>(token,base(organization,currency)+'/issued?limit=25'+(before?'&before='+encodeURIComponent(before):''),'GET',undefined,controller.signal);
      if(controller.signal.aborted)return;
      if(!Array.isArray(page.data)||(page.next_before!==null&&page.next_before===before))throw new Error('Gift history did not advance.');
      setRows(current=>before?[...new Map([...current,...page.data].map(row=>[row.id,row])).values()]:page.data);setCursor(page.next_before);
    }catch(failure){if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'Issued gifts unavailable.');}
    finally{if(!controller.signal.aborted)setLoading(false);}
  }
  useEffect(()=>{void load();return()=>active.current?.abort();},[token,organization,currency]);
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">Original gifts remain in history. Corrections remove a wholly unused gift through a separate audited adjustment.</p>
    <Button variant="outline" disabled={loading} onClick={()=>void load()}>Refresh issued gifts</Button>
    {loading&&!rows.length&&<p role="status">Loading issued gifts…</p>}
    {error&&<Alert variant="destructive"><AlertDescription>{error} Refresh issued gifts before another action.</AlertDescription></Alert>}
    {!loading&&!error&&!rows.length&&<p>No issued gifts in this currency.</p>}
    {!!rows.length&&<Table aria-label="Issued noncash gifts"><TableHeader><TableRow><TableHead>Issued (UTC)</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Gift amount</TableHead><TableHead>State</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map(row=><TableRow key={row.id}><TableCell className="whitespace-nowrap">{date(row.created_at)}</TableCell><TableCell className="min-w-44 max-w-64 whitespace-normal break-words">{row.reason}</TableCell><TableCell className="whitespace-nowrap text-right tabular-nums">{amount(row)}</TableCell><TableCell><Badge variant="outline">{row.correction?'Corrected':'Issued'}</Badge></TableCell><TableCell><Button variant="outline" disabled={loading||!!error} onClick={()=>onCorrect(row)}>{row.correction?'View correction':'Correct unused gift'}</Button></TableCell></TableRow>)}</TableBody></Table>}
    {cursor&&<Button variant="outline" disabled={loading||!!error} onClick={()=>void load(cursor)}>More issued gifts</Button>}
  </div>;
}

/** An original gift can be corrected once; unknown responses retain exact input. */
export function GiftCorrectionEditor({token,editor,onClose,onCorrected}:{token:string;editor:Editor&{gift:IssuedCustomerBalanceGrant};onClose:()=>void;onCorrected:()=>void}) {
  const [gift,setGift]=useState(editor.gift),[reason,setReason]=useState('');
  const [pending,setPending]=useState(false),[verified,setVerified]=useState(false),[error,setError]=useState('');
  const [attempt,setAttempt]=useState<CustomerBalanceGiftCorrectionInput|null>(null);
  const key=useRef(crypto.randomUUID()),active=useRef<AbortController|null>(null);
  const endpoint=base(editor.company.organization_id,gift.currency)+'/'+encodeURIComponent(gift.id);
  async function refresh(){
    active.current?.abort();const controller=new AbortController();active.current=controller;setPending(true);setError('');
    try{
      const result=await request<{data:IssuedCustomerBalanceGrant}>(token,endpoint,'GET',undefined,controller.signal);
      if(controller.signal.aborted)return;
      if(result.data.id!==editor.gift.id||result.data.amount_nanos!==editor.gift.amount_nanos||result.data.currency!==editor.gift.currency)throw new Error('Original gift differs from the saved record.');
      setGift(result.data);setVerified(true);
      if(result.data.correction)onCorrected();
    }catch(failure){if(!controller.signal.aborted){setVerified(false);setError((failure instanceof Error?failure.message:'Saved status unavailable.')+' A missing correction does not prove an in-flight request failed.');}}
    finally{if(!controller.signal.aborted)setPending(false);}
  }
  useEffect(()=>{void refresh();return()=>active.current?.abort();},[token,endpoint]);
  async function submit(event:FormEvent){
    event.preventDefault();if(pending||!verified||gift.correction)return;
    let input=attempt;
    if(!input){const note=reason.trim();if(!note||[...note].length>500||/[\u0000-\u001f\u007f-\u009f]/.test(note)){setError('Enter a single-line correction reason of up to 500 characters.');return;}input={amount_nanos:gift.amount_nanos,reason:note,idempotency_key:key.current};setAttempt(input);}
    setPending(true);setError('');
    try{
      await request<{data:{id:string}}>(token,endpoint+'/correction','POST',input);
      const result=await request<{data:IssuedCustomerBalanceGrant}>(token,endpoint);
      if(!result.data.correction)throw new Error('The correction could not be confirmed.');
      setGift(result.data);onCorrected();
    }catch(failure){setError((failure instanceof Error?failure.message:'Correction could not be confirmed.')+' Check saved status. Retry only this same correction; do not create a new adjustment to recover an uncertain response.');}
    finally{setPending(false);}
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!pending)onClose();}}><DialogContent className="w-[calc(100vw-2rem)] max-h-[90dvh] overflow-y-auto" showCloseButton={!pending}><DialogHeader><DialogTitle>{gift.correction?'Noncash gift correction':'Correct unused noncash gift'}</DialogTitle><DialogDescription>{editor.company.organization_name||'Unnamed company'} · {gift.currency}. The original gift remains in history.</DialogDescription></DialogHeader>
    <dl className="space-y-2 text-sm"><div><dt className="text-muted-foreground">Original gift</dt><dd className="font-medium tabular-nums">{amount(gift)}</dd></div><div><dt className="text-muted-foreground">Issued (UTC)</dt><dd>{date(gift.created_at)}</dd></div><div><dt className="text-muted-foreground">Original reason</dt><dd className="break-words">{gift.reason}</dd></div></dl>
    {gift.correction?<div className="space-y-3"><p role="status">Correction recorded. The full unused gift was removed.</p><p className="break-words text-sm">{gift.correction.reason}</p><p className="text-sm text-muted-foreground">{gift.correction.actor_label} · {date(gift.correction.created_at)} UTC</p><p className="text-sm text-muted-foreground">No cash refund or revenue adjustment was recorded. Approved credit is unchanged.</p></div>:<form className="space-y-4" onSubmit={event=>void submit(event)}><p className="text-sm text-muted-foreground">Removes the full original gift. Accounts with paid request history, consumption, refunds, open request liabilities or uncertain funding sources cannot use this correction. No cash is transferred and approved credit stays unchanged.</p><div className="space-y-2"><Label htmlFor="gift-correction-reason">Correction reason</Label><Input id="gift-correction-reason" maxLength={500} value={attempt?.reason??reason} disabled={pending||!!attempt||!verified} onChange={event=>setReason(event.target.value)}/></div>{error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button><Button type="button" variant="outline" disabled={pending} onClick={()=>void refresh()}>Check saved status</Button><Button type="submit" variant="destructive" disabled={pending||!verified||(!attempt&&!reason.trim())}>{pending?'Confirming…':attempt?'Retry same correction':'Remove unused gift'}</Button></div></form>}
    {gift.correction&&<Button variant="outline" disabled={pending} onClick={onClose}>Close</Button>}
    {gift.correction&&error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
  </DialogContent></Dialog>;
}
