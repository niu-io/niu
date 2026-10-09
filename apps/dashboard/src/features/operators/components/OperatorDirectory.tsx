import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useRef, useState } from 'react';
import { workspaceDisplayName } from '@/app/workspace-route';
import { IconSearch, IconUsers } from '@tabler/icons-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { IconDots as MoreHorizontal } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { NamedResource, Operator } from '../api';

function displayScope(operator: Operator, organizations: NamedResource[], projects: NamedResource[]) {
  const organization = organizations.find(item => item.id === operator.organization_id)?.name ?? 'Organization';
  if (!operator.project_id) return organization + ' · all workspaces';
  const workspace = projects.find(item => item.id === operator.project_id)?.name ?? 'Workspace';
  return organization + ' · ' + workspaceDisplayName(workspace);
}

function roleLabel(role: Operator['role']) {
  return role[0].toUpperCase() + role.slice(1);
}

export default function OperatorDirectory({ operators, organizations, projects, loading, disabled, onSelect, onAdd, onRevoke }: {
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
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const actionTriggers = useRef(new Map<string, HTMLButtonElement>());
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = operators.filter(operator => {
    const text = [operator.name, roleLabel(operator.role), displayScope(operator, organizations, projects), operator.revoked ? 'Revoked' : 'Active'].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
  return <section aria-label="Workspace users" className="operator-directory space-y-4">
    {operators.length > 0 && <Popover><PopoverTrigger asChild><Button ref={searchTriggerRef} type="button" variant="ghost" size="icon" aria-label="Search users" title="Search users" className={search ? "text-primary bg-accent" : undefined}><IconSearch size={17}/></Button></PopoverTrigger><PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-2"><Input autoFocus ref={searchInput} type="search" aria-label="Search users" placeholder="Search users…" value={search} onChange={event => setSearch(event.target.value)} />{search && <Button variant="ghost" size="sm" onClick={()=>setSearch('')}>Reset search</Button>}</PopoverContent></Popover>}
    {loading
      ? <p className="py-8 text-sm text-muted-foreground" role="status">Loading users…</p>
      : operators.length === 0
        ? <Empty className="operator-directory-empty"><EmptyHeader><EmptyMedia variant="icon"><IconUsers aria-hidden="true"/></EmptyMedia><EmptyTitle>No users yet</EmptyTitle><EmptyDescription>Add a user and choose their role in this workspace.</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" variant="outline" disabled={disabled} onClick={onAdd}>Add first user</Button></EmptyContent></Empty>
        : matches.length === 0
          ? <Empty className="operator-directory-empty" role="status"><EmptyHeader><EmptyMedia variant="icon"><IconSearch aria-hidden="true"/></EmptyMedia><EmptyTitle>No matching users</EmptyTitle><EmptyDescription>Try another name, role, or status.</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" variant="outline" onClick={() => { setSearch(''); searchTriggerRef.current?.focus(); }}>Clear search</Button></EmptyContent></Empty>
          : <Table>
            <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead className="hidden sm:table-cell">Status</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>{matches.map(operator => <TableRow key={operator.id}>
              <TableCell className="whitespace-normal">
                <Button type="button" variant="link" className="h-auto max-w-full p-0 text-left whitespace-normal break-words" disabled={disabled} onClick={event => onSelect(operator.id, event.currentTarget)}>{operator.name}</Button>
                {!operator.project_id && <p className="text-xs text-muted-foreground">All workspaces</p>}
                <p className="text-xs text-muted-foreground sm:hidden">{operator.revoked ? 'Revoked' : 'Active'}</p>
              </TableCell>
              <TableCell>{roleLabel(operator.role)}</TableCell>
              <TableCell className="hidden sm:table-cell text-muted-foreground">{operator.revoked ? 'Revoked' : 'Active'}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button ref={element => { if (element) actionTriggers.current.set(operator.id, element); else actionTriggers.current.delete(operator.id); }} type="button" variant="ghost" size="icon" aria-label={`Actions for ${operator.name}`} disabled={disabled}><MoreHorizontal size={16} /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onSelect(operator.id, actionTriggers.current.get(operator.id))}>Access sessions</DropdownMenuItem>
                    {!operator.revoked && onRevoke && <DropdownMenuItem variant="destructive" onSelect={() => onRevoke(operator)}>Revoke access</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>)}</TableBody>
          </Table>}
  </section>;
}
