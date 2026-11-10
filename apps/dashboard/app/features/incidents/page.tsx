import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import type { PlatformConnectionIncident } from '@niu-io/sdk/admin';
import PageHeader from '@/components/PageHeader';
import { TableSkeleton } from '@/components/PageSkeletons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDashboardContext } from '@/shell/dashboard-context';
import { catalogTitle } from '@/lib/providers';
import { readLocale, useLocale } from '@/shell/ui-locale';
import { loadIncidents } from './api';
import IncidentConnection from './IncidentConnection';

function notificationLabel(t: (english: string, chinese?: string) => string, value: PlatformConnectionIncident['notifications']) {
  if (value.state === 'delivered') return t('Receiver acknowledged', '接收方已确认');
  if (value.state === 'failed') return t('Delivery failed', '送达失败');
  if (value.state === 'sending') return t('Sending', '发送中');
  if (value.state === 'queued') return t('Queued', '排队中');
  if (value.state === 'no_recipients') return t('No affected workspace', '无受影响工作空间');
  const missing = value.not_configured + value.authority_inactive;
  return `${t('Incomplete', '不完整')} · ${missing} ${t('not notified', '未通知')}`;
}

function IncidentList({ token, status }: { token: string; status: 'active' | 'resolved' }) {
  const { t } = useLocale();
  const [rows, setRows] = useState<PlatformConnectionIncident[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false);
    void loadIncidents(token, status, controller.signal, cursor)
      .then(page => {
        if (controller.signal.aborted) return;
        setRows(previous => cursor ? [...previous, ...page.data] : page.data);
        setNext(page.next_before);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, status, cursor, retry]);
  const date = (value: string) => new Intl.DateTimeFormat(readLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  return <section className="space-y-4" aria-label={status === 'active' ? t('Active incidents', '待处理事故') : t('Resolved incidents', '已恢复事故')}>
    {error && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><p>{t('Could not load connection incidents. The current state is unknown.', '无法读取连接事故，当前状态未知。')}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>{t('Try again', '重试')}</Button></AlertDescription></Alert>}
    {loading && !rows.length ? <TableSkeleton label={t('Loading incidents…', '正在加载事故…')} rows={4} columns={4} /> : rows.length ? <Table className="block sm:table">
      <TableHeader className="hidden sm:table-header-group"><TableRow><TableHead>{t('Connection and model', '连接与模型')}</TableHead><TableHead>{t('Issue', '问题')}</TableHead><TableHead>{t('Status', '状态')}</TableHead><TableHead>{t('Observed', '观察时间')}</TableHead><TableHead className="text-right">{t('Recorded failures', '记录的失败次数')}</TableHead><TableHead>{t('Notifications', '通知')}</TableHead><TableHead>{t('Action', '操作')}</TableHead></TableRow></TableHeader>
      <TableBody className="block sm:table-row-group">{rows.map(incident => <TableRow className="block py-3 sm:table-row sm:py-0" key={incident.reference}>
        <TableCell className="block whitespace-normal align-top sm:table-cell"><p className="font-medium">{incident.connection_name}</p><p className="text-sm text-muted-foreground break-words">{catalogTitle(incident.model)}{catalogTitle(incident.model) !== incident.model && <span className="sr-only"> {incident.model}</span>}</p></TableCell>
        <TableCell className="block whitespace-normal align-top sm:table-cell"><p>{incident.cause === 'account_restricted' ? t('Upstream account restricted', '上游账户受限') : incident.cause === 'authentication_rejected' ? t('Upstream authentication rejected', '上游认证被拒绝') : t('Repeated upstream failures', '上游连续故障')}</p><p className="mt-1 text-sm text-muted-foreground">{incident.status === 'resolved' ? t('A later successful request verified the connection and model mapping at that time.', '后续成功请求验证了当时的连接与模型映射。') : incident.cause === 'account_restricted' ? t('Contact the Provider to restore access.', '请联系 Provider 恢复访问。') : incident.cause === 'authentication_rejected' ? t('Replace or reauthorize the API key.', '请更换 API key 或重新授权。') : t('Check the Provider service and connection. A new authorized request can verify recovery and may incur charges; inspect earlier requests before retrying.', '请检查 Provider 服务与连接。新的授权请求可验证恢复，但可能产生费用；重试前请检查先前的请求。')}</p></TableCell><TableCell className="block align-top sm:table-cell"><Badge variant={incident.status === 'active' ? 'destructive' : 'secondary'}>{incident.status === 'active' ? t('Needs attention', '需要处理') : t('Recovered', '已恢复')}</Badge></TableCell>
        <TableCell className="block whitespace-normal align-top sm:table-cell"><p>{date(incident.recovered_at ?? incident.last_observed_at)}</p><p className="mt-1 text-xs text-muted-foreground">{t('First observed', '首次观察')}{' '}{date(incident.first_observed_at)}</p></TableCell><TableCell className="block text-right tabular-nums align-top sm:table-cell"><span className="sm:hidden">{t('Recorded failures', '记录的失败次数')}: </span>{BigInt(incident.observations).toLocaleString(readLocale())}</TableCell>
        <TableCell className="block whitespace-normal align-top sm:table-cell"><p>{notificationLabel(t, incident.notifications)}</p><p className="mt-1 text-xs text-muted-foreground">{incident.notifications.workspaces === 1 ? t('1 affected workspace', '1 个受影响工作空间') : `${incident.notifications.workspaces} ${t('affected workspaces', '个受影响工作空间')}`}</p></TableCell>
        <TableCell className="block align-top sm:table-cell"><Button asChild variant="outline" size="sm"><Link to={incident.provider ? `/admin/providers/${encodeURIComponent(incident.provider.slug)}/keys` : `/admin/incidents?connection=${encodeURIComponent(incident.reference)}`}>{t('Manage connection', '管理连接')}</Link></Button></TableCell>
      </TableRow>)}</TableBody>
    </Table> : !error && <Empty className="min-h-48"><EmptyHeader><EmptyMedia variant="icon"><IconAlertTriangle size={20} aria-hidden="true" /></EmptyMedia><EmptyTitle>{status === 'active' ? t('No active incidents recorded', '暂无待处理事故记录') : t('No recovered incidents recorded', '暂无已恢复事故记录')}</EmptyTitle><EmptyDescription>{t('This view covers recognized account restrictions, authentication refusals and repeated upstream failures. Other failures remain in request logs.', '此处显示已识别的账户限制、认证拒绝及上游连续故障，其他失败请查看请求日志。')}</EmptyDescription></EmptyHeader></Empty>}
    {next && !error && <div className="flex justify-end"><Button variant="outline" disabled={loading} onClick={() => setCursor(next)}>{loading ? t('Loading…', '加载中…') : t('Load more', '加载更多')}</Button></div>}
  </section>;
}

export default function ConnectionIncidents() {
  const context = useDashboardContext();
  const { t } = useLocale();
  const [query, setQuery] = useSearchParams();
  const status = query.get('status') === 'resolved' ? 'resolved' : 'active';
  const [refresh, setRefresh] = useState(0);
  const identity = `${context.token}:${context.session?.kind}:${context.session?.operator?.id ?? ''}`;
  const connectionReference = query.get('connection');
  if (connectionReference !== null) return <IncidentConnection key={connectionReference} reference={connectionReference} />;
  return <div className="w-full min-w-0 space-y-6">
    <PageHeader title={t('Connection incidents', '连接事故')} action={<Button variant="outline" onClick={() => setRefresh(value => value + 1)}><IconRefresh size={16} />{t('Refresh', '刷新')}</Button>} />
    <p className="text-sm text-muted-foreground">{t('Review upstream access failures and evidence of recovery. Configuration changes alone do not confirm recovery.', '查看上游访问失败及恢复证据。仅修改配置不能确认恢复。')}</p>
    <p className="text-sm text-muted-foreground">{t('Detection uses requests actually sent to Providers. No proactive upstream probe is configured, so an idle connection can be unhealthy without an incident here.', '检测依据实际发送给 Provider 的请求。当前未配置主动上游探测，因此空闲连接可能已不可用但没有事故记录。')}</p>
    <Tabs value={status} onValueChange={value => setQuery(current => { const next = new URLSearchParams(current); if (value === 'resolved') next.set('status', value); else next.delete('status'); return next; })}>
      <TabsList><TabsTrigger value="active">{t('Needs attention', '待处理')}</TabsTrigger><TabsTrigger value="resolved">{t('History', '历史记录')}</TabsTrigger></TabsList>
      <TabsContent value="active"><IncidentList key={`${identity}:active:${refresh}`} token={context.token} status="active" /></TabsContent>
      <TabsContent value="resolved"><IncidentList key={`${identity}:resolved:${refresh}`} token={context.token} status="resolved" /></TabsContent>
    </Tabs>
  </div>;
}
