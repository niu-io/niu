import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useRef, useState, type ReactNode } from 'react';
import { workspaceDisplayName } from '@/shell/workspace-route';
import { IconSearch, IconUsers } from '@tabler/icons-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { IconDots as MoreHorizontal } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/PageSkeletons';
import type { NamedResource, Operator } from '../api';

function displayScope(operator: Operator, organizations: NamedResource[], projects: NamedResource[]) {
  const organization = organizations.find(item => item.id === operator.organization_id)?.name ?? 'Organization';
  if (!operator.project_id) return organization + ' · all workspaces';
  const workspace = projects.find(item => item.id === operator.project_id)?.name ?? 'Workspace';
  return organization + ' · ' + workspaceDisplayName(workspace);
}

function roleLabel(role: Operator['role'], uiT: (en: string, zh?: string) => string) {
  if (role === 'owner') return uiT('Owner', '所有者');
  if (role === 'admin') return uiT('Admin', '管理员');
  return uiT('Viewer', '查看者');
}

export default function OperatorDirectory({ operators, organizations, projects, loading, disabled, onSelect, onAdd, onRevoke, actions }: {
  actions?: ReactNode;
  operators: Operator[];
  organizations: NamedResource[];
  projects: NamedResource[];
  selectedId: string;
  loading: boolean;
  disabled: boolean;
  projectScope: boolean;
  onSelect: (id: string, trigger?: HTMLButtonElement) => void;
  onAdd: () => void;
  onRevoke?: (operator: Operator) => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const actionTriggers = useRef(new Map<string, HTMLButtonElement>());
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = operators.filter(operator => {
    const text = [operator.name, roleLabel(operator.role, uiT), displayScope(operator, organizations, projects), operator.revoked ? 'Revoked' : 'Active'].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
  return <section aria-label={uiT("Workspace members", "工作空间成员")} className="operator-directory space-y-4">
    <div className="flex flex-wrap items-center justify-end gap-2">{operators.length > 0 && <Popover><PopoverTrigger asChild><Button ref={searchTriggerRef} type="button" variant="ghost" size="icon" aria-label={uiT("Search users")} title={uiT("Search users")} className={search ? "text-primary bg-accent" : undefined}><IconSearch size={17}/></Button></PopoverTrigger><PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-2"><Input autoFocus ref={searchInput} type="search" aria-label={uiT("Search users")} placeholder={uiT("Search users…")} value={search} onChange={event => setSearch(event.target.value)} />{search && <Button variant="ghost" size="sm" onClick={()=>setSearch('')}>{uiT("Reset search")}</Button>}</PopoverContent></Popover>}{actions}</div>
    {loading
      ? <TableSkeleton columns={5} rows={5} label={uiT("Loading users…")} />
      : operators.length === 0
        ? <Empty className="operator-directory-empty"><EmptyHeader><EmptyMedia variant="icon"><IconUsers aria-hidden="true"/></EmptyMedia><EmptyTitle>{uiT("No members yet", "还没有成员")}</EmptyTitle><EmptyDescription>{uiT("Invite someone by email and choose their role and workspace access.", "通过邮箱邀请成员，并选择其角色与工作空间访问范围。")}</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" variant="outline" disabled={disabled} onClick={onAdd}>{uiT("Invite first member", "邀请第一位成员")}</Button></EmptyContent></Empty>
        : matches.length === 0
          ? <Empty className="operator-directory-empty" role="status"><EmptyHeader><EmptyMedia variant="icon"><IconSearch aria-hidden="true"/></EmptyMedia><EmptyTitle>{uiT("No matching users")}</EmptyTitle><EmptyDescription>{uiT("Try another name, role, or status.")}</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" variant="outline" onClick={() => { setSearch(''); searchTriggerRef.current?.focus(); }}>{uiT("Clear search")}</Button></EmptyContent></Empty>
          : <Table>
            <TableHeader><TableRow><TableHead>{uiT("User", "成员")}</TableHead><TableHead>{uiT("Workspace")}</TableHead><TableHead>{uiT("Role")}</TableHead><TableHead className="hidden sm:table-cell">{uiT("Status")}</TableHead><TableHead className="w-12"><span className="sr-only">{uiT("Actions")}</span></TableHead></TableRow></TableHeader>
            <TableBody>{matches.map(operator => <TableRow key={operator.id}>
              <TableCell className="whitespace-normal">
                <Button type="button" variant="link" className="h-auto max-w-full p-0 text-left whitespace-normal break-words" disabled={disabled} onClick={event => onSelect(operator.id, event.currentTarget)}>{operator.name}</Button>
                <p className="text-xs text-muted-foreground sm:hidden">{operator.revoked ? uiT("Revoked") : uiT("Active")}</p>
              </TableCell>
              <TableCell className="whitespace-normal">{operator.project_id
                ? workspaceDisplayName(projects.find(item => item.id === operator.project_id)?.name ?? uiT('Workspace'))
                : uiT('All workspaces')}</TableCell>
              <TableCell>{roleLabel(operator.role, uiT)}</TableCell>
              <TableCell className="hidden sm:table-cell"><Badge variant={operator.revoked ? 'secondary' : 'outline'} className="lifecycle-badge" data-tone={operator.revoked ? 'inactive' : 'active'}><span className="status-dot" aria-hidden="true" />{operator.revoked ? uiT("Revoked") : uiT("Active")}</Badge></TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button ref={element => { if (element) actionTriggers.current.set(operator.id, element); else actionTriggers.current.delete(operator.id); }} type="button" variant="ghost" size="icon" aria-label={uiF("Actions for {0}", [operator.name])} disabled={disabled}><MoreHorizontal size={16} /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onSelect(operator.id, actionTriggers.current.get(operator.id))}>{uiT("Access sessions")}</DropdownMenuItem>
                    {!operator.revoked && onRevoke && <DropdownMenuItem variant="destructive" onSelect={() => onRevoke(operator)}>{uiT("Revoke access")}</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>)}</TableBody>
          </Table>}
  </section>;
}
