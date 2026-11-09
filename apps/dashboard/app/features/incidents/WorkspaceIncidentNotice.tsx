import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { request } from '@/lib/api-client';
import { peekQuery, primeQuery } from '@/lib/query-cache';
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
  const [more, setMore] = useState(() => cached?.more ?? false);
  const [notifications, setNotifications] = useState<WorkspaceNotifications | null>(() => cached?.notifications ?? null);
  const [error, setError] = useState(false);
  const [checked, setChecked] = useState(() => cached !== undefined);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const result = await request<WorkspaceIncidents>(token, endpoint, 'GET', undefined, controller.signal);
        const note = result.notifications;
        if (!Array.isArray(result.data) || result.data.some(item => typeof item?.model !== 'string' || !item.model.trim() || typeof item.owner_funded !== 'boolean') || typeof result.more !== 'boolean'
          || !note || !['none', 'not_configured', 'authority_inactive', 'queued', 'sending', 'delivered', 'failed'].includes(note.state)
          || !['incidents', 'subscribers', 'authorized', 'delivered', 'failed', 'cancelled', 'queued', 'sending', 'not_configured', 'authority_inactive'].every(key => typeof (note as unknown as Record<string, unknown>)[key] === 'number')) throw new Error('Invalid incident response');
        if (!controller.signal.aborted) {
          primeQuery(token, endpoint, result);
          setModels(result.data); setMore(result.more); setNotifications(note); setError(false);
        }
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { if (!controller.signal.aborted) setChecked(true); pending = false; }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [token, endpoint]);
  if (!checked) return <p role="status" className="sr-only">{t('Checking model incidents…', '正在检查模型事故…')}</p>;
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const isTrafficSurface = path === '/' || path === `/workspaces/${encodeURIComponent(workspaceSlug)}` || path.endsWith('/executions') || path.endsWith('/usage');
  if (!models.length && (!error || !isTrafficSurface)) return null;
  return <Alert variant={models.length ? 'destructive' : 'default'} className="mb-6">
    <AlertTitle>{models.length ? t('Some model requests need attention', '部分模型请求需要处理') : t('Model incident status unavailable', '无法读取模型事故状态')}</AlertTitle>
    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        {models.some(item => item.owner_funded) && <div>
          <p className="break-words">{t('Your Provider connection:', '您的 Provider 连接：')} {models.filter(item => item.owner_funded).slice(0, 3).map((item, idx) => <span key={item.model}>{idx > 0 ? ', ' : ''}{catalogTitle(item.model)}{catalogTitle(item.model) !== item.model && <span className="sr-only"> {item.model}</span>}</span>)}{models.filter(item => item.owner_funded).length > 3 || more ? '…' : ''}</p>
          {!error && <p>{t('Check your Provider account or contact the person who manages its connection. The Provider may charge for retries.', '请检查您的 Provider 账户或联系连接管理员。Provider 可能对重试收费。')}</p>}
        </div>}
        {models.some(item => !item.owner_funded) && <div>
          <p className="break-words">{t('Platform supply:', '平台供应：')} {models.filter(item => !item.owner_funded).slice(0, 3).map((item, idx) => <span key={item.model}>{idx > 0 ? ', ' : ''}{catalogTitle(item.model)}{catalogTitle(item.model) !== item.model && <span className="sr-only"> {item.model}</span>}</span>)}{models.filter(item => !item.owner_funded).length > 3 || more ? '…' : ''}</p>
          {!error && <p>{t('Review your failed requests and contact your platform operator. A retry may incur charges.', '请检查失败的请求并联系平台操作者。重试可能产生费用。')}</p>}
        </div>}
        {error && <p>{t('Could not refresh incident status. Check your request logs before assuming recovery.', '无法刷新事故状态。确认恢复前请检查请求日志。')}</p>}
        {!error && notifications && models.length > 0 && <p className="text-sm text-muted-foreground">{notifications.state === 'not_configured'
          ? t('No external notification receiver is configured for this workspace. Niu records the incident here; no message was sent.', '此工作空间未配置外部通知接收方。Niu 会在此记录事故，但不会发送消息。')
          : notifications.state === 'authority_inactive'
            ? t('An incident receiver is configured, but its authorizing access is inactive. No external message will be sent until an agent restores it.', '已配置事故通知接收方，但其授权当前不可用。在代理恢复授权前不会发送外部消息。')
            : notifications.state === 'delivered'
              ? t('A receiver acknowledged the incident notification. Acknowledgement does not prove processing.', '接收方已确认事故通知。确认不代表已处理。')
              : notifications.state === 'failed'
                ? t('Incident notification delivery failed. Review the receiver and delivery evidence.', '事故通知送达失败。请检查接收方与送达记录。')
                : notifications.state === 'sending'
                  ? t('An incident notification delivery attempt is in progress.', '正在发送事故通知。')
                  : t('An incident notification is queued. No receiver has acknowledged it yet.', '事故通知已排队，接收方尚未确认。')}</p>}
      </div>
      <Button asChild variant="outline" size="sm"><Link to={`/workspaces/${encodeURIComponent(workspaceSlug)}/executions`}>{t('View logs', '查看日志')}</Link></Button>
    </AlertDescription>
  </Alert>;
}
