import { IconRefresh as RefreshCw, IconFolderUser, IconChevronDown } from "@tabler/icons-react";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import PageHeader from '@/components/PageHeader';
import ConnectGate from '@/app/ConnectGate';
import ModelTable from './components/ModelTable';

export default function ModelsRoute() {
  return <ConnectGate>
    {({ models, modelsLoading, modelsError, refreshModels, workspace, workspaces, selectWorkspace }) => {
      const header=<PageHeader title="Models" className="models-page-heading" action={<div className="flex min-w-0 flex-wrap items-center gap-2"><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label="Filter by workspace" disabled={!workspaces?.length} className="min-w-0 max-w-full font-normal"><IconFolderUser size={16}/><span className="truncate max-w-40 sm:max-w-56">{workspace?.name ?? 'Workspace'}</span><IconChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Workspace</DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuRadioGroup value={workspace?.id ?? ''} onValueChange={id=>{const next=workspaces.find(item=>item.id===id);if(next)selectWorkspace(next);}}>{workspaces?.map(item=><DropdownMenuRadioItem key={item.id} value={item.id}>{item.name}{workspaces.filter(candidate=>candidate.name===item.name).length>1 ? ` · ${item.organization_name}`:''}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu><Button variant="ghost" disabled={modelsLoading} onClick={() => void refreshModels()} type="button"><RefreshCw size={14}/><span>{modelsLoading ? 'Refreshing…' : 'Refresh'}</span></Button></div>}/>;
      const failure=modelsError && <Alert variant="destructive"><AlertDescription>{modelsError}<Button variant="ghost" disabled={modelsLoading} onClick={()=>void refreshModels()}>Retry model catalog</Button></AlertDescription></Alert>;
      return !models.length && (modelsLoading || modelsError)
        ? <>{header}{failure}{modelsLoading && <p role="status" className="p-6 text-muted-foreground">Loading model catalog…</p>}</>
        : <ModelTable models={models} header={<>{header}{failure}</>}/>;
    }}
  </ConnectGate>;
}
