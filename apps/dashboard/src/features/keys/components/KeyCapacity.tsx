import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { keyRequest } from '../api';
import type { KeyCapacityPage, KeyCapacityRequest } from '../../../../../../sdks/javascript/src/admin';

function checked(page: KeyCapacityPage) {
  if (!page || !Array.isArray(page.data) || !Number.isSafeInteger(page.total) || page.total < 0 || !Number.isFinite(Date.parse(page.snapshot_at)) || (page.next_after !== null && (typeof page.next_after !== 'string' || !page.next_after))) throw new Error('Capacity details could not be verified.');
  for (const row of page.data) {
    if (!row.attempt_id || !row.model_alias || !row.key_name || !Number.isFinite(Date.parse(row.dispatched_at)) || (row.completed_at !== null && !Number.isFinite(Date.parse(row.completed_at))) || !['may_have_executed','confirmed_completed'].includes(row.execution) || (row.reserved_tokens !== null && !/^\d+$/.test(row.reserved_tokens))) throw new Error('Capacity details could not be verified.');
  }
  return page;
}
/** Niu-specific diagnosis, deliberately read-only: uncertain execution is not safe to replay. */
export default function KeyCapacity({ token, endpoint, kind, onInspectRequest }: { token: string; endpoint: string; kind: 'concurrency' | 'tokens'; onInspectRequest?: (attempt: string, opener: HTMLElement | null) => void }) {
  const trigger = useRef<HTMLButtonElement>(null), pending = useRef<string | null>(null);
  const [open, setOpen] = useState(false), [rows, setRows] = useState<KeyCapacityRequest[]>([]);
  const [page, setPage] = useState<KeyCapacityPage | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null), seen = useRef(new Set<string>());
  async function load(after: string | null = null) {
    request.current?.abort(); const controller = new AbortController(); request.current=controller;
    setBusy(true); setError('');
    if (!after) {setRows([]);setPage(null);seen.current.clear();}
    try {
      const result=checked(await keyRequest<KeyCapacityPage>(token,`${endpoint}/capacity?kind=${kind}&limit=50${after ? '&after='+encodeURIComponent(after):''}`,'GET',undefined,controller.signal));
      if (controller.signal.aborted) return;
      if (result.next_after && (result.next_after===after || seen.current.has(result.next_after))) throw new Error('Pagination did not advance. Refresh capacity details.');
      if (result.next_after) seen.current.add(result.next_after);
      setRows(previous=>[...new Map([...(after?previous:[]),...result.data].map(row=>[row.attempt_id,row])).values()]); setPage(result);
    } catch (cause) {if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Capacity details unavailable.');}
    finally {if(!controller.signal.aborted)setBusy(false);}
  }
  useEffect(()=>{if(open)void load();return()=>request.current?.abort();},[open,token,endpoint,kind]);
  const label=kind==='concurrency'?'Inspect unresolved requests':'Inspect token reservations';
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button ref={trigger} variant="link" className="h-auto px-0 py-1 text-xs">{label}</Button></DialogTrigger><DialogContent onCloseAutoFocus={()=>{const attempt=pending.current;pending.current=null;if(attempt)onInspectRequest?.(attempt,trigger.current);}} className="w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{kind==='concurrency'?'Unresolved requests':'Token reservations'}</DialogTitle><DialogDescription>Requests share limits across key rotations.</DialogDescription></DialogHeader>
    <p className="text-sm text-muted-foreground">{kind==='concurrency'?'These requests still occupy concurrent-request slots. Completion is unconfirmed; they may still be running.':'Unfinished requests retain their token reservations. Completed requests with unknown usage remain for 60 seconds. Known usage is shown separately in the key summary.'}</p>
    <Alert><AlertDescription>Open a request to inspect its outcome. If uncertain, ask your administrator to investigate with the Provider. Do not resend it to clear capacity. <a className="underline" href="/help/guides/request-capacity/">Capacity troubleshooting</a></AlertDescription></Alert>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{page?`${rows.length} loaded · ${page.total} matching at ${new Date(page.snapshot_at).toLocaleTimeString()}`:'Current capacity snapshot'}</p><Button variant="outline" disabled={busy} onClick={()=>void load()}>Refresh capacity</Button></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}<Button variant="link" onClick={()=>void load(page?.next_after??null)} disabled={busy}>Retry capacity</Button></AlertDescription></Alert>}
    {busy && <p role="status">Loading capacity details…</p>}
    {!busy && !error && page && rows.length===0 && <p>No matching requests remain. Refresh the key summary to see the latest capacity.</p>}
    {rows.length>0 && <Table className="w-full table-fixed" aria-label="Requests contributing capacity"><TableHeader><TableRow><TableHead className="hidden sm:table-cell">Dispatched</TableHead><TableHead>Request</TableHead><TableHead className="whitespace-normal">Recorded outcome</TableHead>{kind==='tokens'&&<TableHead className="hidden sm:table-cell whitespace-normal">Reserved tokens</TableHead>}</TableRow></TableHeader><TableBody>{rows.map(row=><TableRow key={row.attempt_id}><TableCell className="hidden sm:table-cell whitespace-normal"><time dateTime={row.dispatched_at}>{new Date(row.dispatched_at).toLocaleString()}</time></TableCell><TableCell className="whitespace-normal [overflow-wrap:anywhere]">{onInspectRequest ? <Button variant="link" className="h-auto whitespace-normal break-words px-0 text-left underline underline-offset-4" onClick={()=>{pending.current=row.attempt_id;setOpen(false);}} aria-label={`Inspect ${row.model_alias} request`}>{row.model_alias}</Button> : row.model_alias}<span className="block text-xs text-muted-foreground">{row.key_name}</span><time className="block text-xs text-muted-foreground sm:hidden" dateTime={row.dispatched_at}>{new Date(row.dispatched_at).toLocaleString()}</time></TableCell><TableCell className="whitespace-normal">{row.execution==='confirmed_completed'?'Completed · usage unavailable':'Completion unconfirmed'}{row.completed_at&&<span className="block text-xs text-muted-foreground">Recorded {new Date(row.completed_at).toLocaleString()}</span>}{kind==='tokens'&&<span className="block text-xs text-muted-foreground sm:hidden">Reserved tokens: {row.reserved_tokens===null?'Unknown':BigInt(row.reserved_tokens).toLocaleString()}</span>}</TableCell>{kind==='tokens'&&<TableCell className="hidden sm:table-cell">{row.reserved_tokens===null?'Unknown':BigInt(row.reserved_tokens).toLocaleString()}</TableCell>}</TableRow>)}</TableBody></Table>}
    {page?.next_after && <Button variant="outline" disabled={busy} onClick={()=>void load(page.next_after)}>Load more requests</Button>}
  </DialogContent></Dialog>;
}
