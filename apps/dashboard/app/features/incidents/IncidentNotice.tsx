import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { fetchQuery, peekQuery } from '@/lib/query-cache';
import { useLocale } from '@/shell/ui-locale';
import { loadIncidents } from './api';

export default function IncidentNotice({ token }: { token: string }) {
  const path = useLocation().pathname.replace(/\/+$/, '') || '/';
  const connectionSections = ['providers', 'suppliers', 'routing', 'pools', 'model-pools', 'route-pools'];
  const visible = path === '/' || path === '/admin' ||
    connectionSections.some(section => path === `/admin/${section}` || path.startsWith(`/admin/${section}/`));
  return visible ? <ConnectionNotice token={token} /> : null;
}

function ConnectionNotice({ token }: { token: string }) {
  const { t } = useLocale();
  const cacheKey = '/api/v1/admin/incidents?status=active';
  const cachedActive = peekQuery<boolean>(token, cacheKey);
  const [active, setActive] = useState(() => cachedActive ?? false);
  const [error, setError] = useState(false);
  const [checked, setChecked] = useState(() => cachedActive !== undefined);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const hasActive = await fetchQuery<boolean>(
          token,
          cacheKey,
          async signal => {
            const page = await loadIncidents(token, 'active', signal);
            return page.data.length > 0;
          },
          { freshMs: 0, awaitRevalidate: true, background: true, signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setActive(hasActive);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setChecked(true);
        pending = false;
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [token]);
  if (!checked) return <p role="status" className="sr-only">{t('Checking connection incidents…', '正在检查连接事故…')}</p>;
  if (!active && !error) return null;
  return <Alert variant={active ? 'destructive' : 'default'} className="mb-6">
    <AlertTitle>{active ? t('Upstream connections need attention', '上游连接需要处理') : t('Connection monitoring unavailable', '无法读取连接监控')}</AlertTitle>
    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
      <p>{error ? t('Could not refresh incident evidence. Review the last known state before assuming recovery.', '无法刷新事故证据，请检查已有记录后再判断是否恢复。') : t('Review affected models and the action needed to restore access.', '查看受影响的模型及恢复访问所需的操作。')}</p>
      <Button asChild variant="outline" size="sm"><Link to="/admin/incidents">{t('View incidents', '查看事故')}</Link></Button>
    </AlertDescription>
  </Alert>;
}
