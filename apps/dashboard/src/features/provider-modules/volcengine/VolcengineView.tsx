import { useState } from 'react';
import {ScanFace} from 'lucide-react';
import { IconFolder, IconPlus, IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

import {useMaterials} from './useMaterials';
import {Table,TableHeader,TableRow,TableHead,TableBody,TableCell} from '@/components/ui/table';
export default function VolcengineView({workspaceName, model:preferredModel, initialSection='materials'}:{workspaceName:string;model?:string;initialSection?:string}) {
  const [section,setSection]=useState(initialSection);
  const [dialog,setDialog]=useState<'group'|'edit'|'material'|'verification'|null>(null);
  const [name,setName]=useState('');
  const data=useMaterials(preferredModel);
  const [attempt,setAttempt]=useState('');
  const [busy,setBusy]=useState(false),[url,setUrl]=useState(''),[kind,setKind]=useState<'image'|'video'|'audio'>('image');
  const selected=data.groups.find(g=>g.id===data.group);
  function open(value:'group'|'edit'|'material'|'verification'){setName(value==='edit'?selected?.name??'':'');setUrl('');setAttempt(crypto.randomUUID());setDialog(value);}
  async function act(work:()=>Promise<unknown>){if(busy)return;setBusy(true);data.setError('');try{await work();await data.reload();}catch(e){data.setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
  async function save(){if(!data.client||!data.model)return;const api=data.client,model=data.model;await act(async()=>{
    if(dialog==='verification'){await api.verification.create({model,subjectName:name},{idempotencyKey:attempt});}
    else {const result=dialog==='material'?await api.assets.create({model,group_id:data.group,url,name,kind},{idempotencyKey:attempt}):dialog==='edit'&&selected?await api.groups.update(selected.id,{model,name,expected_revision:selected.revision},{idempotencyKey:attempt}):await api.groups.create({model,name},{idempotencyKey:attempt});
      if(result.data.status!=='acknowledged')data.setError('The operation is not confirmed. Check the saved status before submitting again.');
      if(result.group)data.setGroup(result.group.id);
    }setDialog(null);
  });}
  async function openVerification(id:string){await act(async()=>{const link=await data.client!.verification.link(id,data.model!);const target=new URL(link.verification_url);if(target.protocol!=='https:')throw new Error('Invalid verification link');window.open(target.href,'_blank','noopener,noreferrer');});}
  return <div className="w-full min-w-0">
    <Tabs value={section==='verification' ? 'verification':'materials'} onValueChange={setSection} className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"><TabsList><TabsTrigger value="materials">Materials</TabsTrigger><TabsTrigger value="verification">Human verification</TabsTrigger></TabsList><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" aria-label="Video model family">Seedance<IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value="seedance"><DropdownMenuRadioItem value="seedance">Seedance</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
      {data.error&&<div role="alert" className="flex items-center justify-between gap-3 py-3 text-sm"><span>{data.error}</span><Button variant="outline" onClick={data.retry}>Retry</Button></div>}
      <TabsContent value="materials"><section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" aria-label="Material group" disabled={data.loading}>{selected?.name??'Choose group'}<IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={data.group} onValueChange={data.setGroup}>{data.groups.filter(g=>g.status!=='deleted').map(g=><DropdownMenuRadioItem key={g.id} value={g.id}>{g.name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup><DropdownMenuSeparator/><DropdownMenuItem disabled={!data.client||!data.canWrite||busy} onSelect={()=>open('group')}><IconPlus size={16}/>New group</DropdownMenuItem><DropdownMenuItem disabled={!selected||!data.canWrite||busy||selected.kind==='person'} onSelect={()=>open('edit')}>Edit group</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button variant="outline" disabled={!selected||selected.status!=='ready'||!data.canWrite||busy} onClick={()=>open('material')}><IconPlus size={14}/>Add material</Button></div>
        {data.error&&!data.client?null:data.assets.length?<Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead/></TableRow></TableHeader><TableBody>{data.assets.map(a=><TableRow key={a.id}><TableCell>{a.name||'Untitled material'}</TableCell><TableCell>{a.kind}</TableCell><TableCell>{a.status}</TableCell><TableCell><Button variant="ghost" disabled={busy||!data.canWrite} onClick={()=>void act(()=>data.client!.assets.refresh(a.id,data.model!))}>Check status</Button></TableCell></TableRow>)}</TableBody></Table>:<Empty className="min-h-40 border-0 py-10"><EmptyHeader><IconFolder className="mx-auto mb-2 text-muted-foreground" size={28} stroke={1.5}/><EmptyTitle className="text-sm">{data.loading?'Loading materials…':selected?'No materials in this group':'No material groups yet'}</EmptyTitle></EmptyHeader>{!data.loading&&data.client&&data.canWrite&&!selected&&<Button variant="outline" onClick={()=>open('group')}>Create group</Button>}</Empty>}

      </section></TabsContent>
      <TabsContent value="verification" className="space-y-4"><div className="flex justify-end"><Button disabled={busy||!data.client||!data.canWrite} onClick={()=>open('verification')}><IconPlus size={16}/>Start verification</Button></div>{data.sessions.length?<Table><TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Status</TableHead><TableHead/></TableRow></TableHeader><TableBody>{data.sessions.map(v=><TableRow key={v.id}><TableCell>{v.subject_name||'Unnamed person'}</TableCell><TableCell>{v.status.replaceAll('_',' ')}</TableCell><TableCell>{['waiting_user','processing'].includes(v.status)&&<Button variant="ghost" disabled={busy} onClick={()=>void openVerification(v.id)}>Open verification</Button>}<Button variant="ghost" disabled={busy||!data.canWrite} onClick={()=>void act(()=>data.client!.verification.refresh(v.id,data.model!))}>Check status</Button></TableCell></TableRow>)}</TableBody></Table>:<Unavailable heading="Verification sessions" title="Verify a person" description="The person verifies on Volcengine’s page. A separate status check confirms the result."/>}</TabsContent>
    </Tabs>
    <Dialog open={dialog!==null} onOpenChange={value=>{if(!value&&!busy)setDialog(null);}}><DialogContent><DialogHeader><DialogTitle>{dialog==='group'?'New material group':dialog==='edit'?'Edit group':dialog==='material'?'Add material':'Human verification'}</DialogTitle><DialogDescription>{dialog==='verification'?'The person completes verification on Volcengine’s page. Niu then checks the result.':'Manage materials in this workspace.'}</DialogDescription></DialogHeader>
      <div className="space-y-4"><div className="space-y-2"><Label htmlFor="volcengine-name">{dialog==='verification'?'Person name':dialog==='material'?'Material name':'Group name'}</Label><Input id="volcengine-name" value={name} onChange={e=>setName(e.target.value)} maxLength={64}/></div>{dialog==='material'&&<><Label htmlFor="material-url">Material URL</Label><Input id="material-url" type="url" value={url} onChange={e=>setUrl(e.target.value)}/><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline">{kind}<IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuRadioGroup value={kind} onValueChange={v=>setKind(v as typeof kind)}>{['image','video','audio'].map(k=><DropdownMenuRadioItem key={k} value={k}>{k}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></>}<p className="text-sm text-muted-foreground">Workspace: {workspaceName}</p></div>
      <DialogFooter><Button variant="ghost" disabled={busy} onClick={()=>setDialog(null)}>Cancel</Button><Button disabled={busy||!name.trim()||(dialog==='material'&&!url.trim())} onClick={()=>void save()}>{busy?'Saving…':dialog==='verification'?'Start verification':dialog==='group'?'Create group':'Save'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
function Unavailable({title,description}:{heading:string;title:string;description:string}) { return <div className=""><Empty className="min-h-40 border-0 py-10"><EmptyHeader><ScanFace className="mx-auto mb-2 text-muted-foreground" size={28} strokeWidth={1.5}/><EmptyTitle className="text-sm font-medium">{title}</EmptyTitle><EmptyDescription className="max-w-sm text-sm">{description}</EmptyDescription></EmptyHeader></Empty></div>; }
