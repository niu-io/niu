import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import ConnectGate from '@/app/ConnectGate';
import ModelTable from './components/ModelTable';

export default function ModelsRoute() {
  return <ConnectGate>
    {({ models, refreshModels }) => <ModelTable models={models} header={<PageHeader
        title="Models"
        className="models-page-heading"
        action={<Button variant="ghost" onClick={() => void refreshModels()} type="button"><RefreshCw size={14} /><span>Refresh</span></Button>}
      />} />}
  </ConnectGate>;
}
