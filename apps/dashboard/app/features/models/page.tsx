import { useLocale as useUILocale } from '@/shell/ui-locale';
import type { LoaderFunctionArgs } from 'react-router';
import { IconRefresh as RefreshCw, IconFolderUser, IconChevronDown } from "@tabler/icons-react";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import { workspaceDisplayName } from '@/shell/workspace-route';
import { TableSkeleton } from '@/components/PageSkeletons';
import PageHeader from '@/components/PageHeader';
import ConnectGate from '@/shell/ConnectGate';
import ModelTable from './components/ModelTable';

export function loader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ workspace }) => ({
    endpoint: workspace
      ? `/api/v1/models?organization_id=${encodeURIComponent(workspace.organization_id)}&project_id=${encodeURIComponent(workspace.id)}`
      : null,
    persist: true,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function ModelsRoute() {
  const { t: uiT } = useUILocale();
  useOptionalRouteLoaderData();
  return <ConnectGate>
    {({ models, modelsLoading, modelsError, refreshModels, workspace, workspaces, selectWorkspace }) => {
      const header=<PageHeader title={uiT("Models")} className="models-page-heading" action={<div className="flex min-w-0 flex-wrap items-center gap-2"><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label={uiT("Filter by workspace")} disabled={!workspaces?.length} className="min-w-0 max-w-full font-normal"><IconFolderUser size={16}/><span className="truncate max-w-40 sm:max-w-56">{workspace ? workspaceDisplayName(workspace.name) : uiT("Workspace")}</span><IconChevronDown size={14}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>{uiT("Workspace")}</DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuRadioGroup value={workspace?.id ?? ''} onValueChange={id=>{const next=workspaces.find(item=>item.id===id);if(next)selectWorkspace(next);}}>{workspaces?.map(item=><DropdownMenuRadioItem key={item.id} value={item.id}>{workspaceDisplayName(item.name)}{workspaces.filter(candidate=>candidate.name===item.name).length>1 ? ` · ${item.organization_name}`:''}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu><Button variant="ghost" disabled={modelsLoading} onClick={() => void refreshModels()} type="button"><RefreshCw size={14}/><span>{modelsLoading ? uiT("Refreshing…") : uiT("Refresh")}</span></Button></div>}/>;
      const failure=modelsError && <Alert variant="destructive"><AlertDescription>{modelsError}<Button variant="ghost" disabled={modelsLoading} onClick={()=>void refreshModels()}>{uiT("Retry model catalog")}</Button></AlertDescription></Alert>;
      return !models.length && (modelsLoading || modelsError)
        ? <>{header}{failure}{modelsLoading && <TableSkeleton columns={5} rows={8} label={uiT("Loading model catalog…")} />}</>
        : <ModelTable models={models} header={<>{header}{failure}</>}/>;
    }}
  </ConnectGate>;
}
