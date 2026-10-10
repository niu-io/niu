import { useEffect, useRef, useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { keyRequest, KeyRequestError } from '../api';
import KeyPolicyHistory from './KeyPolicyHistory';
import type { KeyIpPolicy } from '../../../../../../sdks/javascript/src/admin';

type Mode = 'all' | 'listed' | 'blocked';
const names = { all: 'Allow all sources', listed: 'Allow listed sources', blocked: 'Block all sources' };
const modeOf = (policy: KeyIpPolicy): Mode => policy.allowed_cidrs === null ? 'all' : policy.allowed_cidrs.length ? 'listed' : 'blocked';
export default function KeySourceAccess({token,endpoint,canWrite,active}:{token:string;endpoint:string;canWrite:boolean;active:boolean}) {
  const [policy,setPolicy]=useState<KeyIpPolicy|null>(null);
  const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [reload,setReload]=useState(0);
  const [open,setOpen]=useState(false);const [mode,setMode]=useState<Mode>('all');const [draft,setDraft]=useState('');
  const [saving,setSaving]=useState(false);const [conflict,setConflict]=useState(false);const [editError,setEditError]=useState('');const [notice,setNotice]=useState('');
  const pending=useRef<AbortController|null>(null);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    void keyRequest<{data:KeyIpPolicy}>(token,endpoint,'GET',undefined,controller.signal).then(result=>{
      if(controller.signal.aborted)return;
      const value=result.data;
      if((value.allowed_cidrs!==null&&(!Array.isArray(value.allowed_cidrs)||value.allowed_cidrs.some(entry=>typeof entry!=='string')))||(value.revision!==null&&!/^[1-9]\d*$/.test(value.revision)))throw new Error('The saved source policy could not be read.');
      setPolicy(value);setMode(modeOf(value));setDraft(value.allowed_cidrs?.join('\n')??'');setConflict(false);setEditError('');
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Could not load source IP access.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[token,endpoint,reload]);
  useEffect(()=>()=>pending.current?.abort(),[]);
  const entries=draft.split('\n').map(value=>value.trim()).filter(Boolean);
  const invalid=mode==='listed'&&(!entries.length||entries.length>64||entries.some(value=>value.length>64));
  const value=mode==='all'?null:mode==='blocked'?[]:entries;
  const changed=policy&&JSON.stringify(value)!==JSON.stringify(policy.allowed_cidrs);
  async function save(){
    if(!policy||!canWrite||!active||saving||loading||error||conflict||invalid||!changed)return;
    const controller=new AbortController();pending.current=controller;setSaving(true);setEditError('');
    try{
      await keyRequest(token,endpoint,'PUT',{allowed_cidrs:value,expected_revision:policy.revision??'0'},controller.signal);
      if(controller.signal.aborted)return;
      setOpen(false);setNotice('Source IP access saved.');setReload(current=>current+1);
    }catch(cause){if(!controller.signal.aborted){const stale=cause instanceof KeyRequestError&&cause.status===409;setConflict(stale);setEditError(stale?'This policy changed. Reload the saved policy before trying again.':cause instanceof Error?cause.message:'Could not save source IP access.');}}
    finally{if(!controller.signal.aborted)setSaving(false);}
  }
  return <Card><CardHeader><CardTitle>Source IP access</CardTitle><CardDescription>Control which IP addresses can use this API key.</CardDescription></CardHeader><CardContent>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{loading?'Loading…':error?'Policy unavailable':policy?policy.allowed_cidrs===null?names.all:policy.allowed_cidrs.length?`${policy.allowed_cidrs.length} allowed network${policy.allowed_cidrs.length===1?'':'s'}`:names.blocked:'Policy unavailable'}</p><div className="flex flex-wrap items-center gap-1"><KeyPolicyHistory token={token} endpoint={endpoint} label="Source IP access" field="allowed_cidrs" />{!loading&&!error&&policy&&canWrite&&active&&<Button variant="outline" onClick={()=>{setMode(modeOf(policy));setDraft(policy.allowed_cidrs?.join('\n')??'');if(!conflict)setEditError('');setNotice('');setOpen(true);}}>Edit source IP access</Button>}{error&&<Button variant="outline" onClick={()=>setReload(current=>current+1)}>Retry source IP access</Button>}</div></div>
    {policy&&!loading&&!error&&policy.allowed_cidrs?.length ? <ul className="mt-3 space-y-1 text-sm text-muted-foreground">{policy.allowed_cidrs.map(network=><li key={network} className="break-all font-mono">{network}</li>)}</ul>:null}
    {error&&<p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}{notice&&<p role="status" className="mt-2 text-sm text-muted-foreground">{notice}</p>}
    <Dialog open={open} onOpenChange={next=>{if(!saving)setOpen(next);}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Edit source IP access</DialogTitle><DialogDescription>When restricted, requests from unlisted addresses are rejected. Existing requests are not cancelled.</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={event=>{event.preventDefault();void save();}}>
      <div className="grid gap-2"><Label>Access</Label><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" className="justify-between" aria-label="Source IP access mode" disabled={saving||loading||conflict||Boolean(error)}>{names[mode]}<IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-w-[calc(100vw-2rem)]"><DropdownMenuRadioGroup value={mode} onValueChange={value=>setMode(value as Mode)}><DropdownMenuRadioItem value="all">{names.all}</DropdownMenuRadioItem><DropdownMenuRadioItem value="listed">{names.listed}</DropdownMenuRadioItem><DropdownMenuRadioItem value="blocked">{names.blocked}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
      {mode==='listed'&&<div className="grid gap-2"><Label htmlFor="key-source-networks">Allowed addresses or CIDRs</Label><Textarea id="key-source-networks" value={draft} disabled={saving||loading||conflict||Boolean(error)} onChange={event=>setDraft(event.target.value)} className="h-36 font-mono"/><p className="text-sm text-muted-foreground">One IPv4 or IPv6 address or CIDR per line. Up to 64 entries, each up to 64 characters.</p>{invalid&&<p role="alert" className="text-sm text-destructive">Enter between 1 and 64 addresses or CIDRs, each up to 64 characters.</p>}</div>}
      {mode==='blocked'&&<p className="text-sm text-destructive">All new requests using this key will be rejected.</p>}
      {editError&&<p role="alert" className="text-sm text-destructive">{editError}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={()=>setOpen(false)}>Cancel</Button>{conflict||error?<Button type="button" disabled={loading} onClick={()=>setReload(current=>current+1)}>Reload policy</Button>:<Button type="submit" disabled={saving||loading||invalid||!changed||!canWrite||!active}>{saving?'Saving…':'Save policy'}</Button>}</DialogFooter>
    </form></DialogContent></Dialog>
  </CardContent></Card>;
}
