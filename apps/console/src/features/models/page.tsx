import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import ConnectGate from '@/app/ConnectGate';
import ModelTable from './components/ModelTable';

export default function ModelsRoute() {
  return <ConnectGate title="Models" subtitle="Review the provider routes exposed by this Niu gateway.">
    {({ models, refreshModels }) => <>
      <PageHeader title="Models" subtitle="Review the provider routes exposed by this Niu gateway." />
      <section className="panel">
        <div className="panel-heading">
          <div><h2>Configured routes</h2><p>Provider credentials stay on the server. Public listing is set in route configuration.</p></div>
          <Button variant="outline" onClick={() => void refreshModels()} type="button"><RefreshCw size={14} /><span>Refresh</span></Button>
        </div>
        <ModelTable models={models} />
      </section>
    </>}
  </ConnectGate>;
}
