import { IconRefresh as RefreshCw } from "@tabler/icons-react";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import ConnectGate from '@/app/ConnectGate';
import ModelTable from './components/ModelTable';

export default function ModelsRoute() {
  return <ConnectGate>
    {({ models, modelsLoading, modelsError, refreshModels }) => {
      const header=<PageHeader title="Models" className="models-page-heading" action={<Button variant="ghost" disabled={modelsLoading} onClick={() => void refreshModels()} type="button"><RefreshCw size={14}/><span>{modelsLoading ? 'Refreshing…' : 'Refresh'}</span></Button>}/>;
      const failure=modelsError && <Alert variant="destructive"><AlertDescription>{modelsError}<Button variant="ghost" disabled={modelsLoading} onClick={()=>void refreshModels()}>Retry model catalog</Button></AlertDescription></Alert>;
      return !models.length && (modelsLoading || modelsError)
        ? <>{header}{failure}{modelsLoading && <p role="status" className="p-6 text-muted-foreground">Loading model catalog…</p>}</>
        : <ModelTable models={models} header={<>{header}{failure}</>}/>;
    }}
  </ConnectGate>;
}
