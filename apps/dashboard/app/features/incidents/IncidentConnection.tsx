import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import ProvidersView from '@/features/providers/components/ProvidersView';
import { request } from '@/lib/api-client';
import { useDashboardContext } from '@/shell/dashboard-context';
import { useLocale } from '@/shell/ui-locale';

export default function IncidentConnection({ reference }: { reference: string }) {
  const context = useDashboardContext();
  const { t } = useLocale();
  const [connection, setConnection] = useState<string>();
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setConnection(undefined); setError(false);
    if (!/^incident-[1-9][0-9]*$/.test(reference)) { setError(true); return () => controller.abort(); }
    void request<{ data: { connection_id: string } }>(context.token, `/api/v1/incidents/${encodeURIComponent(reference)}/connection`, 'GET', undefined, controller.signal)
      .then(result => {
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(result.data?.connection_id)) throw new Error('Invalid connection');
        if (!controller.signal.aborted) setConnection(result.data.connection_id);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [context.token, reference]);
  return <div className="space-y-4">
    <Button asChild variant="outline" size="sm"><Link to="/admin/incidents">{t('Back to incidents', '返回事故')}</Link></Button>
    {error ? <Alert variant="destructive"><AlertDescription>{t('This incident or connection is unavailable. Return to incidents and refresh before taking action.', '此事故或连接不可用。请返回事故并刷新后再操作。')}</AlertDescription></Alert>
      : connection && context.session ? <ProvidersView key={`${context.token}:${connection}`} token={context.token} session={context.session} refreshWorkspace={context.refreshWorkspace} fixedConnectionId={connection} />
        : <p role="status">{t('Loading connection…', '正在加载连接…')}</p>}
  </div>;
}
