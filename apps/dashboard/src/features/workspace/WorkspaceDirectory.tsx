import { Area, AreaChart } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { useState } from 'react';
import { Link } from 'react-router';
import { IconDotsVertical, IconPlus, IconSettings, IconList, IconKey, IconUsers } from '@tabler/icons-react';
import type { DashboardContext } from '@/app/dashboard-context';
import { workspaceDisplayName, workspacePathSegment } from '@/app/workspace-route';
import { WorkspaceCreateDialog } from '@/app/WorkspaceSwitcher';
import { useLocale } from '@/app/locale';
import PageHeader from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

export default function WorkspaceDirectory({context}: {context: DashboardContext}) {
  const { locale, isZh, t } = useLocale();
  const [creating, setCreating] = useState(false);
  const canCreate = Boolean(context.session?.permissions.write && (context.session.kind === 'installation' || context.session.operator?.project_id === null));
  const date = (value: number) => new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric', year: 'numeric'}).format(value);
  return <>
    <PageHeader title={t('Workspaces', '工作空间')} action={canCreate && <Button className="header-icon-action" aria-label="Create workspace" title={t('Create workspace', '创建工作空间')} onClick={() => setCreating(true)}><IconPlus aria-hidden="true"/><span>{t('Create workspace', '创建工作空间')}</span></Button>}/>
    {context.workspaceLoading ? <p role="status" className="text-sm text-muted-foreground">{t('Loading workspaces…', '正在加载工作空间…')}</p>
      : context.workspaceError ? <div role="alert" className="grid justify-items-start gap-3"><p>{t('Could not load your workspaces.', '无法加载您的工作空间。')}</p><Button variant="secondary" onClick={context.reloadWorkspaces}>{t('Try again', '重试')}</Button></div>
      : context.workspaces.length === 0 ? <p className="text-sm text-muted-foreground">{t('No workspaces available.', '暂无可用工作空间。')}</p>
      : <Table aria-label="Workspaces">
        <TableHeader><TableRow><TableHead>{t('Name', '名称')}</TableHead><TableHead className="hidden sm:table-cell">{t('Active API keys', '有效 API 密钥')}</TableHead><TableHead className="hidden sm:table-cell">{t('Requests · 30 days', '近 30 天请求数')}</TableHead><TableHead className="hidden sm:table-cell">{t('Last request', '最近请求')}</TableHead><TableHead className="w-12 text-right"><span className="sr-only">{t('Actions', '操作')}</span></TableHead></TableRow></TableHeader>
        <TableBody>{context.workspaces.map(workspace => {
          const name = workspaceDisplayName(workspace.name);
          const path = `/workspaces/${workspacePathSegment(workspace, context.workspaces)}`;
          return <TableRow key={workspace.id}>
            <TableCell className="whitespace-normal min-w-48"><Link to={path} className="font-medium hover:underline break-words">{name}</Link>{workspace.is_default && <Badge variant="secondary" className="ml-2">{t('Default', '默认')}</Badge>}
              <p className="mt-1 text-xs text-muted-foreground">{workspace.organization_name}</p>
              {workspace.requests_by_day?.length ? <ChartContainer config={{request_count:{label:t('Requests', '请求数'),color:'var(--chart-1)'}}} className="mt-2 h-10 w-36" aria-label={`Daily requests for ${name} · past 30 calendar days · UTC`}><AreaChart accessibilityLayer data={workspace.requests_by_day}><ChartTooltip content={<ChartTooltipContent labelFormatter={(_label,payload) => payload[0]?.payload ? new Intl.DateTimeFormat(locale,{month:'short',day:'numeric',timeZone:'UTC'}).format(payload[0].payload.start_ms)+' UTC' : ''}/>}/><Area dataKey="request_count" type="linear" stroke="var(--color-request_count)" fill="var(--color-request_count)" fillOpacity={0.12} strokeWidth={1.5} isAnimationActive={false}/></AreaChart></ChartContainer> : null}
              {workspace.created_at_ms != null && <p className="mt-1 text-xs text-muted-foreground">{isZh ? `创建于 ${date(workspace.created_at_ms)}` : `Created ${date(workspace.created_at_ms)}`}</p>}
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:hidden">
                <div><dt className="text-muted-foreground">{t('Active API keys', '有效 API 密钥')}</dt><dd className="mt-1"><Link className="hover:underline" to={`${path}/keys`}>{workspace.active_key_count?.toLocaleString(locale) ?? t('Unavailable', '不可用')}</Link></dd></div>
                <div><dt className="text-muted-foreground">{t('Requests · 30 days', '近 30 天请求数')}</dt><dd className="mt-1"><Link className="hover:underline" to={`${path}/executions`}>{workspace.requests_30d?.toLocaleString(locale) ?? t('Unavailable', '不可用')}</Link></dd></div>
                <div className="col-span-2"><dt className="text-muted-foreground">{t('Last request', '最近请求')}</dt><dd className="mt-1">{workspace.last_request_at_ms != null ? date(workspace.last_request_at_ms) : workspace.requests_30d == null ? t('Unavailable', '不可用') : t('No requests yet', '暂无请求')}</dd></div>
              </dl>
            </TableCell>
            <TableCell className="hidden sm:table-cell"><Link className="hover:underline tabular-nums" to={`${path}/keys`}>{workspace.active_key_count?.toLocaleString(locale) ?? t('Unavailable', '不可用')}</Link></TableCell>
            <TableCell className="hidden sm:table-cell"><Link className="hover:underline tabular-nums" to={`${path}/executions`}>{workspace.requests_30d?.toLocaleString(locale) ?? t('Unavailable', '不可用')}</Link></TableCell>
            <TableCell className="hidden sm:table-cell text-muted-foreground">{workspace.last_request_at_ms != null ? date(workspace.last_request_at_ms) : workspace.requests_30d == null ? t('Unavailable', '不可用') : t('No requests yet', '暂无请求')}</TableCell>
            <TableCell className="text-right align-top sm:align-middle"><DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${name}`}><IconDotsVertical aria-hidden="true"/></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" collisionPadding={12}>
                <DropdownMenuItem asChild><Link to={`${path}/settings`}><IconSettings/>{t('Workspace settings', '工作空间设置')}</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to={`${path}/executions`}><IconList/>{t('View logs', '查看请求日志')}</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to={`${path}/keys`}><IconKey/>{t('API keys', 'API 密钥')}</Link></DropdownMenuItem>
                {context.session?.permissions.manage_operators && <DropdownMenuItem asChild><Link to={`${path}/users`}><IconUsers/>{t('Users', '成员')}</Link></DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>}
    <WorkspaceCreateDialog context={context} open={creating} onOpenChange={setCreating}/>
  </>;
}
