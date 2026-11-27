import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { request } from '@/lib/api-client';
import { fetchQuery, peekQuery } from '@/lib/query-cache';
import { catalogTitle } from '@/lib/providers';
import { useLocale } from '@/shell/ui-locale';

type WorkspaceNotifications = {
  state: 'none' | 'not_configured' | 'authority_inactive' | 'queued' | 'sending' | 'delivered' | 'failed';
  incidents: number; subscribers: number; authorized: number;
  delivered: number; failed: number; cancelled: number; queued: number; sending: number;
  not_configured: number; authority_inactive: number;
};
type WorkspaceIncidents = { data: { model: string; owner_funded: boolean }[]; more: boolean; notifications: WorkspaceNotifications };

export default function WorkspaceIncidentNotice({ token, workspaceId, workspaceSlug }: { token: string; workspaceId: string; workspaceSlug: string }) {
  const { t } = useLocale();
  const location = useLocation();
  const endpoint = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/incidents`;
  const cached = peekQuery<WorkspaceIncidents>(token, endpoint);
  const [models, setModels] = useState<WorkspaceIncidents['data']>(() => cached?.data ?? []);
  const [expanded, setExpanded] = useState(false);
  const [pages, setPages] = useState(1);
  const [fetching, setFetching] = useState(false);
  const [more, setMore] = useState(() => cached?.more ?? false);
  const [notifications, setNotifications] = useState<WorkspaceNotifications | null>(() => cached?.notifications ?? null);
  const [error, setError] = useState(false);
  const [checked, setChecked] = useState(() => cached !== undefined);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh(interactive = false) {
      if (pending) return;
      pending = true;
      if (interactive) setFetching(true);
      try {
        const result = await fetchQuery<WorkspaceIncidents>(
          token,
          endpoint,
          async signal => {
            const parsed = await request<WorkspaceIncidents>(token, endpoint, 'GET', undefined, signal);
            const note = parsed.notifications;
            if (!Array.isArray(parsed.data) || parsed.data.some(item => typeof item?.model !== 'string' || !item.model.trim() || typeof item.owner_funded !== 'boolean') || typeof parsed.more !== 'boolean'
              || !note || !['none', 'not_configured', 'authority_inactive', 'queued', 'sending', 'delivered', 'failed'].includes(note.state)
              || !['incidents', 'subscribers', 'authorized', 'delivered', 'failed', 'cancelled', 'queued', 'sending', 'not_configured', 'authority_inactive'].every(key => typeof (note as unknown as Record<string, unknown>)[key] === 'number')) throw new Error('Invalid incident response');
            return parsed;
          },
          { freshMs: 0, awaitRevalidate: true, background: true, signal: controller.signal },
        );
        let page = result;
        const allModels = [...page.data];
        for (let n = 1; n < pages && page.more; n++) {
          const last = page.data.at(-1);
          if (!last) throw new Error('Invalid incident cursor');
          const query = new URLSearchParams({ after_model: last.model, after_owner_funded: String(last.owner_funded) });
          page = await request<WorkspaceIncidents>(token, `${endpoint}?${query}`, 'GET', undefined, controller.signal);
          if (page.data.some(item => item.model === last.model && item.owner_funded === last.owner_funded)) throw new Error('Incident cursor did not advance');
          allModels.push(...page.data);
        }
        if (!controller.signal.aborted) {
          setModels(allModels); setMore(page.more); setNotifications(result.notifications); setError(false);
        }
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { if (!controller.signal.aborted) { setChecked(true); setFetching(false); } pending = false; }
    }
    void refresh(true);
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [token, endpoint, pages]);
  if (!checked) return <p role="status" className="sr-only">{t('Checking model incidents…', '正在检查模型事故…')}</p>;
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const isTrafficSurface = path === '/' || path === `/workspaces/${encodeURIComponent(workspaceSlug)}` || path.endsWith('/executions') || path.endsWith('/usage');
  if (!models.length && (!error || !isTrafficSurface)) return null;
  return <Alert variant={models.length ? 'destructive' : 'default'} className="mb-6">
    <AlertTitle>{models.length ? t('Some model requests need attention', '部分模型请求需要处理') : t('Model incident status unavailable', '无法读取模型事故状态')}</AlertTitle>
    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        {[true, false].map(ownerFunded => {
          const affected = models.filter(item => item.owner_funded === ownerFunded);
          if (!affected.length) return null;
          const visible = expanded ? affected : affected.slice(0, 3);
          return <div key={String(ownerFunded)}>
            <div className="break-words">{ownerFunded ? t('Affected models:', '受影响的模型：') : t('Platform supply:', '平台供应：')}{' '}
              <span className={expanded ? "mt-1 grid max-h-48 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr)) gap-x-3 gap-y-1 overflow-y-auto" : undefined}>{visible.map((item, index) => <span key={item.model}>{!expanded && index > 0 && ', '}
                <Link className="underline" title={item.model} to={`/workspaces/${encodeURIComponent(workspaceSlug)}/executions?modelAlias=${encodeURIComponent(item.model)}`}>{expanded ? item.model : catalogTitle(item.model)}</Link>
              </span>)}</span>{visible.length < affected.length && '…'}
            </div>
            {!error && <p>{ownerFunded
              ? t('Contact your platform administrator to check the upstream connection.', '请联系平台管理员检查上游连接。')
              : t('Review your failed requests and contact your platform operator. A retry may incur charges.', '请检查失败的请求并联系平台操作者。重试可能产生费用。')}</p>}
          </div>;
        })}
        {(more || [true, false].some(owner => models.filter(item => item.owner_funded === owner).length > 3)) &&
          <Button type="button" variant="link" className="h-auto p-0" aria-expanded={expanded}
            onClick={() => { setExpanded(value => !value); if (expanded) setPages(1); }}>{expanded ? t('Show less') : t('Show affected models', '查看受影响模型')}</Button>}
        {expanded && more && <Button size="sm" variant="outline" disabled={fetching} onClick={() => setPages(current => current + 1)}>{t('Load more')}</Button>}
        {error && <p>{t('Could not refresh incident status. Check your request logs before assuming recovery.', '无法刷新事故状态。确认恢复前请检查请求日志。')}</p>}
        {!error && notifications && notifications.state !== 'none' && <p className="text-sm text-muted-foreground">{{
          not_configured: t('Notification receiver unconfigured', '未配置通知接收方'),
          authority_inactive: t('Notification authorization inactive', '通知授权已停用'),
          delivered: t('Notification acknowledged', '接收方已确认通知'),
          failed: t('Notification delivery failed', '通知发送失败'),
          sending: t('Sending notification', '正在发送通知'),
          queued: t('Notification queued', '通知等待发送'),
        }[notifications.state]}</p>}
      </div>
      <Button asChild variant="outline" size="sm"><Link to={`/workspaces/${encodeURIComponent(workspaceSlug)}/executions`}>{t('View logs', '查看日志')}</Link></Button>
    </AlertDescription>
  </Alert>;
}
