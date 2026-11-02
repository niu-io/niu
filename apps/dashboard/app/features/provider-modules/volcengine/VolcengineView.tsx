import { translateUI } from '@/shell/ui-locale';
import { formatLocalizedMessage, readLocale } from '@/shell/ui-locale';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect,useRef,useState } from 'react';
import {ScanFace} from 'lucide-react';
import { TableSkeleton } from '@/components/PageSkeletons';
import { IconFolder, IconPlus, IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

import type { MediaAsset, MediaAssetOperationInput } from '@niu-io/sdk/media-assets';
import { NiuAPIError } from '@niu-io/sdk';
import { Link, useInRouterContext } from 'react-router';
import { workspacePathSegment } from '@/shell/workspace-route';
import {useMaterials,type NativeMaterialsContext} from './useMaterials';
import {Table,TableHeader,TableRow,TableHead,TableBody,TableCell} from '@/components/ui/table';
type DialogKind = 'group'|'edit'|'delete-group'|'material'|'inspect-asset'|'rename-asset'|'delete-asset'|'verification';
export default function VolcengineView({workspaceName, model:preferredModel, nativeContext, selection, onContextChange, initialSection='materials', hideSectionTabs=false}:{workspaceName:string;model?:string;nativeContext?:NativeMaterialsContext;selection?:NativeMaterialsContext;onContextChange?:(selection:NativeMaterialsContext)=>void;initialSection?:string;hideSectionTabs?:boolean}) {
  const { t: uiT, format: uiF } = useUILocale();
  const inRouter = useInRouterContext();
  const [section,setSection]=useState(initialSection);
  useEffect(()=>{setSection(initialSection);},[initialSection]);
  const [dialog,setDialog]=useState<DialogKind|null>(null);
  const [targetAsset,setTargetAsset]=useState<MediaAsset|null>(null);
  const [name,setName]=useState('');
  const [attempt,setAttempt]=useState('');
  const [dialogError,setDialogError]=useState('');
  const [pendingOperation,setPendingOperation]=useState<{id:string|null;verification:boolean;status:string;form:DialogKind}|null>(null);
  const [busy,setBusy]=useState(false),[url,setUrl]=useState(''),[kind,setKind]=useState<'image'|'video'|'audio'>('image');
  const contextLocked=busy||dialog!==null||pendingOperation!==null;
  const retainedSelection=useRef(selection);
  if(!contextLocked)retainedSelection.current=selection;
  const data=useMaterials(preferredModel,nativeContext,retainedSelection.current);
  const chosenKey=data.resolvedKeyId,chosenModel=data.selection?.model??'';
  const choices=data.contextChoices.filter(choice=>choice.keyId===chosenKey);
  const chosen=choices.find(choice=>choice.module.model_alias===chosenModel);
  const modelChoices=[...new Set([...choices.map(choice=>choice.module.model_alias),...(data.historyModels[chosenKey]??[])])];
  const modelLabel=(model:string)=>{const active=choices.find(choice=>choice.module.model_alias===model);return active?(active.module.display_name??active.module.context_label??model):formatLocalizedMessage('{0} · Saved history', [model], readLocale());};
  const keyStatusSuffix=(key?:{id:string;revoked:boolean;expired:boolean})=>!key?'':key.revoked?` ${uiT("· Revoked")}`:key.expired?` ${uiT("· Expired")}`:data.ipRestrictedKeyIds.includes(key.id)?` ${uiT("· Source IP restricted")}`:'';
  const workspaceSlug=data.workspace?workspacePathSegment(data.workspace,data.workspaces??[data.workspace]):'default';
  const workspaceKeysHref=`/workspaces/${encodeURIComponent(workspaceSlug)}/keys`;
  const restrictedTargetKey=data.selectedKeyIpRestricted?data.historyKey:!chosenKey&&data.ipRestrictedKeys.length===1?data.ipRestrictedKeys[0]:undefined;
  const restrictedAllowedCidrs=restrictedTargetKey?(restrictedTargetKey.ip_policy?restrictedTargetKey.ip_policy.allowed_cidrs:restrictedTargetKey.allowed_cidrs):undefined;
  const fallbackChoice=!nativeContext?data.contextChoices[0]:undefined;
  const selected=data.groups.find(g=>g.id===data.group);
  const visibleAssets=data.assets.filter(a=>a.status!=='deleted');
  const [visibleOperations,setVisibleOperations]=useState(25);
  useEffect(()=>setVisibleOperations(25),[data.client,data.model]);
  const savedUnconfirmed=data.operations.some(operation=>operation.status==='prepared'||operation.status==='unknown');
  const materialWritesLocked=busy||pendingOperation!==null||!data.operationsReady||data.operationsLoading||!!data.operationsError||savedUnconfirmed;
  const operationLabels={create_group:'Create group',update_group:'Edit group',delete_group:'Delete group',create_asset:'Add material',rename_asset:'Rename material',delete_asset:'Delete material'};
  const diagnosticLabels={transport:'Transport failure',timeout:'Request timed out',response_too_large:'Response exceeded size limit',invalid_response:'Invalid Provider response',upstream_rejected:'Provider rejected the request'};
  const phaseLabels={exchange:'Request/response exchange',response:'Reading Provider response',acknowledgement:'Validating acknowledgement'};
  const assetStatusDescriptions:Record<MediaAsset['status'],string>={
    active:'Active — ready for generation',
    processing:'Processing — upload acknowledged; Provider processing is still in progress',
    pending:'Pending — awaiting Provider acknowledgement',
    failed:'Failed — Provider reported processing failure',
    unknown:'Unknown — outcome unconfirmed; check status before modifying',
    deleted:'Deleted',
  };
  const unresolved = pendingOperation !== null && !['not_sent','failed','expired'].includes(pendingOperation.status);
  function open(value:DialogKind, asset?:MediaAsset){
    if(pendingOperation){setDialog(pendingOperation.form);return;}
    const nextAsset=asset??null;
    setTargetAsset(nextAsset);
    setName(value==='edit'?selected?.name??'':value==='rename-asset'?nextAsset?.name??'':'');
    setUrl('');
    setAttempt(crypto.randomUUID());
    setDialogError('');
    setDialog(value);
    if(value==='inspect-asset'&&nextAsset&&data.client&&data.model){
      void data.client.assets.retrieve(nextAsset.id,data.model).then(res=>setTargetAsset(curr=>curr?.id===nextAsset.id?res.data:curr)).catch(()=>{
        /* Retain last loaded material record while surfacing refresh status. */
        setDialogError('Showing the last loaded material details; latest status could not be refreshed.');
      });
    }
  }
  async function act(work:()=>Promise<unknown>){if(busy)return;setBusy(true);data.setError('');try{await work();await data.reload();}catch(e){data.setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
  async function complete(){setDialog(null);setTargetAsset(null);setPendingOperation(null);setDialogError('');try{await data.reload();}catch(e){data.setError(e instanceof Error?e.message:'The operation was confirmed, but the list could not be refreshed.');}}
  function savedStatus(id:string,verification:boolean,status:string){
    setPendingOperation({id,verification,status,form:dialog??pendingOperation?.form??'material'});
    setDialogError(['not_sent','failed','expired'].includes(status)
      ? 'The saved operation did not complete. Close this dialog before starting another attempt.'
      : status==='prepared' ? 'The preparation is saved and has not been sent upstream. You can cancel it; checking status will never dispatch it.' : 'The operation is not confirmed. Check its saved status before starting another attempt.');
  }
  async function save(){
    if(!data.client||!data.model||busy||pendingOperation||dialog==='inspect-asset'||(dialog!=='verification'&&materialWritesLocked))return;
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
        let input:MediaAssetOperationInput;
        if(dialog==='material'){
          input={action:'create_asset',model,group_id:data.group,url,name,kind};
        }else if(dialog==='edit'&&selected){
          input={action:'update_group',model,group_id:selected.id,name,expected_revision:selected.revision};
        }else if(dialog==='delete-group'&&selected){
          input={action:'delete_group',model,group_id:selected.id,expected_revision:selected.revision};
        }else if(dialog==='rename-asset'&&targetAsset){
          input={action:'rename_asset',model,asset_id:targetAsset.id,name:name.trim(),expected_revision:targetAsset.revision};
        }else if(dialog==='delete-asset'&&targetAsset){
          input={action:'delete_asset',model,asset_id:targetAsset.id,expected_revision:targetAsset.revision};
        }else{
          input={action:'create_group',model,name};
        }
        const prepared=await api.operations.prepare(input,{idempotencyKey:attempt});
        if(prepared.data.status!=='prepared'){savedStatus(prepared.data.id,false,prepared.data.status);return;}
        const result=await api.operations.dispatch(prepared.data.id,input,{idempotencyKey:attempt});
        if(result.data.status!=='acknowledged'){savedStatus(result.data.id,false,result.data.status);return;}
        if(result.group&&dialog!=='delete-group')data.setGroup(result.group.id);
      }
      await complete();
    }catch(e){
      const message=e instanceof Error?e.message:'The request could not be confirmed.';
      if(e instanceof NiuAPIError && !e.operationId && [400,401,403,404,409,422].includes(e.status))setDialogError(message);
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
  async function copyVerificationLink(id:string){await act(async()=>{const link=await data.client!.verification.link(id,data.model!);const target=new URL(link.verification_url);if(target.protocol!=='https:')throw new Error('Invalid verification link');await navigator.clipboard?.writeText(target.href);});}
  const requiresNameInput = dialog==='group'||dialog==='edit'||dialog==='material'||dialog==='rename-asset'||dialog==='verification';
  const isDestructiveDialog = dialog==='delete-group'||dialog==='delete-asset';
  return <div className="w-full min-w-0">
    {pendingOperation&&!dialog&&<div role="alert" className="flex flex-wrap items-center gap-3 py-3 text-sm"><span>{uiT("The previous operation remains unconfirmed. Review its saved status before starting another attempt.")}</span><Button variant="outline" onClick={()=>setDialog(pendingOperation.form)}>{uiT("Review saved operation")}</Button></div>}
    <Tabs value={section==='verification' ? 'verification':'materials'} onValueChange={setSection} className="gap-4">
      {(!hideSectionTabs || !nativeContext) && <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">{!hideSectionTabs ? <TabsList variant="line"><TabsTrigger value="materials">{uiT("Materials")}</TabsTrigger><TabsTrigger value="verification">{uiT("Human verification")}</TabsTrigger></TabsList> : <div />}{!nativeContext&&<div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="min-w-0 max-w-full" aria-label={uiT("Native tools API key")} disabled={contextLocked||data.discoveryLoading}><span className="min-w-0 truncate">{data.contextKeys.find(key=>key.id===chosenKey)?.name??uiT("Choose API key")}{keyStatusSuffix(data.historyKey)}</span><IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" collisionPadding={16} className="max-w-[calc(100vw-2rem)]"><DropdownMenuRadioGroup value={chosenKey} onValueChange={keyId=>{if(contextLocked)return;const selectedKeyObj=data.contextKeys.find(key=>key.id===keyId);const nextModels=[...new Set([...data.contextChoices.filter(choice=>choice.keyId===keyId).map(choice=>choice.module.model_alias),...(data.historyModels[keyId]??[])])];const nextModel=preferredModel&&nextModels.includes(preferredModel)?preferredModel:nextModels.length===1?nextModels[0]:'';onContextChange?.({keyId:selectedKeyObj?.slug||keyId,model:nextModel});}}>{data.contextKeys.map(key=><DropdownMenuRadioItem key={key.id} value={key.id}><span className="min-w-0 whitespace-normal break-words">{key.name}{keyStatusSuffix(key)}</span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="min-w-0 max-w-full" aria-label={uiT("Native tools model")} disabled={contextLocked||data.discoveryLoading||!chosenKey||modelChoices.length===0}><span className="min-w-0 truncate">{chosenModel?modelLabel(chosenModel):uiT("Choose model")}</span><IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" collisionPadding={16} className="max-w-[calc(100vw-2rem)]"><DropdownMenuRadioGroup value={chosenModel} onValueChange={model=>{if(contextLocked)return;const selectedKeyObj=data.contextKeys.find(key=>key.id===chosenKey);onContextChange?.({keyId:selectedKeyObj?.slug||chosenKey,model});}}>{modelChoices.map(model=><DropdownMenuRadioItem key={model} value={model}><span className="min-w-0 whitespace-normal break-words">{modelLabel(model)}</span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
      </div>}</div>}
      {!nativeContext&&chosen&&<p className="text-sm text-muted-foreground">{chosen.keyName} · {data.currentModule?.context_label??chosen.module.context_label}</p>}
      {nativeContext&&data.currentModule&&<p className="text-sm text-muted-foreground">{data.currentModule.context_label}</p>}
      {!nativeContext&&data.discoveryLoading&&<p role="status" className="text-sm text-muted-foreground">{uiT("Discovering native tool contexts…")}</p>}
      {(data.selectedKeyIpRestricted||(!nativeContext&&!chosenKey&&!data.discoveryLoading&&data.ipRestrictedKeys.length>0))&&<div role="status" className="space-y-3 rounded-md bg-muted/40 p-4 text-sm">
        <div className="space-y-1">
          <p className="font-medium">{restrictedTargetKey?uiF("{0} is restricted to allowed source IP addresses",[restrictedTargetKey.name]):uiT("Some API keys restrict your current source IP address")}</p>
          {restrictedAllowedCidrs!==undefined&&restrictedAllowedCidrs!==null&&<p className="text-xs text-muted-foreground">{restrictedAllowedCidrs.length>0?uiF("Allowed source networks: {0}",[restrictedAllowedCidrs.join(', ')]):uiT("Current policy: Block all source IP addresses")}</p>}
          <p className="text-muted-foreground">{data.selectedKeyIpRestricted&&modelChoices.length>0?uiT("Your current network is not in this key’s source IP allowlist, so live Provider materials and verification cannot be queried with this key. Saved operation history remains available below. Choose another API key, or add your current IP address to this key’s source IP policy."):restrictedTargetKey?uiT("Your current network is not in this key’s source IP allowlist, so live Provider materials and verification cannot be accessed with this key. Choose another API key, or add your current IP address to this key’s source IP policy."):uiF("Your current network is not in the source IP allowlist for: {0}. Choose an available API key, or update the key’s source IP access policy.",[data.ipRestrictedKeys.map(key=>key.name).join(', ')])}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {fallbackChoice&&<Button variant="default" size="sm" disabled={contextLocked} onClick={()=>{const fallbackKey=data.contextKeys.find(key=>key.id===fallbackChoice.keyId);onContextChange?.({keyId:fallbackKey?.slug||fallbackChoice.keyId,model:fallbackChoice.module.model_alias});}}>{uiF("Use {0}",[fallbackChoice.keyName])}</Button>}
          {restrictedTargetKey&&<Button asChild variant="outline" size="sm">{inRouter?<Link to={`${workspaceKeysHref}/${encodeURIComponent(restrictedTargetKey.slug||restrictedTargetKey.id)}`}>{uiT("Configure source IP access")}</Link>:<a href={`${workspaceKeysHref}/${encodeURIComponent(restrictedTargetKey.slug||restrictedTargetKey.id)}`}>{uiT("Configure source IP access")}</a>}</Button>}
          <Button asChild variant="outline" size="sm">{inRouter?<Link to={workspaceKeysHref}>{uiT("Manage API keys")}</Link>:<a href={workspaceKeysHref}>{uiT("Manage API keys")}</a>}</Button>
          <Button variant="ghost" size="sm" disabled={contextLocked} onClick={data.retry}>{uiT("Recheck access")}</Button>
        </div>
      </div>}
      {!nativeContext&&data.discoveryErrors.length>0&&<div role="alert" className="space-y-2 py-3 text-sm"><p>{uiT("Some native tool contexts could not be discovered.")}</p>{data.discoveryErrors.map(error=><p key={error}>{error}</p>)}<Button variant="outline" disabled={contextLocked} onClick={data.retry}>{uiT("Retry discovery")}</Button></div>}
      {!nativeContext&&!data.discoveryLoading&&!chosenModel&&!data.selectedKeyIpRestricted&&<p className="text-sm text-muted-foreground">{chosenKey&&modelChoices.length===0 ? data.discoveryErrors.length>0 ? uiT("Native tool discovery is incomplete. Retry discovery or choose a discovered context."):uiT("No native model context was discovered for this key."):uiT("Choose an API key and model to read its materials.")}</p>}
      {data.error&&<div role="alert" className="flex items-center justify-between gap-3 py-3 text-sm"><span>{data.error}</span><Button variant="outline" onClick={data.retry}>{uiT("Retry")}</Button></div>}
      <TabsContent value="materials"><section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="min-w-0 max-w-full" aria-label={uiT("Material group")} disabled={data.loading||!data.client||contextLocked}><span className="min-w-0 truncate">{selected?.name??uiT("Choose group")}</span><IconChevronDown className="shrink-0" size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={16} className="max-w-[calc(100vw-2rem)]"><DropdownMenuRadioGroup value={data.group} onValueChange={data.setGroup}>{data.groups.filter(g=>g.status!=='deleted').map(g=><DropdownMenuRadioItem key={g.id} value={g.id}><span className="min-w-0 whitespace-normal break-all">{g.name}</span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup><DropdownMenuSeparator/><DropdownMenuItem disabled={!data.client||!data.canWrite||materialWritesLocked} onSelect={()=>open('group')}><IconPlus size={16}/>{uiT("New group")}</DropdownMenuItem><DropdownMenuItem disabled={!data.client||!selected||!data.canWrite||materialWritesLocked||selected.kind==='person'} onSelect={()=>open('edit')}>{uiT("Edit group")}</DropdownMenuItem><DropdownMenuItem disabled={!data.client||!selected||!data.canWrite||busy} onSelect={()=>void act(()=>data.client!.groups.refresh(selected!.id,data.model!))}>{uiT("Check group status")}</DropdownMenuItem><DropdownMenuItem variant="destructive" disabled={!data.client||!selected||!data.canWrite||materialWritesLocked||selected.kind==='person'||selected.status==='unknown'} onSelect={()=>open('delete-group')}>{uiT("Delete group")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button variant="outline" disabled={!data.client||!selected||selected.status!=='ready'||!data.canWrite||materialWritesLocked} onClick={()=>open('material')}><IconPlus size={14}/>{uiT("Add material")}</Button></div>
        {visibleAssets.length?<Table><TableHeader><TableRow><TableHead>{uiT("Name")}</TableHead><TableHead>{uiT("Type")}</TableHead><TableHead>{uiT("Status")}</TableHead><TableHead/></TableRow></TableHeader><TableBody>{visibleAssets.map(a=><TableRow key={a.id}><TableCell className="whitespace-normal break-words">{a.name||uiT("Untitled material")}</TableCell><TableCell>{uiT(a.kind)}</TableCell><TableCell>{uiT(a.status)}</TableCell><TableCell><div className="flex flex-wrap items-center justify-end gap-1.5"><Button variant="ghost" disabled={busy||!data.client} onClick={()=>open('inspect-asset',a)}>{uiT("Inspect")}</Button><Button variant="ghost" disabled={busy||!data.canWrite} onClick={()=>void act(()=>data.client!.assets.refresh(a.id,data.model!))}>{uiT("Check status")}</Button><Button variant="ghost" disabled={busy||!data.client||!data.canWrite||materialWritesLocked||a.status==='unknown'} onClick={()=>open('rename-asset',a)}>{uiT("Rename")}</Button><Button variant="ghost" disabled={busy||!data.client||!data.canWrite||materialWritesLocked||a.status==='unknown'} onClick={()=>open('delete-asset',a)}>{uiT("Delete")}</Button></div></TableCell></TableRow>)}</TableBody></Table>:data.error?<p className="text-sm text-muted-foreground">{uiT("Materials could not be loaded. Retry before continuing.")}</p>:<Empty className="min-h-40 border-0 py-10"><EmptyHeader><IconFolder className="mx-auto mb-2 text-muted-foreground" size={28} stroke={1.5}/><EmptyTitle className="text-sm">{data.loading?uiT("Loading materials…"):data.selectedKeyIpRestricted?uiT("Source IP restricted for this API key"):!data.client&&data.historyClient?uiT("Current materials unavailable"):!nativeContext&&!chosenModel?uiT("Choose an API key and model"):selected?uiT("No materials in this group"):uiT("No material groups yet")}</EmptyTitle></EmptyHeader>{!data.loading&&data.client&&data.canWrite&&!selected&&<Button variant="outline" disabled={materialWritesLocked} onClick={()=>open('group')}>{uiT("Create group")}</Button>}</Empty>}


        {data.historyClient&&<section className="space-y-3" aria-labelledby="saved-operations-heading">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="saved-operations-heading" className="text-sm font-semibold">{uiT("Saved operations")}</h2><Button variant="outline" disabled={busy||data.operationsLoading} onClick={()=>void data.reloadOperations()}>{uiT("Refresh saved operations")}</Button></div>
          <p className="text-sm text-muted-foreground">{uiT("History includes all saved account contexts for this exact API key and model. Saved request status does not confirm that a material is ready. A missing record does not prove a request was never sent.")}</p>
          {!data.client&&<p role="status" className="text-sm text-muted-foreground">{uiT("Current native actions are unavailable. Saved history remains readable; prepared operations can be canceled with workspace Write access.")}</p>}
          {savedUnconfirmed&&<p role="alert" className="text-sm">{uiT("Saved operations remain unconfirmed. Check their saved status before starting another attempt.")}</p>}
          {data.operationsError&&<p role="alert" className="text-sm text-destructive">{data.operationsError}</p>}
          {data.operationsLoading&&(data.operations.length?<p role="status" className="text-sm text-muted-foreground">{uiT("Loading saved operation status…")}</p>:<TableSkeleton columns={4} rows={3} label={uiT("Loading saved operation status…")}/>)}
          {data.operations.length?<><Table><TableHeader><TableRow><TableHead>{uiT("Action")}</TableHead><TableHead>{uiT("Saved date")}</TableHead><TableHead>{uiT("Status")}</TableHead><TableHead/></TableRow></TableHeader><TableBody>{data.operations.slice(0,visibleOperations).map(operation=><TableRow key={operation.id}><TableCell>{translateUI(operationLabels[operation.action])}</TableCell><TableCell>{new Date(operation.created_at_ms).toLocaleString(readUILocale())}</TableCell><TableCell>{operation.status==='acknowledged'?uiT("Acknowledged"):operation.status==='not_sent'?uiT("Not sent"):operation.status==='prepared'?uiT("Prepared"):uiT("Unconfirmed")}{operation.diagnostic?<span className="block text-xs text-muted-foreground">{translateUI(diagnosticLabels[operation.diagnostic.category])} · {translateUI(phaseLabels[operation.diagnostic.phase])}</span>:operation.status==='unknown'?<span className="block text-xs text-muted-foreground">{uiT("Failure category not recorded")}</span>:null}</TableCell><TableCell><div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={busy||data.operationsLoading} onClick={()=>void data.checkOperation(operation.id)}>{uiT("Check saved status")}</Button>{operation.status==='prepared'&&<Button variant="outline" disabled={busy||!data.canWrite||data.operationsLoading} onClick={()=>void cancelPreparation(operation.id,operation.model)}>{uiT("Cancel preparation")}</Button>}</div></TableCell></TableRow>)}</TableBody></Table>{data.operations.length>visibleOperations&&<Button variant="outline" onClick={()=>setVisibleOperations(value=>value+25)}>{uiT("Show more saved operations")}</Button>}</>:!data.operationsLoading&&!data.operationsError&&<p className="text-sm text-muted-foreground">{uiT("No saved operations for this API key and model.")}</p>}
        </section>}

      </section></TabsContent>
      <TabsContent value="verification" className="space-y-4"><div className="flex justify-end"><Button disabled={busy||!data.client||!data.canWrite||pendingOperation!==null} onClick={()=>open('verification')}><IconPlus size={16}/>{uiT("Start verification")}</Button></div>{data.sessions.length?<Table><TableHeader><TableRow><TableHead>{uiT("Person")}</TableHead><TableHead>{uiT("Status")}</TableHead><TableHead/></TableRow></TableHeader><TableBody>{data.sessions.map(v=><TableRow key={v.id}><TableCell>{v.subject_name||uiT("Unnamed person")}</TableCell><TableCell>{v.status.replaceAll('_',' ')}</TableCell><TableCell><div className="flex flex-wrap items-center justify-end gap-1.5">{['waiting_user','processing'].includes(v.status)&&<><Button variant="ghost" disabled={busy} onClick={()=>void openVerification(v.id)}>{uiT("Open verification")}</Button><Button variant="ghost" disabled={busy} onClick={()=>void copyVerificationLink(v.id)}>{uiT("Copy link", "复制链接")}</Button></>}<Button variant="ghost" disabled={busy||!data.canWrite} onClick={()=>void act(()=>data.client!.verification.refresh(v.id,data.model!))}>{uiT("Check status")}</Button></div></TableCell></TableRow>)}</TableBody></Table>:<Unavailable heading="Verification sessions" title={!data.client ? data.loading?uiT("Loading native context…"):data.selectedKeyIpRestricted?uiT("Source IP restricted for this API key"):uiT("Choose an API key and model"):uiT("Verify a person")} description={!data.client ? data.selectedKeyIpRestricted?uiT("Choose another API key or update this key’s source IP allowlist to use human verification."):uiT("Select a discovered native context before reading or starting verification."):uiT("The person verifies on the Provider’s page. A separate status check confirms the result.")}/>}</TabsContent>
    </Tabs>
    <Dialog open={dialog!==null} onOpenChange={value=>{if(!value&&!busy){setDialog(null);setTargetAsset(null);if(!unresolved)setPendingOperation(null);}}}><DialogContent><DialogHeader><DialogTitle>{dialog==='group'?uiT("New material group"):dialog==='edit'?uiT("Edit group"):dialog==='delete-group'?uiT("Delete material group"):dialog==='material'?uiT("Add material"):dialog==='inspect-asset'?uiT("Material details"):dialog==='rename-asset'?uiT("Rename material"):dialog==='delete-asset'?uiT("Delete material"):uiT("Human verification")}</DialogTitle><DialogDescription>{dialog==='verification'?uiT("The person completes verification on the Provider’s page. Niu then checks the result."):dialog==='inspect-asset'?uiT("Inspect saved material readiness and Provider observation status. Source URLs and opaque Provider references remain private."):dialog==='delete-asset'?uiT("Confirm material deletion from this Provider group."):dialog==='delete-group'?uiT("Confirm material group deletion from the Provider."):uiT("Manage materials in this workspace.")}</DialogDescription></DialogHeader>
      {dialog==='inspect-asset'&&targetAsset ? <div className="space-y-3 text-sm">
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">{uiT("Name")}</dt><dd className="font-medium break-words">{targetAsset.name||uiT("Untitled material")}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{uiT("Material type")}</dt><dd className="font-medium">{uiT(targetAsset.kind)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{uiT("Group")}</dt><dd className="font-medium break-words">{selected?.name??uiT("Current group")}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{uiT("Readiness status")}</dt><dd className="font-medium">{translateUI(assetStatusDescriptions[targetAsset.status])}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{uiT("Saved revision")}</dt><dd className="font-medium">{uiT("Revision")}{" "}{targetAsset.revision}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{uiT("Last updated")}</dt><dd className="font-medium">{new Date(targetAsset.updated_at_ms).toLocaleString(readUILocale())}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">{uiT("Provider observation")}</dt><dd className="font-medium">{targetAsset.observation ? uiF("Observed {0}{1} at {2}", [targetAsset.observation.status, targetAsset.observation.name ? ` (“${targetAsset.observation.name}”)` : '', new Date(targetAsset.observation.observed_at_ms).toLocaleString(readUILocale())]) : uiT("No Provider status observation recorded yet. Use Check status to query the Provider.")}</dd></div>
        </dl>
        <p className="text-xs text-muted-foreground">{uiT("Workspace:")}{" "}{workspaceName}</p>
      </div> : isDestructiveDialog ? <div className="space-y-3 text-sm">
        <p>{dialog==='delete-asset' ? uiF("Delete material “{0}” (revision {1}) from {2}? This removes the material from the Provider and cannot be undone.", [targetAsset?.name||uiT("Untitled material"), targetAsset?.revision??'1', selected?.name??uiT("this group")]) : uiF("Delete material group “{0}” (revision {1})? This removes the group from the Provider and cannot be undone.", [selected?.name??uiT("Untitled group"), selected?.revision??'1'])}</p>
        <p className="text-muted-foreground">{uiT("Workspace:")}{" "}{workspaceName}</p>
      </div> : <div className="space-y-4"><div className="space-y-2"><Label htmlFor="provider-tool-name">{dialog==='verification'?uiT("Person name"):dialog==='material'||dialog==='rename-asset'?uiT("Material name"):uiT("Group name")}</Label><Input id="provider-tool-name" disabled={busy||!!pendingOperation} value={name} onChange={e=>setName(e.target.value)} maxLength={64}/></div>{dialog==='material'&&<><div className="space-y-2"><Label htmlFor="material-url">{uiT("Material URL")}</Label><Input id="material-url" aria-invalid={dialogError==='Use a public HTTPS material URL.'} aria-describedby={dialogError?'provider-tool-dialog-error':undefined} disabled={busy||!!pendingOperation} type="url" value={url} onChange={e=>setUrl(e.target.value)}/></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={busy||!!pendingOperation}>{uiT(kind)}<IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuRadioGroup value={kind} onValueChange={v=>setKind(v as typeof kind)}>{['image','video','audio'].map(k=><DropdownMenuRadioItem key={k} value={k}>{uiT(k)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></>}<p className="text-sm text-muted-foreground">{uiT("Workspace:")}{" "}{workspaceName}</p></div>}
      {dialogError&&<p id="provider-tool-dialog-error" role="alert" className="text-sm text-destructive">{dialogError}</p>}
      <DialogFooter className="flex-wrap gap-2 sm:flex-wrap">{dialog==='inspect-asset'&&targetAsset ? <><Button variant="ghost" disabled={busy} onClick={()=>{setDialog(null);setTargetAsset(null);}}>{uiT("Close")}</Button><Button variant="outline" disabled={busy||!data.canWrite||!data.client} onClick={()=>void act(async()=>{const refreshed=await data.client!.assets.refresh(targetAsset.id,data.model!);setTargetAsset(refreshed.data);})}>{busy?uiT("Checking…"):uiT("Check status")}</Button><Button variant="outline" disabled={busy||!data.canWrite||materialWritesLocked||targetAsset.status==='unknown'} onClick={()=>open('rename-asset',targetAsset)}>{uiT("Rename material")}</Button><Button variant="destructive" disabled={busy||!data.canWrite||materialWritesLocked||targetAsset.status==='unknown'} onClick={()=>open('delete-asset',targetAsset)}>{uiT("Delete material")}</Button></> : <><Button variant="ghost" disabled={busy} onClick={()=>{setDialog(null);setTargetAsset(null);if(!unresolved)setPendingOperation(null);}}>{pendingOperation?uiT("Close"):uiT("Cancel")}</Button>{pendingOperation&&(pendingOperation.id||!pendingOperation.verification)&&<Button variant="outline" disabled={busy} onClick={()=>void checkSavedOperation()}>{busy?uiT("Checking…"):uiT("Check saved operation status")}</Button>}{pendingOperation?.status==='prepared'&&!pendingOperation.verification&&pendingOperation.id&&data.historyModel&&<Button variant="outline" disabled={busy||!data.canWrite} onClick={()=>void cancelPreparation(pendingOperation.id!,data.historyModel!)}>{uiT("Cancel preparation")}</Button>}{!pendingOperation&&<Button variant={isDestructiveDialog?'destructive':'default'} disabled={busy||!!pendingOperation||(dialog!=='verification'&&materialWritesLocked)||(requiresNameInput&&!name.trim())||(dialog==='material'&&!url.trim())} onClick={()=>void save()}>{busy?(isDestructiveDialog?uiT("Deleting…"):uiT("Saving…")):dialog==='verification'?uiT("Start verification"):dialog==='group'?uiT("Create group"):dialog==='delete-group'?uiT("Delete group"):dialog==='delete-asset'?uiT("Delete material"):uiT("Save")}</Button>}</>}</DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
function Unavailable({title,description}:{heading:string;title:string;description:string}) { return <div className=""><Empty className="min-h-40 border-0 py-10"><EmptyHeader><ScanFace className="mx-auto mb-2 text-muted-foreground" size={28} strokeWidth={1.5}/><EmptyTitle className="text-sm font-medium">{title}</EmptyTitle><EmptyDescription className="max-w-sm text-sm">{description}</EmptyDescription></EmptyHeader></Empty></div>; }
