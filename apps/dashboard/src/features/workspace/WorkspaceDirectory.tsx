import { Area, AreaChart } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { useState } from 'react';
import { Link } from 'react-router';
import { IconDotsVertical, IconPlus, IconSettings, IconList, IconKey, IconUsers } from '@tabler/icons-react';
import type { DashboardContext } from '@/app/dashboard-context';
import { workspaceDisplayName, workspacePathSegment } from '@/app/workspace-route';
import { WorkspaceCreateDialog } from '@/app/WorkspaceSwitcher';
import PageHeader from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

export default function WorkspaceDirectory({context}: {context: DashboardContext}) {
  const [creating, setCreating] = useState(false);
  const canCreate = Boolean(context.session?.permissions.write && (context.session.kind === 'installation' || context.session.operator?.project_id === null));
  const date = (value: number) => new Intl.DateTimeFormat('en', {month: 'short', day: 'numeric', year: 'numeric'}).format(value);
  return <>
    <PageHeader title="Workspaces" action={canCreate && <Button className="header-icon-action" aria-label="Create workspace" title="Create workspace" onClick={() => setCreating(true)}><IconPlus aria-hidden="true"/><span>Create workspace</span></Button>}/>
    {context.workspaceLoading ? <p role="status" className="text-sm text-muted-foreground">Loading workspaces…</p>
      : context.workspaceError ? <div role="alert" className="grid justify-items-start gap-3"><p>Could not load your workspaces.</p><Button variant="secondary" onClick={context.reloadWorkspaces}>Try again</Button></div>
      : context.workspaces.length === 0 ? <p className="text-sm text-muted-foreground">No workspaces available.</p>
      : <Table aria-label="Workspaces">
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="hidden sm:table-cell">Active API keys</TableHead><TableHead className="hidden sm:table-cell">Requests · 30 days</TableHead><TableHead className="hidden sm:table-cell">Last request</TableHead><TableHead className="w-12 text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
        <TableBody>{context.workspaces.map(workspace => {
          const name = workspaceDisplayName(workspace.name);
          const path = `/workspaces/${workspacePathSegment(workspace, context.workspaces)}`;
          return <TableRow key={workspace.id}>
            <TableCell className="whitespace-normal min-w-48"><Link to={path} className="font-medium hover:underline break-words">{name}</Link>{workspace.is_default && <Badge variant="secondary" className="ml-2">Default</Badge>}
              <p className="mt-1 text-xs text-muted-foreground">{workspace.organization_name}</p>
              {workspace.requests_by_day?.length ? <ChartContainer config={{request_count:{label:'Requests',color:'var(--chart-1)'}}} className="mt-2 h-10 w-36" aria-label={`Daily requests for ${name} · past 30 calendar days · UTC`}><AreaChart accessibilityLayer data={workspace.requests_by_day}><ChartTooltip content={<ChartTooltipContent labelFormatter={(_label,payload) => payload[0]?.payload ? new Intl.DateTimeFormat('en',{month:'short',day:'numeric',timeZone:'UTC'}).format(payload[0].payload.start_ms)+' UTC' : ''}/>}/><Area dataKey="request_count" type="linear" stroke="var(--color-request_count)" fill="var(--color-request_count)" fillOpacity={0.12} strokeWidth={1.5} isAnimationActive={false}/></AreaChart></ChartContainer> : null}
              {workspace.created_at_ms != null && <p className="mt-1 text-xs text-muted-foreground">Created {date(workspace.created_at_ms)}</p>}
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:hidden">
                <div><dt className="text-muted-foreground">Active API keys</dt><dd className="mt-1"><Link className="hover:underline" to={`${path}/keys`}>{workspace.active_key_count?.toLocaleString('en') ?? 'Unavailable'}</Link></dd></div>
                <div><dt className="text-muted-foreground">Requests · 30 days</dt><dd className="mt-1"><Link className="hover:underline" to={`${path}/executions`}>{workspace.requests_30d?.toLocaleString('en') ?? 'Unavailable'}</Link></dd></div>
                <div className="col-span-2"><dt className="text-muted-foreground">Last request</dt><dd className="mt-1">{workspace.last_request_at_ms != null ? date(workspace.last_request_at_ms) : workspace.requests_30d == null ? 'Unavailable' : 'No requests yet'}</dd></div>
              </dl>
            </TableCell>
            <TableCell className="hidden sm:table-cell"><Link className="hover:underline tabular-nums" to={`${path}/keys`}>{workspace.active_key_count?.toLocaleString('en') ?? 'Unavailable'}</Link></TableCell>
            <TableCell className="hidden sm:table-cell"><Link className="hover:underline tabular-nums" to={`${path}/executions`}>{workspace.requests_30d?.toLocaleString('en') ?? 'Unavailable'}</Link></TableCell>
            <TableCell className="hidden sm:table-cell text-muted-foreground">{workspace.last_request_at_ms != null ? date(workspace.last_request_at_ms) : workspace.requests_30d == null ? 'Unavailable' : 'No requests yet'}</TableCell>
            <TableCell className="text-right align-top sm:align-middle"><DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${name}`}><IconDotsVertical aria-hidden="true"/></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" collisionPadding={12}>
                <DropdownMenuItem asChild><Link to={`${path}/settings`}><IconSettings/>Workspace settings</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to={`${path}/executions`}><IconList/>View logs</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to={`${path}/keys`}><IconKey/>API keys</Link></DropdownMenuItem>
                {context.session?.permissions.manage_operators && <DropdownMenuItem asChild><Link to={`${path}/users`}><IconUsers/>Users</Link></DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>}
    <WorkspaceCreateDialog context={context} open={creating} onOpenChange={setCreating}/>
  </>;
}
