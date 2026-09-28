import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import ConnectGate from '@/app/ConnectGate';
import ModelTable from './components/ModelTable';

export default function ModelsRoute() {
  const subtitle = 'Review the provider routes exposed by this Niu gateway.';
  const catalogAction = <Button asChild variant="outline" size="sm"><a href={`${import.meta.env.BASE_URL}models/`}>Browse catalog<ArrowUpRight size={14} /></a></Button>;
  return <ConnectGate subtitle={subtitle} className="models-page-heading" action={catalogAction}>
    {({ models, refreshModels }) => <>
      <PageHeader
        className="models-page-heading"
        subtitle={subtitle}
        action={catalogAction}
      />
      <section className="panel">
        <div className="panel-heading model-routes-heading">
          <div><h2>Configured routes</h2></div>
          <div className="model-route-actions">
            <Button asChild variant="outline"><Link to="../vendors">Manage providers<ArrowUpRight size={14} /></Link></Button>
            <Button variant="ghost" onClick={() => void refreshModels()} type="button"><RefreshCw size={14} /><span>Refresh</span></Button>
          </div>
        </div>
        <ModelTable models={models} />
      </section>
    </>}
  </ConnectGate>;
}
