import { useEffect, useMemo, useRef, useState } from 'react';
import type { DashboardContext } from '@/app/dashboard-context';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NiuAdminClient } from '../../../../../sdks/javascript/src/admin';
import type { VideoGenerationsSessionSummary } from '../../../../../sdks/javascript/src/generations-sessions';

/** Video section of the existing archive dialog; restores metadata only. */
export default function VideoArchivedSessions({context,open,disabled=false}:{context:DashboardContext;open:boolean;disabled?:boolean}) {
  const {token,workspace}=context;
  const identity=JSON.stringify([token,workspace?.organization_id,workspace?.id,open]);
  const current=useRef(identity);current.current=identity;
  const client=useMemo(()=>new NiuAdminClient({adminToken:token,baseURL:new URL('/api/v1',location.origin).href}),[token]);
  const [rows,setRows]=useState<VideoGenerationsSessionSummary[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  const requests=useRef<AbortController|null>(null);
  const api=workspace?client.generations({organizationId:workspace.organization_id,projectId:workspace.id}).sessions:null;
  useEffect(()=>{
    const request=new AbortController();requests.current=request;
    setRows([]);setCursor(null);setError('');setNotice('');setBusy(false);setLoading(false);
    if(!open||!workspace)return()=>request.abort();
    setLoading(true);
    void client.generations({organizationId:workspace.organization_id,projectId:workspace.id}).sessions.list({archived:true,limit:25},{signal:request.signal})
      .then(page=>{if(!request.signal.aborted){setRows(page.data);setCursor(page.next_before);}})
      .catch(()=>{if(!request.signal.aborted)setError('Archived Video sessions could not be loaded. Reload before trying again.');})
      .finally(()=>{if(!request.signal.aborted)setLoading(false);});
    return()=>request.abort();
  },[client,identity,revision]);
  async function more(){
    if(!api||!cursor||loading||busy)return;
    const at=identity;setLoading(true);setError('');
    try{
      const page=await api.list({archived:true,limit:25,before:cursor},{signal:requests.current?.signal});
      if(current.current!==at)return;
      if(page.has_more&&(!page.next_before||page.next_before===cursor))throw new Error('Pagination did not advance');
      setRows(items=>[...new Map([...items,...page.data].map(row=>[row.id,row])).values()]);setCursor(page.next_before);
    }catch{if(current.current===at)setError('More archived Video sessions could not be loaded. Reload before trying again.');}
    finally{if(current.current===at)setLoading(false);}
  }
  async function restore(row:VideoGenerationsSessionSummary){
    if(!api||busy||loading||disabled||!context.session?.permissions.write)return;
    const at=identity;setBusy(true);setError('');setNotice('');
    try{
      await api.update(row.id,{expected_revision:row.revision,title:row.title,archived:false},{signal:requests.current?.signal});
      if(current.current!==at)return;
      setRows(items=>items.filter(item=>item.id!==row.id));setNotice('Video session restored.');
      window.dispatchEvent(new Event('niu:video-session-changed'));
    }catch{if(current.current===at)setError('The Video session could not be restored. Reload before trying again; another change may have been saved.');}
    finally{if(current.current===at)setBusy(false);}
  }
  if(!open)return null;
  return <section aria-label="Archived Video sessions" className="mt-4 min-w-0">
    <h3 className="mb-3 text-sm font-medium">Video sessions</h3>
    {error&&<div className="mb-3"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="ghost" disabled={loading||busy} onClick={()=>setRevision(value=>value+1)}>Reload Video archive</Button></div>}
    {notice&&<p role="status" className="mb-3 text-sm">{notice}</p>}
    {!loading&&!error&&!rows.length&&<p className="text-sm text-muted-foreground">No archived Video sessions</p>}
    {rows.length>0&&<Table className="table-fixed"><TableHeader><TableRow><TableHead>Session</TableHead><TableHead className="w-32 text-right">Action</TableHead></TableRow></TableHeader><TableBody>{rows.map(row=><TableRow key={row.id}><TableCell className="whitespace-normal break-words">{row.title}</TableCell><TableCell className="text-right"><Button variant="ghost" disabled={busy||loading||disabled||!context.session?.permissions.write} onClick={()=>void restore(row)} aria-label={`Restore ${row.title}`}>Restore</Button></TableCell></TableRow>)}</TableBody></Table>}
    {loading&&<p role="status" className="text-sm">Loading Video sessions…</p>}
    {cursor&&<Button variant="ghost" disabled={loading||busy} onClick={()=>void more()}>Load more Video sessions</Button>}
  </section>;
}
