import { useEffect,useRef,useState } from 'react';
import {ScanFace} from 'lucide-react';
import { IconFolder, IconPlus, IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

import type { MediaAssetOperationInput } from '../../../../../../sdks/javascript/src/media-assets';
import { NiuAPIError } from '../../../../../../sdks/javascript/src/index';
import {useMaterials,type NativeMaterialsContext} from './useMaterials';
import {Table,TableHeader,TableRow,TableHead,TableBody,TableCell} from '@/components/ui/table';
export default function VolcengineView({workspaceName, model:preferredModel, nativeContext, selection, onContextChange, initialSection='materials'}:{workspaceName:string;model?:string;nativeContext?:NativeMaterialsContext;selection?:NativeMaterialsContext;onContextChange?:(selection:NativeMaterialsContext)=>void;initialSection?:string}) {
  const [section,setSection]=useState(initialSection);
  const [dialog,setDialog]=useState<'group'|'edit'|'material'|'verification'|null>(null);
  const [name,setName]=useState('');
  const [attempt,setAttempt]=useState('');
  const [dialogError,setDialogError]=useState('');
  const [pendingOperation,setPendingOperation]=useState<{id:string|null;verification:boolean;status:string;form:'group'|'edit'|'material'|'verification'}|null>(null);
  const [busy,setBusy]=useState(false),[url,setUrl]=useState(''),[kind,setKind]=useState<'image'|'video'|'audio'>('image');
  const contextLocked=busy||dialog!==null||pendingOperation!==null;
  const retainedSelection=useRef(selection);
  if(!contextLocked)retainedSelection.current=selection;
  const data=useMaterials(preferredModel,nativeContext,retainedSelection.current);
  const chosenKey=data.selection?.keyId??'',chosenModel=data.selection?.model??'';
  const choices=data.contextChoices.filter(choice=>choice.keyId===chosenKey);
  const chosen=choices.find(choice=>choice.module.model_alias===chosenModel);
  const selected=data.groups.find(g=>g.id===data.group);
  const [visibleOperations,setVisibleOperations]=useState(25);
  useEffect(()=>setVisibleOperations(25),[data.client,data.model]);
  const savedUnconfirmed=data.operations.some(operation=>operation.status==='prepared'||operation.status==='unknown');
  const materialWritesLocked=busy||pendingOperation!==null||!data.operationsReady||data.operationsLoading||!!data.operationsError||savedUnconfirmed;
  const operationLabels={create_group:'Create group',update_group:'Edit group',delete_group:'Delete group',create_asset:'Add material',rename_asset:'Rename material',delete_asset:'Delete material'};
  const unresolved = pendingOperation !== null && !['not_sent','failed','expired'].includes(pendingOperation.status);
  function open(value:'group'|'edit'|'material'|'verification'){if(pendingOperation){setDialog(pendingOperation.form);return;}setName(value==='edit'?selected?.name??'':'');setUrl('');setAttempt(crypto.randomUUID());setDialogError('');setDialog(value);}
  async function act(work:()=>Promise<unknown>){if(busy)return;setBusy(true);data.setError('');try{await work();await data.reload();}catch(e){data.setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
  async function complete(){setDialog(null);setPendingOperation(null);setDialogError('');try{await data.reload();}catch(e){data.setError(e instanceof Error?e.message:'The operation was confirmed, but the list could not be refreshed.');}}
  function savedStatus(id:string,verification:boolean,status:string){
    setPendingOperation({id,verification,status,form:dialog??pendingOperation?.form??'material'});
    setDialogError(['not_sent','failed','expired'].includes(status)
      ? 'The saved operation did not complete. Close this dialog before starting another attempt.'
      : status==='prepared' ? 'The preparation is saved and has not been sent upstream. You can cancel it; checking status will never dispatch it.' : 'The operation is not confirmed. Check its saved status before starting another attempt.');
  }
  async function save(){
    if(!data.client||!data.model||busy||pendingOperation||(dialog!=='verification'&&materialWritesLocked))return;
    if(dialog==='material'){
      try{if(new URL(url).protocol!=='https:')throw new Error('Invalid material URL');}
      catch{setDialogError('Use a public HTTPS material URL.');return;}
    }
    const api=data.client,model=data.model;setBusy(true);setDialogError('');
    try{
      if(dialog==='verification'){
        const result=await api.verification.create({model,subjectName:name},{idempotencyKey:attempt});
        if(['prepared','unknown','not_sent','failed','expired'].includes(result.data.status)){savedStatus(result.data.id,true,result.data.status);return;}
      }else{
        const input:MediaAssetOperationInput=dialog==='material'
          ? {action:'create_asset',model,group_id:data.group,url,name,kind}
          : dialog==='edit'&&selected
            ? {action:'update_group',model,group_id:selected.id,name,expected_revision:selected.revision}
            : {action:'create_group',model,name};
        const prepared=await api.operations.prepare(input,{idempotencyKey:attempt});
        if(prepared.data.status!=='prepared'){savedStatus(prepared.data.id,false,prepared.data.status);return;}
        const result=await api.operations.dispatch(prepared.data.id,input,{idempotencyKey:attempt});
        if(result.data.status!=='acknowledged'){savedStatus(result.data.id,false,result.data.status);return;}
        if(result.group)data.setGroup(result.group.id);
      }
      await complete();
    }catch(e){
      const message=e instanceof Error?e.message:'The request could not be confirmed.';
      if(e instanceof NiuAPIError && !e.operationId && [400,401,403,404,422].includes(e.status))setDialogError(message);
      else{
        setPendingOperation({id:e instanceof NiuAPIError?e.operationId??null:null,verification:dialog==='verification',status:'unknown',form:dialog??'material'});
        setDialogError(`${message} The outcome is unconfirmed. Your draft is preserved; do not submit another attempt.${e instanceof NiuAPIError&&e.operationId?' Check the saved operation status.':dialog==='verification'?' A saved verification reference was not returned, so status recovery is unavailable here.':' Check the saved operation using its original request reference.'}`);
      }
    }finally{setBusy(false);}
  }
  async function cancelPreparation(id:string,model:string){
    if(busy||!data.canWrite)return;
    setBusy(true);setDialogError('');data.setError('');let confirmed=false;
    try{
      await data.cancelPreparedOperation(id,model);confirmed=true;
      if(pendingOperation?.id===id)savedStatus(id,false,'not_sent');
      await data.reload();
    }catch(error){
      const message=error instanceof Error?error.message:'Cancellation could not be confirmed.';
      const notice=confirmed?`${message} The preparation was canceled, but the saved lists could not be refreshed. Check saved status.`:`${message} Check saved status before another action.`;
      if(pendingOperation?.id===id)setDialogError(notice);
      else data.setError(notice);
    }finally{setBusy(false);}
  }
  async function checkSavedOperation(){
    if(!pendingOperation||busy||(pendingOperation.verification?(!data.client||!data.model||!pendingOperation.id):!data.historyClient))return;
    setBusy(true);setDialogError('');
    try{
      const result=pendingOperation.verification
        ? await data.client!.verification.retrieve(pendingOperation.id!,data.model!)
        : pendingOperation.id?await data.historyClient!.retrieve(pendingOperation.id):await data.historyClient!.retrieveByIdempotency(attempt);
      const status=result.data.status;
      const confirmed=pendingOperation.verification?['waiting_user','processing','verified'].includes(status):status==='acknowledged';
      if(confirmed)await complete();else savedStatus(result.data.id,pendingOperation.verification,status);
    }catch(e){setDialogError(e instanceof NiuAPIError&&e.status===404&&!pendingOperation.id&&!pendingOperation.verification
      ? 'No saved operation was found for this request. This does not confirm that it was never sent. Do not submit another attempt.'
      : `${e instanceof Error?e.message:'Could not check the saved operation.'} The outcome remains unconfirmed. Try checking again.`);}
    finally{setBusy(false);}
  }
  async function openVerification(id:string){await act(async()=>{const link=await data.client!.verification.link(id,data.model!);const target=new URL(link.verification_url);if(target.protocol!=='https:')throw new Error('Invalid verification link');window.open(target.href,'_blank','noopener,noreferrer');});}
  return <div className="w-full min-w-0">
    {pendingOperation&&!dialog&&<div role="alert" className="flex flex-wrap items-center gap-3 py-3 text-sm"><span>The previous operation remains unconfirmed. Review its saved status before starting another attempt.</span><Button variant="outline" onClick={()=>setDialog(pendingOperation.form)}>Review saved operation</Button></div>}
    <Tabs value={section==='verification' ? 'verification':'materials'} onValueChange={setSection} className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"><TabsList><TabsTrigger value="materials">Materials</TabsTrigger><TabsTrigger value="verification">Human verification</TabsTrigger></TabsList>{!nativeContext&&<div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="min-w-0 max-w-full" aria-label="Native tools API key" disabled={contextLocked||data.discoveryLoading}><span className="min-w-0 truncate">{data.contextKeys.find(key=>key.id===chosenKey)?.name??'Choose API key'}{data.historyKey?.revoked?' · Revoked':data.historyKey?.expired?' · Expired':''}</span><IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" collisionPadding={16} className="max-w-[calc(100vw-2rem)]"><DropdownMenuRadioGroup value={chosenKey} onValueChange={keyId=>{if(!contextLocked)onContextChange?.({keyId,model:''});}}>{data.contextKeys.map(key=><DropdownMenuRadioItem key={key.id} value={key.id}><span className="min-w-0 whitespace-normal break-words">{key.name}</span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="min-w-0 max-w-full" aria-label="Native tools model" disabled={contextLocked||data.discoveryLoading||!chosenKey}><span className="min-w-0 truncate">{chosen?.module.display_name??chosen?.module.context_label??(chosenModel?'Saved model context':'Choose model')}</span><IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" collisionPadding={16} className="max-w-[calc(100vw-2rem)]"><DropdownMenuRadioGroup value={chosenModel} onValueChange={model=>{if(!contextLocked)onContextChange?.({keyId:chosenKey,model});}}>{choices.map(choice=><DropdownMenuRadioItem key={choice.module.model_alias} value={choice.module.model_alias}><span className="min-w-0 whitespace-normal break-words">{choice.module.display_name??choice.module.context_label}</span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
      </div>}</div>
      {!nativeContext&&chosen&&<p className="text-sm text-muted-foreground">{chosen.keyName} · {data.currentModule?.context_label??chosen.module.context_label}</p>}
      {nativeContext&&data.currentModule&&<p className="text-sm text-muted-foreground">{data.currentModule.context_label}</p>}
      {!nativeContext&&data.discoveryLoading&&<p role="status" className="text-sm text-muted-foreground">Discovering native tool contexts…</p>}
      {!nativeContext&&data.discoveryErrors.length>0&&<div role="alert" className="py-3 text-sm"><p>Some native tool contexts could not be discovered.</p>{data.discoveryErrors.map(error=><p key={error}>{error}</p>)}<Button variant="outline" disabled={contextLocked} onClick={data.retry}>Retry discovery</Button></div>}
      {!nativeContext&&!data.discoveryLoading&&!chosenModel&&<p className="text-sm text-muted-foreground">{chosenKey&&choices.length===0 ? data.discoveryErrors.length>0 ? 'Native tool discovery is incomplete. Retry discovery or choose a discovered context.':'No native model context was discovered for this key.':'Choose an API key and model to read its materials.'}</p>}
      {data.error&&<div role="alert" className="flex items-center justify-between gap-3 py-3 text-sm"><span>{data.error}</span><Button variant="outline" onClick={data.retry}>Retry</Button></div>}
      <TabsContent value="materials"><section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" aria-label="Material group" disabled={data.loading||!data.client||contextLocked}>{selected?.name??'Choose group'}<IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={data.group} onValueChange={data.setGroup}>{data.groups.filter(g=>g.status!=='deleted').map(g=><DropdownMenuRadioItem key={g.id} value={g.id}>{g.name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup><DropdownMenuSeparator/><DropdownMenuItem disabled={!data.client||!data.canWrite||materialWritesLocked} onSelect={()=>open('group')}><IconPlus size={16}/>New group</DropdownMenuItem><DropdownMenuItem disabled={!data.client||!selected||!data.canWrite||materialWritesLocked||selected.kind==='person'} onSelect={()=>open('edit')}>Edit group</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button variant="outline" disabled={!data.client||!selected||selected.status!=='ready'||!data.canWrite||materialWritesLocked} onClick={()=>open('material')}><IconPlus size={14}/>Add material</Button></div>
        {data.assets.length?<Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead/></TableRow></TableHeader><TableBody>{data.assets.map(a=><TableRow key={a.id}><TableCell>{a.name||'Untitled material'}</TableCell><TableCell>{a.kind}</TableCell><TableCell>{a.status}</TableCell><TableCell><Button variant="ghost" disabled={busy||!data.canWrite} onClick={()=>void act(()=>data.client!.assets.refresh(a.id,data.model!))}>Check status</Button></TableCell></TableRow>)}</TableBody></Table>:data.error?<p className="text-sm text-muted-foreground">Materials could not be loaded. Retry before continuing.</p>:<Empty className="min-h-40 border-0 py-10"><EmptyHeader><IconFolder className="mx-auto mb-2 text-muted-foreground" size={28} stroke={1.5}/><EmptyTitle className="text-sm">{data.loading?'Loading materials…':!data.client&&data.historyClient?'Current materials unavailable':!nativeContext&&!chosenModel?'Choose an API key and model':selected?'No materials in this group':'No material groups yet'}</EmptyTitle></EmptyHeader>{!data.loading&&data.client&&data.canWrite&&!selected&&<Button variant="outline" disabled={materialWritesLocked} onClick={()=>open('group')}>Create group</Button>}</Empty>}


        {data.historyClient&&<section className="space-y-3" aria-labelledby="saved-operations-heading">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="saved-operations-heading" className="text-sm font-semibold">Saved operations</h2><Button variant="outline" disabled={busy||data.operationsLoading} onClick={()=>void data.reloadOperations()}>Refresh saved operations</Button></div>
          <p className="text-sm text-muted-foreground">History includes all saved account contexts for this exact API key and model. Saved request status does not confirm that a material is ready. A missing record does not prove a request was never sent.</p>
          {!data.client&&<p role="status" className="text-sm text-muted-foreground">Current native actions are unavailable. Saved history remains readable; prepared operations can be canceled with workspace Write access.</p>}
          {savedUnconfirmed&&<p role="alert" className="text-sm">Saved operations remain unconfirmed. Check their saved status before starting another attempt.</p>}
          {data.operationsError&&<p role="alert" className="text-sm text-destructive">{data.operationsError}</p>}
          {data.operationsLoading&&<p role="status" className="text-sm text-muted-foreground">Loading saved operation status…</p>}
          {data.operations.length?<><Table><TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Saved date</TableHead><TableHead>Status</TableHead><TableHead/></TableRow></TableHeader><TableBody>{data.operations.slice(0,visibleOperations).map(operation=><TableRow key={operation.id}><TableCell>{operationLabels[operation.action]}</TableCell><TableCell>{new Date(operation.created_at_ms).toLocaleString()}</TableCell><TableCell>{operation.status==='acknowledged'?'Acknowledged':operation.status==='not_sent'?'Not sent':operation.status==='prepared'?'Prepared':'Unconfirmed'}</TableCell><TableCell><div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={busy||data.operationsLoading} onClick={()=>void data.checkOperation(operation.id)}>Check saved status</Button>{operation.status==='prepared'&&<Button variant="outline" disabled={busy||!data.canWrite||data.operationsLoading} onClick={()=>void cancelPreparation(operation.id,operation.model)}>Cancel preparation</Button>}</div></TableCell></TableRow>)}</TableBody></Table>{data.operations.length>visibleOperations&&<Button variant="outline" onClick={()=>setVisibleOperations(value=>value+25)}>Show more saved operations</Button>}</>:!data.operationsLoading&&!data.operationsError&&<p className="text-sm text-muted-foreground">No saved operations for this API key and model.</p>}
        </section>}

      </section></TabsContent>
      <TabsContent value="verification" className="space-y-4"><div className="flex justify-end"><Button disabled={busy||!data.client||!data.canWrite||pendingOperation!==null} onClick={()=>open('verification')}><IconPlus size={16}/>Start verification</Button></div>{data.sessions.length?<Table><TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Status</TableHead><TableHead/></TableRow></TableHeader><TableBody>{data.sessions.map(v=><TableRow key={v.id}><TableCell>{v.subject_name||'Unnamed person'}</TableCell><TableCell>{v.status.replaceAll('_',' ')}</TableCell><TableCell>{['waiting_user','processing'].includes(v.status)&&<Button variant="ghost" disabled={busy} onClick={()=>void openVerification(v.id)}>Open verification</Button>}<Button variant="ghost" disabled={busy||!data.canWrite} onClick={()=>void act(()=>data.client!.verification.refresh(v.id,data.model!))}>Check status</Button></TableCell></TableRow>)}</TableBody></Table>:<Unavailable heading="Verification sessions" title={!data.client ? data.loading?'Loading native context…':'Choose an API key and model':'Verify a person'} description={!data.client ? 'Select a discovered native context before reading or starting verification.':'The person verifies on Volcengine’s page. A separate status check confirms the result.'}/>}</TabsContent>
    </Tabs>
    <Dialog open={dialog!==null} onOpenChange={value=>{if(!value&&!busy){setDialog(null);if(!unresolved)setPendingOperation(null);}}}><DialogContent><DialogHeader><DialogTitle>{dialog==='group'?'New material group':dialog==='edit'?'Edit group':dialog==='material'?'Add material':'Human verification'}</DialogTitle><DialogDescription>{dialog==='verification'?'The person completes verification on Volcengine’s page. Niu then checks the result.':'Manage materials in this workspace.'}</DialogDescription></DialogHeader>
      <div className="space-y-4"><div className="space-y-2"><Label htmlFor="volcengine-name">{dialog==='verification'?'Person name':dialog==='material'?'Material name':'Group name'}</Label><Input id="volcengine-name" disabled={busy||!!pendingOperation} value={name} onChange={e=>setName(e.target.value)} maxLength={64}/></div>{dialog==='material'&&<><Label htmlFor="material-url">Material URL</Label><Input id="material-url" aria-invalid={dialogError==='Use a public HTTPS material URL.'} aria-describedby={dialogError?'volcengine-dialog-error':undefined} disabled={busy||!!pendingOperation} type="url" value={url} onChange={e=>setUrl(e.target.value)}/><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={busy||!!pendingOperation}>{kind}<IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuRadioGroup value={kind} onValueChange={v=>setKind(v as typeof kind)}>{['image','video','audio'].map(k=><DropdownMenuRadioItem key={k} value={k}>{k}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></>}<p className="text-sm text-muted-foreground">Workspace: {workspaceName}</p></div>
      {dialogError&&<p id="volcengine-dialog-error" role="alert" className="text-sm text-destructive">{dialogError}</p>}
      <DialogFooter className="flex-wrap gap-2 sm:flex-wrap"><Button variant="ghost" disabled={busy} onClick={()=>{setDialog(null);if(!unresolved)setPendingOperation(null);}}>{pendingOperation?'Close':'Cancel'}</Button>{pendingOperation&&(pendingOperation.id||!pendingOperation.verification)&&<Button variant="outline" disabled={busy} onClick={()=>void checkSavedOperation()}>{busy?'Checking…':'Check saved operation status'}</Button>}{pendingOperation?.status==='prepared'&&!pendingOperation.verification&&pendingOperation.id&&data.historyModel&&<Button variant="outline" disabled={busy||!data.canWrite} onClick={()=>void cancelPreparation(pendingOperation.id!,data.historyModel!)}>Cancel preparation</Button>}{!pendingOperation&&<Button disabled={busy||!!pendingOperation||(dialog!=='verification'&&materialWritesLocked)||!name.trim()||(dialog==='material'&&!url.trim())} onClick={()=>void save()}>{busy?'Saving…':dialog==='verification'?'Start verification':dialog==='group'?'Create group':'Save'}</Button>}</DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
function Unavailable({title,description}:{heading:string;title:string;description:string}) { return <div className=""><Empty className="min-h-40 border-0 py-10"><EmptyHeader><ScanFace className="mx-auto mb-2 text-muted-foreground" size={28} strokeWidth={1.5}/><EmptyTitle className="text-sm font-medium">{title}</EmptyTitle><EmptyDescription className="max-w-sm text-sm">{description}</EmptyDescription></EmptyHeader></Empty></div>; }
