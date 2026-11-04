import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { request } from '@/lib/api-client';
import { useLocale } from '@/shell/ui-locale';

type WorkspaceIncidents = { data: { model: string }[]; more: boolean };

export default function WorkspaceIncidentNotice({ token, workspaceId, workspaceSlug }: { token: string; workspaceId: string; workspaceSlug: string }) {
  const { t } = useLocale();
  const [models, setModels] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(false);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const result = await request<WorkspaceIncidents>(token, `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/incidents`, 'GET', undefined, controller.signal);
        if (!Array.isArray(result.data) || result.data.some(item => typeof item?.model !== 'string' || !item.model.trim()) || typeof result.more !== 'boolean') throw new Error('Invalid incident response');
        if (!controller.signal.aborted) { setModels(result.data.map(item => item.model)); setMore(result.more); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { if (!controller.signal.aborted) setChecked(true); pending = false; }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [token, workspaceId]);
  if (!checked) return <p role="status" className="mb-4 text-sm text-muted-foreground">{t('Checking model incidents…', '正在检查模型事故…')}</p>;
  if (!models.length && !error) return null;
  return <Alert variant={models.length ? 'destructive' : 'default'} className="mb-6">
    <AlertTitle>{models.length ? t('Some model requests need attention', '部分模型请求需要处理') : t('Model incident status unavailable', '无法读取模型事故状态')}</AlertTitle>
    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        {models.length > 0 && <p className="break-words">{t('Affected models:', '受影响的模型：')} {models.slice(0, 3).join(', ')}{models.length > 3 || more ? '…' : ''}</p>}
        <p>{error ? t('Could not refresh incident status. Check your request logs before assuming recovery.', '无法刷新事故状态。确认恢复前请检查请求日志。') : t('Review your failed requests and contact your platform operator. A retry may incur charges.', '请检查失败的请求并联系平台操作者。重试可能产生费用。')}</p>
      </div>
      <Button asChild variant="outline" size="sm"><Link to={`/workspaces/${encodeURIComponent(workspaceSlug)}/executions`}>{t('View logs', '查看日志')}</Link></Button>
    </AlertDescription>
  </Alert>;
}
