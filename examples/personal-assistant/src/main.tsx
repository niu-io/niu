import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Label } from './components/ui/label';
import sample from '../fixtures/meeting.txt?raw';
import './style.css';

type Work = {id:string;title:string;notes:string;goal:string;output:string;status:string;created:string};
async function api(path:string, options?:RequestInit) {
  const response = await fetch(`/api/${path}`, options);
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed'),{work:data.work});
  return data;
}
function App() {
  const [config,setConfig] = useState<{ready:boolean;model:string|null;review_url:string}|null>(null);
  const [items,setItems] = useState<Work[]>([]);
  const [title,setTitle] = useState('Meeting follow-up');
  const [notes,setNotes] = useState('');
  const [goal,setGoal] = useState('Create a prioritized action plan and a follow-up message I can edit.');
  const [work,setWork] = useState<Work|null>(null);
  const [output,setOutput] = useState('');
  const [busy,setBusy] = useState(false);
  const [dirty,setDirty] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const refresh = async()=>setItems(await api('work'));
  useEffect(()=>{Promise.all([api('config').then(setConfig),refresh()]).catch(e=>setError(e.message));},[]);
  const canLeave = ()=>{if(dirty){setError('Save or discard your output edits before opening or generating other work.');return false;}return true;};
  async function open(id:string) {
    if (!canLeave()) return;
    try { const row=await api(`work/${id}`);setWork(row);setTitle(row.title);setNotes(row.notes);setGoal(row.goal);setOutput(row.output);setDirty(false);setMessage('');setError(''); } catch(e:any){setError(e.message);}
  }
  async function generate(e:React.FormEvent) {
    e.preventDefault();if(!canLeave())return;
    setBusy(true);setError('');setMessage('Generating with Niu. This request may incur charges.');setWork(null);setOutput('');setDirty(false);
    try {
      const result=await api('work',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,notes,goal})});
      setWork(result.work);setOutput(result.work.output);setMessage('Result saved. Review and edit the draft before using it.');
    } catch(e:any) {setError(e.message);setMessage('');if(e.work)setWork(e.work);}
    finally {setBusy(false);await refresh().catch(()=>setError('Could not refresh saved work. Reload to check its state.'));}
  }
  async function save() {
    setBusy(true);setError('');
    try {const row=await api(`work/${work!.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({output})});setWork(row);setDirty(false);setMessage('Changes saved.');}
    catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <div className="app">
    <header><div><p className="eyebrow">Built with Niu · source example</p><h1>Personal assistant</h1></div>{config?.review_url && <Button asChild variant="outline"><a href={config.review_url} target="_blank" rel="noreferrer">Review in Niu</a></Button>}</header>
    <p className="intro">Turn your notes into an action plan and a follow-up draft. Your notes and saved results stay in this app's local database.</p>
    {!config ? <p role="status">Checking server configuration…</p> : !config.ready ? <p role="status" className="notice">Ask your coding agent to configure the server's Niu key and model, then restart this app. Sample notes can be loaded now; generation requires the connection.</p> : <p className="meta">Model: {config.model}. Each generation uses your Niu key. Review charges in Niu Logs; this app does not fetch billing.</p>}
    <div className="layout"><aside><h2>Saved work</h2>{items.length===0?<p className="meta">Your first saved result will appear here.</p>:items.map(item=><Button key={item.id} variant={work?.id===item.id?'secondary':'ghost'} className="saved-item" disabled={busy} onClick={()=>open(item.id)}><span>{item.title}</span><small>{item.status} · {new Date(item.created).toLocaleString()}</small></Button>)}</aside>
    <main><form onSubmit={generate}><div className="section-heading"><h2>What do you need?</h2><Button type="button" variant="ghost" disabled={busy} onClick={()=>{setNotes(sample);setTitle('Meeting follow-up');}}>Load sample notes</Button></div>
      <Label htmlFor="title">Title</Label><Input id="title" maxLength={100} value={title} onChange={e=>setTitle(e.target.value)} required disabled={busy}/>
      <Label htmlFor="goal">Desired result</Label><Input id="goal" maxLength={1000} value={goal} onChange={e=>setGoal(e.target.value)} required disabled={busy}/>
      <Label htmlFor="notes">Notes</Label><Textarea id="notes" maxLength={12000} rows={9} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Paste meeting notes or load the sample." required disabled={busy}/>
      <div className="actions"><Button type="submit" disabled={busy||!config?.ready||!notes.trim()||!title.trim()||!goal.trim()}>{busy?'Working…':'Generate plan and draft'}</Button><span className="meta">One request · no automatic retries</span></div>
    </form>
    {error&&<p role="alert" className="error">{error}</p>}<p role="status" className="meta">{message}</p>
    <section aria-labelledby="result-title"><div className="section-heading"><h2 id="result-title">Plan and draft</h2>{work?.status==='complete'&&<div className="result-actions">{dirty&&<Button variant="ghost" disabled={busy} onClick={()=>{setOutput(work.output);setDirty(false);setError('');setMessage('Unsaved edits discarded.');outputRef.current?.focus();}}>Discard edits</Button>}<Button variant="outline" onClick={save} disabled={busy||!dirty}>{dirty?'Save changes':'Saved'}</Button></div>}</div>
      {work?.status==='complete'?<><Label htmlFor="output">Edit your result</Label><Textarea ref={outputRef} id="output" rows={18} value={output} onChange={e=>{setOutput(e.target.value);setDirty(true);}} disabled={busy} maxLength={30000}/><p className="meta">{dirty?'Unsaved changes.':'Saved to the local database.'} No message has been sent.</p></>:<p className="empty">{busy?'Waiting for the model response…':work?`This attempt is ${work.status}. Review Niu Logs before generating again.`:'Generate a result or open saved work to review it here.'}</p>}
    </section></main></div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
