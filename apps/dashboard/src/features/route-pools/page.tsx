import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { IconChevronDown, IconHistory, IconPlus, IconRefresh, IconRoute, IconSearch, IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router';
import { useDashboardContext, type Organization } from '@/app/dashboard-context';
import PageHeader from '@/components/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { request, ProviderRequestError, writeMayHaveCommitted, type ProviderConnection, type ProviderModel } from '@/features/providers/api';
import type { ModelRoutePool, ModelRoutePoolCandidate, ModelRoutePoolRevision } from '../../../../../sdks/javascript/src/admin';

type ScopeFilter = 'all' | 'shared' | 'organization';
type DiscoveredRoute = { alias: string; providerName: string; upstreamModel: string; ownerFunded: boolean; priced: boolean };

const scopeLabels: Record<ScopeFilter, string> = {
  all: 'All scopes',
  shared: 'Shared pools',
  organization: 'Organization pools',
};

function formatDate(value: string) {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Date unavailable';
}

function poolScopeLabel(organizationId: string | null, organizations: Organization[]) {
  if (!organizationId) return 'Shared pool';
  const match = organizations.find(item => item.id === organizationId);
  return match?.name ? match.name : 'Organization-scoped pool';
}

export default function RoutePoolsPage() {
  const { token, organizations } = useDashboardContext();
  return <RoutePoolsView key={token} token={token} organizations={organizations} />;
}

function RoutePoolsView({ token, organizations }: { token: string; organizations: Organization[] }) {
  const [pools, setPools] = useState<ModelRoutePool[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [failedCursor, setFailedCursor] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<ModelRoutePool | 'new' | null>(null);
  const [historyPool, setHistoryPool] = useState<ModelRoutePool | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);

  async function loadPools(after?: string) {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError('');
    setFailedCursor(undefined);
    try {
      const query = new URLSearchParams({ limit: '50' });
      if (after) query.set('after', after);
      const result = await request<{ data: ModelRoutePool[]; has_more: boolean; next_after: string | null }>(
        token,
        '/api/v1/pools/index?' + query.toString(),
        'GET',
        undefined,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (!Array.isArray(result.data) || (after && result.next_after === after)) {
        throw new Error('Model pool page did not advance. Refresh pools.');
      }
      setPools(current => (after ? [...current, ...result.data.filter(row => !current.some(item => item.alias === row.alias))] : result.data));
      setCursor(result.has_more ? result.next_after : null);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setFailedCursor(after);
        setError(reason instanceof Error ? reason.message : 'Model pools could not be loaded.');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    void loadPools();
    return () => activeRequest.current?.abort();
  }, [token]);

  const visiblePools = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return pools.filter(pool => {
      if (scopeFilter === 'shared' && pool.organization_id !== null) return false;
      if (scopeFilter === 'organization' && pool.organization_id === null) return false;
      if (!query) return true;
      const scopeName = poolScopeLabel(pool.organization_id, organizations).toLowerCase();
      const candidateAliases = pool.candidates.map(candidate => candidate.alias.toLowerCase()).join(' ');
      return pool.alias.toLowerCase().includes(query) || scopeName.includes(query) || candidateAliases.includes(query);
    });
  }, [pools, filter, scopeFilter, organizations]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Model pools"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link to="/admin/providers">Providers</Link>
            </Button>
            <Button
              disabled={loading}
              onClick={event => {
                dialogTriggerRef.current = event.currentTarget;
                setNotice('');
                setEditing('new');
              }}
            >
              <IconPlus className="size-4" />
              Create model pool
            </Button>
          </div>
        }
      />
      <p className="text-sm text-muted-foreground">
        Give multiple Provider model routes one model name, then choose their priority and traffic share.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Popover><PopoverTrigger asChild><Button variant="ghost" size="sm">How routing works</Button></PopoverTrigger><PopoverContent align="start" className="space-y-3 text-sm">
          <h2 className="font-semibold">Selection and failover</h2>
          <p>The highest eligible priority wins. Within that tier, weights determine traffic share.</p>
          <p>Chat pools try at most one successor after a qualified OpenRouter authentication rejection. Uncertain or streamed outcomes never trigger automatic failover.</p>
          <p>Configure Provider model mappings before adding them to a pool.</p>
        </PopoverContent></Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={filter.trim() ? 'secondary' : 'outline'}
              size={filter.trim() ? 'sm' : 'icon'}
              aria-label={filter.trim() ? `Filter model pools: ${filter.trim()}` : 'Filter model pools'}
              title="Filter model pools"
            >
              <IconSearch size={16} aria-hidden="true" />
              {filter.trim() && <span className="max-w-36 truncate">{filter.trim()}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-2">
            <Input
              autoFocus
              type="search"
              aria-label="Filter model pools"
              placeholder="Filter by pool or candidate alias"
              value={filter}
              onChange={event => setFilter(event.target.value)}
            />
            {filter && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setFilter('')}>
                Reset search
              </Button>
            )}
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" aria-label="Pool scope filter">
              {scopeLabels[scopeFilter]}
              <IconChevronDown size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Pool scope</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={scopeFilter} onValueChange={value => setScopeFilter(value as ScopeFilter)}>
              {(Object.entries(scopeLabels) as Array<[ScopeFilter, string]>).map(([value, label]) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" disabled={loading} onClick={() => void loadPools()}>
          <IconRefresh size={16} />
          Refresh pools
        </Button>
      </div>

      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadPools(failedCursor)}>
              Retry pools
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {loading && pools.length === 0 ? (
        <p role="status">Loading model pools…</p>
      ) : visiblePools.length > 0 ? (
        <Table aria-label="Model pools">
          <TableHeader className="max-sm:sr-only">
            <TableRow>
              <TableHead>Pool alias</TableHead>
              <TableHead className="hidden md:table-cell">Scope</TableHead>
              <TableHead>Candidate routes</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="sm:w-44">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="max-sm:block max-sm:divide-y">
            {visiblePools.map(pool => {
              const sortedCandidates = [...pool.candidates].sort((a, b) => b.priority - a.priority || b.weight - a.weight || a.alias.localeCompare(b.alias));
              const enabledCandidates = pool.candidates.filter(candidate => candidate.enabled).length;
              const scopeName = poolScopeLabel(pool.organization_id, organizations);
              const statusLabel = !pool.enabled ? 'Disabled' : enabledCandidates > 0 ? 'Enabled' : 'No active candidates';
              return (
                <TableRow key={pool.alias} className="max-sm:block max-sm:space-y-2.5 max-sm:py-3.5">
                  <TableCell className="align-top whitespace-normal max-sm:block max-sm:border-b-0 max-sm:p-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <IconRoute size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                        <strong className="break-words font-medium">{pool.alias}</strong>
                      </div>
                      <Badge
                        variant={pool.enabled && enabledCandidates > 0 ? 'secondary' : 'outline'}
                        className="sm:hidden"
                      >
                        {statusLabel}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Revision {pool.revision}
                      <span className="md:hidden"> · {scopeName}</span>
                    </p>
                  </TableCell>
                  <TableCell className="hidden align-top whitespace-normal md:table-cell">
                    <Badge variant="outline">{scopeName}</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {pool.organization_id ? 'Private to organization' : 'Shared across workspaces'}
                    </p>
                  </TableCell>
                  <TableCell className="align-top whitespace-normal max-sm:block max-sm:border-b-0 max-sm:p-0">
                    <div className="flex flex-wrap gap-1.5">
                      {sortedCandidates.map(candidate => (
                        <Badge
                          key={candidate.alias}
                          variant={candidate.enabled ? 'secondary' : 'outline'}
                          className="max-w-full font-normal"
                        >
                          <span className="truncate">{candidate.alias}</span>
                          <span className="ml-1 shrink-0 text-xs text-muted-foreground">
                            P{candidate.priority} · W{candidate.weight}
                            {!candidate.enabled ? ' · off' : ''}
                          </span>
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {enabledCandidates} of {pool.candidates.length} candidate{pool.candidates.length === 1 ? '' : 's'} enabled
                    </p>
                  </TableCell>
                  <TableCell className="hidden align-top whitespace-normal sm:table-cell">
                    <Badge variant={pool.enabled && enabledCandidates > 0 ? 'secondary' : 'outline'}>
                      {statusLabel}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top max-sm:block max-sm:p-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={loading}
                        onClick={event => {
                          dialogTriggerRef.current = event.currentTarget;
                          setNotice('');
                          setEditing(pool);
                        }}
                      >
                        Edit pool
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={loading}
                        onClick={event => {
                          dialogTriggerRef.current = event.currentTarget;
                          setHistoryPool(pool);
                        }}
                      >
                        <IconHistory size={15} />
                        History
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        !error && (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="font-medium">
              {pools.length > 0 ? 'No model pools match the current filter.' : 'No model pools configured yet.'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {pools.length > 0
                ? 'Try clearing the search query or switching the scope filter.'
                : 'Start by choosing the Provider model routes this pool should use.'}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {pools.length > 0 ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilter('');
                    setScopeFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button
                  onClick={event => {
                    dialogTriggerRef.current = event.currentTarget;
                    setEditing('new');
                  }}
                >
                  <IconPlus className="size-4" />
                  Create model pool
                </Button>
              )}
            </div>
          </div>
        )
      )}

      {cursor && (
        <Button variant="outline" disabled={loading} onClick={() => void loadPools(cursor)}>
          More model pools
        </Button>
      )}

      {editing !== null && (
        <RoutePoolEditorDialog
          token={token}
          organizations={organizations}
          initial={editing === 'new' ? null : editing}
          triggerRef={dialogTriggerRef}
          onClose={() => setEditing(null)}
          onSaved={message => {
            setEditing(null);
            setNotice(message);
            void loadPools();
          }}
          onUncertain={message => {
            setEditing(null);
            setError(message);
          }}
        />
      )}

      {historyPool !== null && (
        <RoutePoolHistoryDialog
          token={token}
          pool={historyPool}
          organizations={organizations}
          triggerRef={dialogTriggerRef}
          onClose={() => setHistoryPool(null)}
        />
      )}
    </div>
  );
}

function RoutePoolEditorDialog({
  token,
  organizations,
  initial,
  triggerRef,
  onClose,
  onSaved,
  onUncertain,
}: {
  token: string;
  organizations: Organization[];
  initial: ModelRoutePool | null;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSaved: (message: string) => void;
  onUncertain: (message: string) => void;
}) {
  const isNew = initial === null;
  const [alias, setAlias] = useState(initial?.alias ?? '');
  const [organizationId, setOrganizationId] = useState<string | null>(initial?.organization_id ?? null);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [candidates, setCandidates] = useState<ModelRoutePoolCandidate[]>(
    initial?.candidates.length
      ? initial.candidates.map(candidate => ({ ...candidate }))
      : [{ alias: '', priority: 100, weight: 1000, enabled: true }],
  );
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [candidateQuery, setCandidateQuery] = useState('');
  const [discoveredRoutes, setDiscoveredRoutes] = useState<DiscoveredRoute[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const providerResult = await request<{ data: ProviderConnection[] }>(token, '/api/v1/vendors', 'GET', undefined, controller.signal);
        if (controller.signal.aborted || !Array.isArray(providerResult.data)) return;
        const modelLists = await Promise.all(
          providerResult.data.slice(0, 12).map(async provider => {
            try {
              const models = await request<{ data: ProviderModel[] }>(
                token,
                `/api/v1/vendors/${encodeURIComponent(provider.id)}/models`,
                'GET',
                undefined,
                controller.signal,
              );
              return (models.data ?? [])
                .filter(model => !model.capabilities?.video_schema)
                .map(model => ({
                  alias: model.alias,
                  providerName: provider.name,
                  upstreamModel: model.upstream_model,
                  ownerFunded: Boolean(model.owner_funded ?? provider.owner_funded),
                  priced: model.pricing !== null && model.pricing !== undefined,
                }));
            } catch {
              return [];
            }
          }),
        );
        if (controller.signal.aborted) return;
        const byAlias = new Map<string, DiscoveredRoute>();
        for (const row of modelLists.flat()) {
          if (!byAlias.has(row.alias)) byAlias.set(row.alias, row);
        }
        setDiscoveredRoutes([...byAlias.values()].sort((a, b) => a.alias.localeCompare(b.alias)));
      } catch {
        // Candidate aliases remain directly editable when route discovery is unavailable.
      }
    })();
    return () => controller.abort();
  }, [token]);

  function updateCandidate(index: number, patch: Partial<ModelRoutePoolCandidate>) {
    setCandidates(current => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function addCandidate() {
    if (candidates.length >= 64) return;
    setCandidates(current => [...current, { alias: '', priority: 50, weight: 1000, enabled: true }]);
  }

  function removeCandidate(index: number) {
    if (candidates.length <= 1) return;
    setCandidates(current => current.filter((_, rowIndex) => rowIndex !== index));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmedAlias = alias.trim();
    if (!trimmedAlias || trimmedAlias.length > 200 || !/^[!-~]+$/.test(trimmedAlias)) {
      setFormError('Enter an ASCII pool alias between 1 and 200 characters without spaces.');
      return;
    }
    if (trimmedAlias.startsWith('codex/')) {
      setFormError('Pool aliases cannot start with codex/.');
      return;
    }
    const normalizedCandidates: ModelRoutePoolCandidate[] = [];
    const seenAliases = new Set<string>();
    for (const candidate of candidates) {
      const candidateAlias = candidate.alias.trim();
      if (!candidateAlias || candidateAlias.length > 200) {
        setFormError('Every candidate model must specify a valid model mapping alias.');
        return;
      }
      if (seenAliases.has(candidateAlias)) {
        setFormError(`Duplicate candidate alias "${candidateAlias}". Each candidate model in a pool must be unique.`);
        return;
      }
      seenAliases.add(candidateAlias);
      if (!Number.isInteger(candidate.priority) || candidate.priority < -1000 || candidate.priority > 1000) {
        setFormError('Candidate priority must be an integer between -1000 and 1000.');
        return;
      }
      if (!Number.isInteger(candidate.weight) || candidate.weight < 1 || candidate.weight > 10000) {
        setFormError('Candidate weight must be an integer between 1 and 10000.');
        return;
      }
      normalizedCandidates.push({
        alias: candidateAlias,
        priority: candidate.priority,
        weight: candidate.weight,
        enabled: candidate.enabled,
      });
    }

    setBusy(true);
    setFormError('');
    try {
      const response = await request<{ data: { revision: number } }>(token, '/api/v1/pools', 'PUT', {
        alias: trimmedAlias,
        organization_id: organizationId,
        enabled,
        expected_revision: initial ? initial.revision : 0,
        candidates: normalizedCandidates,
      });
      onSaved(`Saved model pool "${trimmedAlias}" at revision ${response.data.revision}.`);
    } catch (reason) {
      if (writeMayHaveCommitted(reason)) {
        onUncertain(
          `Model pool "${trimmedAlias}" write could not be confirmed. Refresh model pools before saving again; the previous request may have committed.`,
        );
        return;
      }
      if (reason instanceof ProviderRequestError && reason.status === 409) {
        setFormError('This model pool changed in another session or already exists. Close and refresh model pools before retrying.');
      } else {
        setFormError(reason instanceof Error ? reason.message : 'Could not save model pool.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[90dvh] overflow-y-auto"
        onCloseAutoFocus={event => {
          if (triggerRef.current?.isConnected) {
            event.preventDefault();
            triggerRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{isNew ? 'Create model pool' : `Edit ${initial.alias}`}</DialogTitle>
          <DialogDescription>
            {isNew
              ? 'Create one model alias backed by multiple Provider models, with priority and traffic weights.'
              : `Revision ${initial.revision} · ${poolScopeLabel(initial.organization_id, organizations)}. Changes apply to subsequent request admissions.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={event => void handleSubmit(event)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="route-pool-alias">Pool alias</Label>
              <Input
                id="route-pool-alias"
                autoFocus={isNew}
                required
                maxLength={200}
                disabled={!isNew || busy}
                placeholder="e.g. claude-sonnet-4"
                value={alias}
                onChange={event => setAlias(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Clients send this alias in model requests. Cannot start with <code>codex/</code>.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Ownership scope</Label>
              {isNew ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-between" disabled={busy} aria-label="Ownership scope">
                      <span className="truncate">{poolScopeLabel(organizationId, organizations)}</span>
                      <IconChevronDown size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-72">
                    <DropdownMenuLabel>Select pool ownership</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={organizationId ?? '__shared__'}
                      onValueChange={value => setOrganizationId(value === '__shared__' ? null : value)}
                    >
                      <DropdownMenuRadioItem value="__shared__">Shared pool (all workspaces)</DropdownMenuRadioItem>
                      {organizations.length > 0 && <DropdownMenuSeparator />}
                      {organizations.map(org => (
                        <DropdownMenuRadioItem key={org.id} value={org.id}>
                          {org.name}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
                  {poolScopeLabel(organizationId, organizations)}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {organizationId
                  ? 'Personal pools require candidate models owned by the same organization.'
                  : 'Shared pools require non-personal priced candidate model mappings.'}
              </p>
            </div>
          </div>

          <Label className="flex items-center gap-2.5">
            <Checkbox checked={enabled} disabled={busy} onCheckedChange={value => setEnabled(value === true)} />
            <span>Enable model pool for request dispatch</span>
          </Label>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">Candidate models ({candidates.length}/64)</h3>
                <p className="text-xs text-muted-foreground">
                  Highest enabled priority (-1000 to 1000) is selected first; weight (1 to 10000) balances traffic within the same priority tier.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={busy || candidates.length >= 64} onClick={addCandidate}>
                <IconPlus size={15} />
                Add candidate
              </Button>
            </div>

            <div className="space-y-3">
              {candidates.map((candidate, index) => (
                <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_6.5rem_6.5rem_auto_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor={`candidate-model-${index}`}>Candidate model #{index + 1}</Label>
                    <DropdownMenu onOpenChange={open => { if (open) setCandidateQuery(''); }}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          id={`candidate-model-${index}`}
                          type="button"
                          variant="outline"
                          className="w-full min-w-0 justify-between"
                          disabled={busy}
                        >
                          <span className={`truncate ${candidate.alias ? '' : 'text-muted-foreground'}`}>
                            {candidate.alias || 'Choose model'}
                          </span>
                          <IconChevronDown size={16} className="shrink-0" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-64 max-w-[calc(100vw-2rem)]">
                        <div className="p-1" onKeyDown={event => {
                          if (!['Escape', 'Tab', 'ArrowDown', 'ArrowUp'].includes(event.key)) event.stopPropagation();
                        }}>
                          <Input
                            autoFocus
                            onKeyDown={event => {
                              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                event.preventDefault();
                                const items = event.currentTarget.closest('[role="menu"]')?.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitem"]');
                                if (items?.length) items[event.key === 'ArrowDown' ? 0 : items.length - 1].focus();
                              }
                            }}
                            aria-label={`Search candidate models ${index + 1}`}
                            placeholder="Search models or existing alias"
                            maxLength={200}
                            value={candidateQuery}
                            onChange={event => setCandidateQuery(event.target.value)}
                          />
                        </div>
                        <DropdownMenuLabel>Configured Provider models</DropdownMenuLabel>
                        <DropdownMenuRadioGroup value={candidate.alias} className="max-h-52 overflow-y-auto">
                          {discoveredRoutes.filter(route =>
                            `${route.alias} ${route.providerName} ${route.upstreamModel}`.toLowerCase().includes(candidateQuery.trim().toLowerCase()),
                          ).map(route => (
                            <DropdownMenuRadioItem
                              key={route.alias}
                              value={route.alias}
                              onSelect={() => updateCandidate(index, { alias: route.alias })}
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{route.alias}</span>
                                <span className="block truncate text-xs text-muted-foreground">{route.providerName} · {route.upstreamModel}</span>
                              </span>
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                        {candidateQuery.trim() && !discoveredRoutes.some(route => route.alias === candidateQuery.trim()) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => updateCandidate(index, { alias: candidateQuery.trim() })}>
                              <span className="min-w-0 truncate">Use existing alias “{candidateQuery.trim()}”</span>
                            </DropdownMenuItem>
                          </>
                        )}
                        {discoveredRoutes.length === 0 && !candidateQuery.trim() && (
                          <p className="px-2 py-2 text-xs text-muted-foreground">No models discovered. Enter an existing model alias above.</p>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex h-5 items-center">
                      <Label htmlFor={`candidate-priority-${index}`}>Priority</Label>
                    </div>
                    <Input
                      id={`candidate-priority-${index}`}
                      type="number"
                      min={-1000}
                      max={1000}
                      required
                      disabled={busy}
                      value={candidate.priority}
                      onChange={event => updateCandidate(index, { priority: Number(event.target.value) })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex h-5 items-center">
                      <Label htmlFor={`candidate-weight-${index}`}>Weight</Label>
                    </div>
                    <Input
                      id={`candidate-weight-${index}`}
                      type="number"
                      min={1}
                      max={10000}
                      required
                      disabled={busy}
                      value={candidate.weight}
                      onChange={event => updateCandidate(index, { weight: Number(event.target.value) })}
                    />
                  </div>

                  <div className="flex h-9 items-center">
                    <Label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={candidate.enabled}
                        disabled={busy}
                        onCheckedChange={value => updateCandidate(index, { enabled: value === true })}
                      />
                      Enabled
                    </Label>
                  </div>

                  <div className="flex h-9 items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy || candidates.length <= 1}
                      aria-label={`Remove candidate ${index + 1}`}
                      onClick={() => removeCandidate(index)}
                    >
                      <IconTrash size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : isNew ? 'Create model pool' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoutePoolHistoryDialog({
  token,
  pool,
  organizations,
  triggerRef,
  onClose,
}: {
  token: string;
  pool: ModelRoutePool;
  organizations: Organization[];
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<ModelRoutePoolRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  async function loadHistory(beforeRevision?: number) {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ alias: pool.alias });
      if (beforeRevision !== undefined) query.set('before_revision', String(beforeRevision));
      const result = await request<{ data: ModelRoutePoolRevision[] }>(
        token,
        '/api/v1/pools/history?' + query.toString(),
        'GET',
        undefined,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (!Array.isArray(result.data)) throw new Error('Model pool history could not be read.');
      setRevisions(current =>
        beforeRevision ? [...current, ...result.data.filter(row => !current.some(item => item.revision === row.revision))] : result.data,
      );
      setHasMore(result.data.length === 100 && (result.data.at(-1)?.revision ?? 0) > 1);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : 'Model pool history unavailable.');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
    return () => activeRequest.current?.abort();
  }, [token, pool.alias]);

  const oldestRevision = revisions.at(-1)?.revision;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        className="w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[90dvh] overflow-y-auto"
        onCloseAutoFocus={event => {
          if (triggerRef.current?.isConnected) {
            event.preventDefault();
            triggerRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Revision history · {pool.alias}</DialogTitle>
          <DialogDescription>
            {poolScopeLabel(pool.organization_id, organizations)} · Immutable configuration revisions in descending order.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadHistory()}>
            <IconRefresh size={15} />
            Refresh history
          </Button>
        </div>

        {loading && revisions.length === 0 && <p role="status">Loading revision history…</p>}

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{error}</span>
              <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadHistory()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="divide-y">
          {revisions.map(entry => (
            <section key={entry.revision} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Revision {entry.revision}</Badge>
                  <Badge variant={entry.enabled ? 'secondary' : 'outline'}>{entry.enabled ? 'Enabled' : 'Disabled'}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(entry.recorded_at)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {entry.candidates.map(candidate => (
                  <Badge key={candidate.alias} variant={candidate.enabled ? 'secondary' : 'outline'} className="font-normal">
                    <span>{candidate.alias}</span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      Priority {candidate.priority} · Weight {candidate.weight} · {candidate.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </Badge>
                ))}
              </div>
            </section>
          ))}
        </div>

        {hasMore && oldestRevision && oldestRevision > 1 && (
          <Button variant="outline" disabled={loading} onClick={() => void loadHistory(oldestRevision)}>
            Older revisions
          </Button>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
