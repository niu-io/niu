import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  IconArrowDown,
  IconArrowUp,
  IconChartBar,
  IconChevronDown,
  IconHistory,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconRoute,
  IconSearch,
  IconSparkles,
  IconTrash,
} from '@tabler/icons-react';
import { Link } from 'react-router';
import { useDashboardContext, type Organization } from '@/app/dashboard-context';
import { useLocale } from '@/app/locale';
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
import { Textarea } from '@/components/ui/textarea';
import { request, ProviderRequestError, writeMayHaveCommitted, type ProviderConnection, type ProviderModel } from '@/features/providers/api';
import type {
  ModelRoutePool,
  ModelRoutePoolAudit,
  ModelRoutePoolBillingMode,
  ModelRoutePoolCandidate,
  ModelRoutePoolDefaultAction,
  ModelRoutePoolPreviewInput,
  ModelRoutePoolPreviewResult,
  ModelRoutePoolRevision,
  ModelRoutePoolRule,
  ModelRoutePoolRuleConditions,
} from '@niu-io/sdk/admin';

type ScopeFilter = 'all' | 'shared' | 'organization';
type DiscoveredRoute = { alias: string; providerName: string; upstreamModel: string; ownerFunded: boolean; priced: boolean };
type ProtocolOption = 'any' | 'chat' | 'responses' | 'messages' | 'embeddings' | 'generate_content';

function encodePoolReference(alias: string): string {
  const bytes = new TextEncoder().encode(alias);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function formatDate(value: string, unavailableLabel = 'Date unavailable') {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : unavailableLabel;
}

function formatNanos(nanosStr: string | null | undefined, currency = 'USD'): string {
  if (!nanosStr) return '—';
  const num = Number(nanosStr) / 1_000_000_000;
  if (!Number.isFinite(num)) return nanosStr;
  return `${currency} ${num.toFixed(4)}`;
}

function formatRatePerMillion(nanosStr: string | null | undefined, currency: string | null = 'USD'): string {
  if (!nanosStr) return '—';
  const num = Number(nanosStr) / 1_000_000_000;
  if (!Number.isFinite(num)) return nanosStr;
  return `${currency ?? ''} ${num.toFixed(2)}/1M`.trim();
}

function poolScopeLabel(organizationId: string | null, organizations: Organization[], t: (en: string, zh: string) => string) {
  if (!organizationId) return t('Shared pool', '平台共享池');
  const match = organizations.find(item => item.id === organizationId);
  return match?.name ? match.name : t('Organization-scoped pool', '企业专属模型池');
}

function computeWinningTierShares(candidates: ModelRoutePoolCandidate[]): Map<string, number> {
  const enabled = candidates.filter(c => c.enabled && c.alias.trim());
  const shares = new Map<string, number>();
  if (enabled.length === 0) return shares;
  const maxPriority = Math.max(...enabled.map(c => c.priority));
  const winners = enabled.filter(c => c.priority === maxPriority);
  const totalWeight = winners.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  if (totalWeight <= 0) return shares;
  for (const winner of winners) {
    shares.set(winner.alias.trim(), Math.round((winner.weight / totalWeight) * 1000) / 10);
  }
  return shares;
}

export default function RoutePoolsPage() {
  const { token, organizations } = useDashboardContext();
  return <RoutePoolsView key={token} token={token} organizations={organizations} />;
}

function RoutePoolsView({ token, organizations }: { token: string; organizations: Organization[] }) {
  const { t } = useLocale();
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
  const [previewPool, setPreviewPool] = useState<ModelRoutePool | null>(null);
  const [auditPool, setAuditPool] = useState<ModelRoutePool | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);

  const scopeLabels: Record<ScopeFilter, string> = {
    all: t('All scopes', '全部范围'),
    shared: t('Shared pools', '平台共享池'),
    organization: t('Organization pools', '企业专属池'),
  };

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
        throw new Error(t('Model pool page did not advance. Refresh pools.', '模型池分页未推进，请刷新列表。'));
      }
      setPools(current => (after ? [...current, ...result.data.filter(row => !current.some(item => item.alias === row.alias))] : result.data));
      setCursor(result.has_more ? result.next_after : null);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setFailedCursor(after);
        setError(reason instanceof Error ? reason.message : t('Model pools could not be loaded.', '无法加载模型池列表。'));
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
      const scopeName = poolScopeLabel(pool.organization_id, organizations, t).toLowerCase();
      const candidateAliases = pool.candidates.map(candidate => candidate.alias.toLowerCase()).join(' ');
      const displayName = (pool.display_name ?? '').toLowerCase();
      return (
        pool.alias.toLowerCase().includes(query) ||
        displayName.includes(query) ||
        scopeName.includes(query) ||
        candidateAliases.includes(query)
      );
    });
  }, [pools, filter, scopeFilter, organizations, t]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Model pools', '模型池')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link to="/admin/providers">{t('Providers', '模型供应商')}</Link>
            </Button>
            <Button
              disabled={loading}
              aria-label="Create model pool"
              onClick={event => {
                dialogTriggerRef.current = event.currentTarget;
                setNotice('');
                setEditing('new');
              }}
            >
              <IconPlus className="size-4" />
              {t('Create model pool', '创建模型池')}
            </Button>
          </div>
        }
      />
      <p className="text-sm text-muted-foreground">
        {t(
          'Combine multiple Provider model routes into one callable model alias with conditional routing rules, priority/weight failover, unified custom-model pricing or per-candidate pass-through billing, and strategy auditing.',
          '将多个 Provider 模型路由组合为一个可直接调用的模型别名，支持条件分流规则、优先级与权重容灾、自定义模型统一定价或按命中模型分别计费，以及路由策略审计。',
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm">
              {t('How routing & billing work', '路由与计费说明')}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-3 text-sm">
            <h2 className="font-semibold">{t('Routing rules, billing modes & audit', '条件路由、计费模式与策略审计')}</h2>
            <p>
              {t(
                'Callers invoke the pool alias directly as the model field in /v1/chat/completions, /v1/responses, /v1/messages, or /v1/embeddings.',
                '调用方可在 /v1/chat/completions、/v1/responses、/v1/messages 或 /v1/embeddings 中直接将该模型池别名作为 model 参数调用。',
              )}
            </p>
            <p>
              {t(
                'Ordered routing rules match request attributes (vision, tools, structured output, reasoning, token bounds) first; unmatched traffic uses the default pool candidates. Highest priority wins and weights split traffic.',
                '系统按顺序匹配条件分流规则（视觉输入、工具调用、结构化输出、推理、Token 区间），未命中的请求回退到默认候选模型。最高优先级层级胜出并按权重分配流量。',
              )}
            </p>
            <p>
              {t(
                'Choose Unified pool price (pool_tariff) to sell the pool as a custom model at one retail tariff, or Per-candidate price (candidate_tariff) to bill customers at whichever candidate model handled the request.',
                '可选择“按模型池统一定价 (pool_tariff)”将其作为自定义模型售卖，或选择“按命中候选模型分别计费 (candidate_tariff)”按实际命中的底层模型扣费。',
              )}
            </p>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={filter.trim() ? 'secondary' : 'outline'}
              size={filter.trim() ? 'sm' : 'icon'}
              aria-label={filter.trim() ? `Filter model pools: ${filter.trim()}` : 'Filter model pools'}
              title={t('Filter model pools', '筛选模型池')}
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
              placeholder={t('Filter by pool or candidate alias', '按模型池名称或候选模型筛选')}
              value={filter}
              onChange={event => setFilter(event.target.value)}
            />
            {filter && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setFilter('')}>
                {t('Reset search', '重置筛选')}
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
            <DropdownMenuLabel>{t('Pool scope', '模型池范围')}</DropdownMenuLabel>
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
          {t('Refresh pools', '刷新列表')}
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
              {t('Retry pools', '重试')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {loading && pools.length === 0 ? (
        <p role="status">{t('Loading model pools…', '正在加载模型池…')}</p>
      ) : visiblePools.length > 0 ? (
        <Table aria-label="Model pools">
          <TableHeader className="max-sm:sr-only">
            <TableRow>
              <TableHead>{t('Pool alias & identity', '模型池别名与标识')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('Scope & billing', '范围与计费策略')}</TableHead>
              <TableHead>{t('Routing & candidate routes', '分流规则与候选模型')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('Status', '状态')}</TableHead>
              <TableHead className="sm:w-64">{t('Actions', '操作')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="max-sm:block max-sm:divide-y">
            {visiblePools.map(pool => {
              const sortedCandidates = [...pool.candidates].sort(
                (a, b) => b.priority - a.priority || b.weight - a.weight || a.alias.localeCompare(b.alias),
              );
              const winningShares = computeWinningTierShares(pool.candidates);
              const enabledCandidates = pool.candidates.filter(candidate => candidate.enabled).length;
              const enabledRules = (pool.rules ?? []).filter(rule => rule.enabled).length;
              const scopeName = poolScopeLabel(pool.organization_id, organizations, t);
              const statusLabel = !pool.enabled
                ? t('Disabled', '已停用')
                : enabledCandidates > 0
                  ? t('Enabled', '已启用')
                  : t('No active candidates', '无启用候选');
              const billingLabel =
                pool.billing_mode === 'candidate_tariff'
                  ? t('Per-candidate billing', '按命中模型分别计费')
                  : t('Unified pool price', '按模型池统一定价');
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
                    {pool.display_name && (
                      <p className="mt-0.5 text-xs font-medium text-foreground/80">{pool.display_name}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{t(`Revision ${pool.revision}`, `版本 ${pool.revision}`)}</span>
                      <span className="md:hidden"> · {scopeName}</span>
                      {!pool.organization_id && pool.public_catalog && (
                        <Badge variant="secondary" className="text-[11px] font-normal">
                          {t('Public catalog', '已发布至目录')}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden align-top whitespace-normal md:table-cell">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">{scopeName}</Badge>
                      <Badge variant="secondary" className="font-normal">
                        {billingLabel}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {pool.organization_id
                        ? t('Private to organization', '仅限该企业内调用')
                        : pool.billing_mode === 'candidate_tariff'
                          ? t('Charges each request by the selected candidate tariff', '按实际命中的候选模型售价计费')
                          : t('Charges requests using this pool alias tariff', '作为独立自定义模型统一计费')}
                    </p>
                  </TableCell>
                  <TableCell className="align-top whitespace-normal max-sm:block max-sm:border-b-0 max-sm:p-0">
                    <div className="flex flex-wrap gap-1.5">
                      {enabledRules > 0 && (
                        <Badge variant="secondary" className="font-normal">
                          <IconSparkles size={12} className="mr-1" />
                          {t(`${enabledRules} routing rule${enabledRules === 1 ? '' : 's'}`, `${enabledRules} 条条件分流规则`)}
                        </Badge>
                      )}
                      {sortedCandidates.map(candidate => {
                        const share = winningShares.get(candidate.alias);
                        return (
                          <Badge
                            key={candidate.alias}
                            variant={candidate.enabled ? 'secondary' : 'outline'}
                            className="max-w-full font-normal"
                          >
                            <span className="truncate">{candidate.alias}</span>
                            <span className="ml-1 shrink-0 text-xs text-muted-foreground">
                              P{candidate.priority} · W{candidate.weight}
                              {share !== undefined ? ` (${share}%)` : ''}
                              {!candidate.enabled ? ' · off' : ''}
                            </span>
                          </Badge>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {t(
                        `${enabledCandidates} of ${pool.candidates.length} candidate${pool.candidates.length === 1 ? '' : 's'} enabled`,
                        `已启用 ${enabledCandidates} / ${pool.candidates.length} 个候选模型`,
                      )}
                      {pool.default_action === 'reject' &&
                        ` · ${t('Rejects requests when no rule matches', '未命中规则时拒绝请求')}`}
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
                        aria-label="Edit pool"
                        onClick={event => {
                          dialogTriggerRef.current = event.currentTarget;
                          setNotice('');
                          setEditing(pool);
                        }}
                      >
                        {t('Edit pool', '编辑')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={loading}
                        aria-label={`Audit ${pool.alias}`}
                        onClick={event => {
                          dialogTriggerRef.current = event.currentTarget;
                          setAuditPool(pool);
                        }}
                      >
                        <IconChartBar size={15} />
                        {t('Audit', '策略审计')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={loading}
                        aria-label={`Preview ${pool.alias}`}
                        onClick={event => {
                          dialogTriggerRef.current = event.currentTarget;
                          setPreviewPool(pool);
                        }}
                      >
                        <IconPlayerPlay size={15} />
                        {t('Preview', '预览')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={loading}
                        aria-label={`History ${pool.alias}`}
                        onClick={event => {
                          dialogTriggerRef.current = event.currentTarget;
                          setHistoryPool(pool);
                        }}
                      >
                        <IconHistory size={15} />
                        {t('History', '历史')}
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
              {pools.length > 0
                ? t('No model pools match the current filter.', '没有符合当前筛选条件的模型池。')
                : t('No model pools configured yet.', '尚未配置任何模型池。')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {pools.length > 0
                ? t('Try clearing the search query or switching the scope filter.', '请尝试清空搜索关键词或切换范围筛选。')
                : t('Start by choosing the Provider model routes this pool should use.', '首先选择该模型池要组合的 Provider 模型路由。')}
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
                  {t('Clear filters', '清空筛选')}
                </Button>
              ) : (
                <Button
                  aria-label="Create model pool"
                  onClick={event => {
                    dialogTriggerRef.current = event.currentTarget;
                    setEditing('new');
                  }}
                >
                  <IconPlus className="size-4" />
                  {t('Create model pool', '创建模型池')}
                </Button>
              )}
            </div>
          </div>
        )
      )}

      {cursor && (
        <Button variant="outline" disabled={loading} onClick={() => void loadPools(cursor)}>
          {t('More model pools', '加载更多模型池')}
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
          onRestore={snapshot => {
            setHistoryPool(null);
            setEditing({
              ...snapshot,
              revision: historyPool.revision,
            });
          }}
        />
      )}

      {previewPool !== null && (
        <RoutePoolPreviewDialog
          token={token}
          pool={previewPool}
          triggerRef={dialogTriggerRef}
          onClose={() => setPreviewPool(null)}
        />
      )}

      {auditPool !== null && (
        <RoutePoolAuditDialog
          token={token}
          pool={auditPool}
          triggerRef={dialogTriggerRef}
          onClose={() => setAuditPool(null)}
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
  const { t } = useLocale();
  const isNew = initial === null;
  const [alias, setAlias] = useState(initial?.alias ?? '');
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [organizationId, setOrganizationId] = useState<string | null>(initial?.organization_id ?? null);
  const [publicCatalog, setPublicCatalog] = useState(Boolean(initial?.public_catalog));
  const [billingMode, setBillingMode] = useState<ModelRoutePoolBillingMode>(initial?.billing_mode ?? 'pool_tariff');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [candidates, setCandidates] = useState<ModelRoutePoolCandidate[]>(
    initial?.candidates.length
      ? initial.candidates.map(candidate => ({ ...candidate }))
      : [{ alias: '', priority: 100, weight: 1000, enabled: true }],
  );
  const [rules, setRules] = useState<ModelRoutePoolRule[]>(
    (initial?.rules ?? []).map(rule => ({
      ...rule,
      conditions: { ...rule.conditions },
      candidates: rule.candidates.map(c => ({ ...c })),
    })),
  );
  const [defaultAction, setDefaultAction] = useState<ModelRoutePoolDefaultAction>(initial?.default_action ?? 'candidates');
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

  const winningShares = useMemo(() => computeWinningTierShares(candidates), [candidates]);

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

  function addRule(preset?: 'vision' | 'tools' | 'long_context' | 'reasoning') {
    if (rules.length >= 32) return;
    const defaultCandidateAlias = candidates.find(c => c.alias.trim())?.alias.trim() ?? '';
    const nextIndex = rules.length + 1;
    let id = `rule-${nextIndex}`;
    while (rules.some(r => r.id === id)) {
      id = `rule-${nextIndex}-${Math.floor(Math.random() * 900 + 100)}`;
    }
    let name = t(`Rule ${nextIndex}`, `规则 ${nextIndex}`);
    let conditions: ModelRoutePoolRuleConditions = {};
    if (preset === 'vision') {
      name = t('Vision & multimodal requests', '视觉与多模态输入分流');
      conditions = { vision: true };
    } else if (preset === 'tools') {
      name = t('Tool calling & structured JSON', '工具调用与结构化输出分流');
      conditions = { tools: true };
    } else if (preset === 'long_context') {
      name = t('Long-context tier (>= 32k input tokens)', '长上下文分流 (>= 32k 输入 Token)');
      conditions = { min_input_tokens: 32000 };
    } else if (preset === 'reasoning') {
      name = t('Deep reasoning requests', '深度推理请求分流');
      conditions = { reasoning: true };
    }
    setRules(current => [
      ...current,
      {
        id,
        name,
        enabled: true,
        conditions,
        candidates: [{ alias: defaultCandidateAlias, priority: 100, weight: 1000, enabled: true }],
      },
    ]);
  }

  function updateRule(ruleIndex: number, patch: Partial<ModelRoutePoolRule>) {
    setRules(current => current.map((r, idx) => (idx === ruleIndex ? { ...r, ...patch } : r)));
  }

  function updateRuleConditions(ruleIndex: number, patch: Partial<ModelRoutePoolRuleConditions>) {
    setRules(current =>
      current.map((r, idx) => (idx === ruleIndex ? { ...r, conditions: { ...r.conditions, ...patch } } : r)),
    );
  }

  function moveRule(ruleIndex: number, direction: -1 | 1) {
    const target = ruleIndex + direction;
    if (target < 0 || target >= rules.length) return;
    setRules(current => {
      const copy = [...current];
      const [item] = copy.splice(ruleIndex, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  }

  function removeRule(ruleIndex: number) {
    setRules(current => current.filter((_, idx) => idx !== ruleIndex));
  }

  function updateRuleCandidate(ruleIndex: number, candIndex: number, patch: Partial<ModelRoutePoolCandidate>) {
    setRules(current =>
      current.map((r, idx) =>
        idx === ruleIndex
          ? {
              ...r,
              candidates: r.candidates.map((c, cIdx) => (cIdx === candIndex ? { ...c, ...patch } : c)),
            }
          : r,
      ),
    );
  }

  function addRuleCandidate(ruleIndex: number) {
    setRules(current =>
      current.map((r, idx) =>
        idx === ruleIndex && r.candidates.length < 64
          ? {
              ...r,
              candidates: [...r.candidates, { alias: '', priority: 50, weight: 1000, enabled: true }],
            }
          : r,
      ),
    );
  }

  function removeRuleCandidate(ruleIndex: number, candIndex: number) {
    setRules(current =>
      current.map((r, idx) =>
        idx === ruleIndex && r.candidates.length > 1
          ? {
              ...r,
              candidates: r.candidates.filter((_, cIdx) => cIdx !== candIndex),
            }
          : r,
      ),
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmedAlias = alias.trim();
    if (!trimmedAlias || trimmedAlias.length > 200 || !/^[!-~]+$/.test(trimmedAlias)) {
      setFormError(t('Enter an ASCII pool alias between 1 and 200 characters without spaces.', '请输入 1 到 200 个字符且不含空格的 ASCII 模型池别名。'));
      return;
    }
    if (trimmedAlias.startsWith('codex/')) {
      setFormError(t('Pool aliases cannot start with codex/.', '模型池别名不能以 codex/ 开头。'));
      return;
    }
    const normalizedCandidates: ModelRoutePoolCandidate[] = [];
    const seenAliases = new Set<string>();
    for (const candidate of candidates) {
      const candidateAlias = candidate.alias.trim();
      if (!candidateAlias || candidateAlias.length > 200) {
        setFormError(t('Every candidate model must specify a valid model mapping alias.', '每个候选模型都必须指定有效的模型映射别名。'));
        return;
      }
      if (seenAliases.has(candidateAlias)) {
        setFormError(t(`Duplicate candidate alias "${candidateAlias}". Each candidate model in a pool must be unique.`, `候选模型别名 "${candidateAlias}" 重复。同一模型池中的候选模型必须唯一。`));
        return;
      }
      seenAliases.add(candidateAlias);
      if (!Number.isInteger(candidate.priority) || candidate.priority < -1000 || candidate.priority > 1000) {
        setFormError(t('Candidate priority must be an integer between -1000 and 1000.', '候选优先级必须是 -1000 到 1000 之间的整数。'));
        return;
      }
      if (!Number.isInteger(candidate.weight) || candidate.weight < 1 || candidate.weight > 10000) {
        setFormError(t('Candidate weight must be an integer between 1 and 10000.', '候选权重必须是 1 到 10000 之间的整数。'));
        return;
      }
      normalizedCandidates.push({
        alias: candidateAlias,
        priority: candidate.priority,
        weight: candidate.weight,
        enabled: candidate.enabled,
      });
    }

    const normalizedRules: ModelRoutePoolRule[] = [];
    for (const rule of rules) {
      const trimmedName = rule.name.trim();
      if (!trimmedName || trimmedName.length > 120) {
        setFormError(t('Each routing rule requires a name up to 120 characters.', '每条分流规则都需要填写 120 字符以内的名称。'));
        return;
      }
      const ruleCands: ModelRoutePoolCandidate[] = [];
      const seenRuleAliases = new Set<string>();
      for (const rc of rule.candidates) {
        const rcAlias = rc.alias.trim();
        if (!rcAlias || !seenAliases.has(rcAlias)) {
          setFormError(
            t(
              `Rule "${trimmedName}" candidate "${rcAlias || '(empty)'}" must also be listed in the pool's candidate models.`,
              `规则“${trimmedName}”中的候选模型“${rcAlias || '(空)'}”必须包含在模型池的候选列表中。`,
            ),
          );
          return;
        }
        if (seenRuleAliases.has(rcAlias)) {
          setFormError(t(`Duplicate candidate "${rcAlias}" in rule "${trimmedName}".`, `规则“${trimmedName}”中包含重复候选模型“${rcAlias}”。`));
          return;
        }
        seenRuleAliases.add(rcAlias);
        ruleCands.push({
          alias: rcAlias,
          priority: rc.priority,
          weight: rc.weight,
          enabled: rc.enabled,
        });
      }
      normalizedRules.push({
        id: rule.id.trim() || `rule-${normalizedRules.length + 1}`,
        name: trimmedName,
        enabled: rule.enabled,
        conditions: rule.conditions,
        candidates: ruleCands,
      });
    }

    const payload: Record<string, unknown> = {
      alias: trimmedAlias,
      organization_id: organizationId,
      enabled,
      expected_revision: initial ? initial.revision : 0,
      candidates: normalizedCandidates,
    };
    if (initial?.display_name != null || displayName.trim() !== '') {
      payload.display_name = displayName.trim() || null;
    }
    if (initial?.description != null || description.trim() !== '') {
      payload.description = description.trim() || null;
    }
    if (initial?.public_catalog !== undefined || publicCatalog) {
      payload.public_catalog = organizationId === null ? publicCatalog : false;
    }
    if (initial?.billing_mode !== undefined || billingMode !== 'pool_tariff') {
      payload.billing_mode = billingMode;
    }
    if (initial?.rules !== undefined || normalizedRules.length > 0) {
      payload.rules = normalizedRules;
    }
    if (initial?.default_action !== undefined || defaultAction !== 'candidates') {
      payload.default_action = defaultAction;
    }

    setBusy(true);
    setFormError('');
    try {
      const response = await request<{ data: { revision: number } }>(token, '/api/v1/pools', 'PUT', payload);
      onSaved(
        t(
          `Saved model pool "${trimmedAlias}" at revision ${response.data.revision}.`,
          `已保存并发布模型池“${trimmedAlias}”（版本 ${response.data.revision}）。`,
        ),
      );
    } catch (reason) {
      if (writeMayHaveCommitted(reason)) {
        onUncertain(
          t(
            `Model pool "${trimmedAlias}" write could not be confirmed. Refresh model pools before saving again; the previous request may have committed.`,
            `模型池“${trimmedAlias}”写入结果无法确认。请先刷新模型池列表再重试，前一次请求可能已经提交。`,
          ),
        );
        return;
      }
      if (reason instanceof ProviderRequestError && reason.status === 409) {
        setFormError(
          t(
            'This model pool changed in another session or already exists. Close and refresh model pools before retrying.',
            '该模型池已在其他会话中更改或已存在。请关闭并刷新列表后再试。',
          ),
        );
      } else {
        setFormError(reason instanceof Error ? reason.message : t('Could not save model pool.', '无法保存模型池。'));
      }
    } finally {
      setBusy(false);
    }
  }

  const billingModeLabels: Record<ModelRoutePoolBillingMode, string> = {
    pool_tariff: t('Unified pool price (custom model)', '作为自定义模型统一定价 (pool_tariff)'),
    candidate_tariff: t('Per-candidate model price (pass-through)', '按命中的候选模型分别计费 (candidate_tariff)'),
  };

  const defaultActionLabels: Record<ModelRoutePoolDefaultAction, string> = {
    candidates: t('Fall back to default pool candidates', '回退到默认候选模型池'),
    reject: t('Reject request when no rule matches', '无规则命中时直接拒绝请求'),
  };

  const protocolLabels: Record<ProtocolOption, string> = {
    any: t('Any protocol', '任意协议'),
    chat: 'Chat Completions (/v1/chat/completions)',
    responses: 'Responses (/v1/responses)',
    messages: 'Anthropic Messages (/v1/messages)',
    embeddings: 'Embeddings (/v1/embeddings)',
    generate_content: 'Gemini GenerateContent',
  };

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="grid-cols-1 w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90dvh] overflow-x-hidden overflow-y-auto"
        onCloseAutoFocus={event => {
          if (triggerRef.current?.isConnected) {
            event.preventDefault();
            triggerRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{isNew ? t('Create model pool', '创建模型池') : `Edit ${initial.alias}`}</DialogTitle>
          <DialogDescription>
            {isNew
              ? t(
                  'Publish one model alias backed by multiple Provider routes, with conditional routing rules, priority/weight failover, and unified or per-candidate billing.',
                  '创建一个由多个 Provider 模型路由支撑的模型别名，支持条件分流、优先级与权重容灾，以及统一售价或按命中模型分别计费。',
                )
              : `${t(`Revision ${initial.revision}`, `版本 ${initial.revision}`)} · ${poolScopeLabel(initial.organization_id, organizations, t)}. ${t('Saving directly publishes a new revision.', '保存后将直接发布新版本。')}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={event => void handleSubmit(event)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="route-pool-alias">{t('Pool alias', 'Pool alias')}</Label>
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
                {t(
                  'Callers pass this alias directly as the model field in API requests. Cannot start with codex/.',
                  '调用方可在 API 请求中直接将该别名作为 model 参数传入。不能以 codex/ 开头。',
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t('Ownership scope', '归属范围')}</Label>
              {isNew ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-between" disabled={busy} aria-label="Ownership scope">
                      <span className="truncate">{poolScopeLabel(organizationId, organizations, t)}</span>
                      <IconChevronDown size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-72">
                    <DropdownMenuLabel>{t('Select pool ownership', '选择模型池归属')}</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={organizationId ?? '__shared__'}
                      onValueChange={value => setOrganizationId(value === '__shared__' ? null : value)}
                    >
                      <DropdownMenuRadioItem value="__shared__">
                        {t('Shared pool (all workspaces)', '平台共享池（所有工作空间）')}
                      </DropdownMenuRadioItem>
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
                  {poolScopeLabel(organizationId, organizations, t)}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {organizationId
                  ? t('Personal pools require candidate models owned by the same organization.', '企业专属池要求候选模型归属于同一企业。')
                  : t('Shared pools require non-personal priced candidate model mappings.', '平台共享池要求使用已定价的平台模型映射。')}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="route-pool-display-name">{t('Display name (optional)', '展示名称（可选）')}</Label>
              <Input
                id="route-pool-display-name"
                maxLength={200}
                disabled={busy}
                placeholder={t('e.g. Niu Smart Router Pro', '例如：牛元智能路由模型')}
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('Human-friendly custom model title shown in /v1/models and catalog views.', '在 /v1/models 与模型目录中展示的友好名称。')}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t('Customer billing mode', '客户计费模式')}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-between" disabled={busy} aria-label="Billing mode">
                    <span className="truncate">{billingModeLabels[billingMode]}</span>
                    <IconChevronDown size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-80">
                  <DropdownMenuLabel>{t('Select customer billing strategy', '选择客户计费方式')}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={billingMode} onValueChange={v => setBillingMode(v as ModelRoutePoolBillingMode)}>
                    <DropdownMenuRadioItem value="pool_tariff">
                      <div>
                        <div className="font-medium">{billingModeLabels.pool_tariff}</div>
                        <div className="text-xs text-muted-foreground">
                          {t('Charge customers at the pool alias retail tariff', '以模型池自身的零售价格向客户统一计费')}
                        </div>
                      </div>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="candidate_tariff">
                      <div>
                        <div className="font-medium">{billingModeLabels.candidate_tariff}</div>
                        <div className="text-xs text-muted-foreground">
                          {t('Charge customers at the selected candidate model tariff', '按每次请求实际命中的候选模型售价分别计费')}
                        </div>
                      </div>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <p className="text-xs text-muted-foreground">
                {billingMode === 'candidate_tariff'
                  ? t('Pure routing mode: each request binds the customer tariff of the candidate route that served it.', '纯技术分流模式：每次请求按实际命中的候选模型自身售价计费。')
                  : t('Custom model mode: configure a retail price on this pool alias to charge one unified rate.', '自定义模型模式：为该模型池别名配置统一售价，底层按命中渠道结算成本。')}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="route-pool-description">{t('Description (optional)', '模型描述（可选）')}</Label>
            <Textarea
              id="route-pool-description"
              rows={2}
              maxLength={4000}
              disabled={busy}
              placeholder={t('Describe what this model pool optimizes for (e.g., multimodal routing, high availability, cost-tiered context).', '描述该模型池的用途或分流策略（例如：图文多模态分流、高可用容灾、长短上下文阶梯路由）。')}
              value={description}
              onChange={event => setDescription(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-6">
            <Label className="flex items-center gap-2.5">
              <Checkbox checked={enabled} disabled={busy} onCheckedChange={value => setEnabled(value === true)} />
              <span>{t('Enable model pool for request dispatch', '启用该模型池接收请求')}</span>
            </Label>

            {organizationId === null && (
              <Label className="flex items-center gap-2.5">
                <Checkbox
                  checked={publicCatalog}
                  disabled={busy}
                  onCheckedChange={value => setPublicCatalog(value === true)}
                />
                <span>{t('Publish in public model catalog (/v1/models)', '直接发布到公开模型目录 (/v1/models)')}</span>
              </Label>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">
                  {t(`Candidate models (${candidates.length}/64)`, `候选模型列表 (${candidates.length}/64)`)}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'Highest enabled priority (-1000 to 1000) is selected first; weight (1 to 10000) balances traffic within the winning priority tier.',
                    '最高优先级（-1000 至 1000）优先命中；同一最高优先级层级内按权重（1 至 10000）分配流量比例。',
                  )}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={busy || candidates.length >= 64} onClick={addCandidate}>
                <IconPlus size={15} />
                {t('Add candidate', '添加候选模型')}
              </Button>
            </div>

            <div className="space-y-3">
              {candidates.map((candidate, index) => {
                const share = winningShares.get(candidate.alias.trim());
                return (
                  <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_6.5rem_6.5rem_auto_auto] sm:items-end">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor={`candidate-model-${index}`}>Candidate model #{index + 1}</Label>
                        {share !== undefined && (
                          <Badge variant="secondary" className="text-[11px] font-normal">
                            {t(`Active tier · ${share}% share`, `主层级 · ${share}% 流量`)}
                          </Badge>
                        )}
                      </div>
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
                              {candidate.alias || t('Choose model', '选择模型')}
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
                              placeholder={t('Search models or existing alias', '搜索模型或输入已有别名')}
                              maxLength={200}
                              value={candidateQuery}
                              onChange={event => setCandidateQuery(event.target.value)}
                            />
                          </div>
                          <DropdownMenuLabel>{t('Configured Provider models', '已配置的 Provider 模型')}</DropdownMenuLabel>
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
                            <p className="px-2 py-2 text-xs text-muted-foreground">
                              {t('No models discovered. Enter an existing model alias above.', '未发现模型，请在上方输入已有模型别名。')}
                            </p>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex h-5 items-center">
                        <Label htmlFor={`candidate-priority-${index}`}>{t('Priority', '优先级')}</Label>
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
                        <Label htmlFor={`candidate-weight-${index}`}>{t('Weight', '权重')}</Label>
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
                        {t('Enabled', '启用')}
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
                );
              })}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">
                  {t(`Conditional routing rules (${rules.length}/32)`, `条件分流规则 (${rules.length}/32)`)}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'Optional first-match rules that route specific request capabilities or token tiers to dedicated subsets of candidate models.',
                    '可选的按序匹配规则：根据请求的视觉/工具/推理能力或 Token 长度，将请求分流至指定的候选模型子集。',
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" disabled={busy || rules.length >= 32} aria-label="Add preset rule">
                      <IconSparkles size={15} />
                      {t('Add preset rule', '插入预设分流规则')}
                      <IconChevronDown size={15} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuLabel>{t('Preset routing strategies', '预设路由策略模板')}</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => addRule('vision')}>
                      {t('Vision & multimodal split', '视觉与多模态请求分流 (vision)')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => addRule('tools')}>
                      {t('Tool-calling & JSON split', '工具调用与函数分流 (tools)')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => addRule('long_context')}>
                      {t('Long-context tiering (>= 32k tokens)', '长上下文阶梯分流 (>= 32k Token)')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => addRule('reasoning')}>
                      {t('Deep reasoning split', '深度思考/推理请求分流 (reasoning)')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button type="button" variant="outline" size="sm" disabled={busy || rules.length >= 32} onClick={() => addRule()}>
                  <IconPlus size={15} />
                  {t('Add custom rule', '添加自定义规则')}
                </Button>
              </div>
            </div>

            {rules.length > 0 && (
              <div className="space-y-3">
                {rules.map((rule, ruleIndex) => {
                  const currentProto: ProtocolOption = (rule.conditions.protocol ?? 'any') as ProtocolOption;
                  return (
                    <div key={rule.id} className="space-y-3 rounded-lg border bg-background p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-1 items-center gap-2">
                          <Badge variant="outline">#{ruleIndex + 1}</Badge>
                          <Input
                            aria-label={`Rule name ${ruleIndex + 1}`}
                            maxLength={120}
                            disabled={busy}
                            placeholder={t('Rule name', '规则名称')}
                            value={rule.name}
                            onChange={e => updateRule(ruleIndex, { name: e.target.value })}
                            className="max-w-xs"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Label className="mr-2 flex items-center gap-1.5 text-xs">
                            <Checkbox
                              checked={rule.enabled}
                              disabled={busy}
                              onCheckedChange={v => updateRule(ruleIndex, { enabled: v === true })}
                            />
                            {t('Enabled', '启用')}
                          </Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={busy || ruleIndex === 0}
                            aria-label={`Move rule ${ruleIndex + 1} up`}
                            onClick={() => moveRule(ruleIndex, -1)}
                          >
                            <IconArrowUp size={15} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={busy || ruleIndex === rules.length - 1}
                            aria-label={`Move rule ${ruleIndex + 1} down`}
                            onClick={() => moveRule(ruleIndex, 1)}
                          >
                            <IconArrowDown size={15} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={busy}
                            aria-label={`Remove rule ${ruleIndex + 1}`}
                            onClick={() => removeRule(ruleIndex)}
                          >
                            <IconTrash size={15} />
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label className="text-xs">{t('Protocol match', '匹配协议')}</Label>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full justify-between"
                                disabled={busy}
                                aria-label={`Rule ${ruleIndex + 1} protocol`}
                              >
                                <span className="truncate">{protocolLabels[currentProto]}</span>
                                <IconChevronDown size={14} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-64">
                              <DropdownMenuRadioGroup
                                value={currentProto}
                                onValueChange={v =>
                                  updateRuleConditions(ruleIndex, {
                                    protocol: v === 'any' ? null : (v as ModelRoutePoolRuleConditions['protocol']),
                                  })
                                }
                              >
                                {(Object.entries(protocolLabels) as Array<[ProtocolOption, string]>).map(([val, label]) => (
                                  <DropdownMenuRadioItem key={val} value={val}>
                                    {label}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">{t('Min input tokens', '最小输入 Token')}</Label>
                          <Input
                            type="number"
                            min={1}
                            placeholder={t('Any', '不限')}
                            disabled={busy}
                            value={rule.conditions.min_input_tokens ?? ''}
                            onChange={e =>
                              updateRuleConditions(ruleIndex, {
                                min_input_tokens: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">{t('Max input tokens', '最大输入 Token')}</Label>
                          <Input
                            type="number"
                            min={1}
                            placeholder={t('Any', '不限')}
                            disabled={busy}
                            value={rule.conditions.max_input_tokens ?? ''}
                            onChange={e =>
                              updateRuleConditions(ruleIndex, {
                                max_input_tokens: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 pt-1">
                        {(
                          [
                            ['vision', t('Requires vision / image input', '包含视觉/图片输入 (vision)')],
                            ['tools', t('Requires tool calling', '包含工具调用 (tools)')],
                            ['structured_output', t('Requires JSON schema / structured output', '包含结构化输出')],
                            ['reasoning', t('Requires reasoning / thinking', '包含推理参数 (reasoning)')],
                            ['streaming', t('Streaming SSE request', '流式请求 (stream)')],
                          ] as const
                        ).map(([field, label]) => (
                          <Label key={field} className="flex items-center gap-1.5 text-xs">
                            <Checkbox
                              checked={rule.conditions[field] === true}
                              disabled={busy}
                              onCheckedChange={v =>
                                updateRuleConditions(ruleIndex, {
                                  [field]: v === true ? true : null,
                                })
                              }
                            />
                            <span>{label}</span>
                          </Label>
                        ))}
                      </div>

                      <div className="space-y-2 border-t pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">
                            {t('Rule target candidates (must belong to pool candidates above)', '命中该规则时使用的候选模型（须属于上方候选模型池）')}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy || rule.candidates.length >= candidates.length}
                            onClick={() => addRuleCandidate(ruleIndex)}
                          >
                            <IconPlus size={14} />
                            {t('Add rule target', '添加规则目标模型')}
                          </Button>
                        </div>
                        {rule.candidates.map((rc, rcIdx) => (
                          <div key={rcIdx} className="grid gap-2 sm:grid-cols-[1fr_5.5rem_5.5rem_auto]">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="w-full justify-between"
                                  disabled={busy}
                                  aria-label={`Rule ${ruleIndex + 1} candidate ${rcIdx + 1}`}
                                >
                                  <span className="truncate">{rc.alias || t('Select pool candidate', '选择池内候选模型')}</span>
                                  <IconChevronDown size={14} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-64">
                                <DropdownMenuRadioGroup
                                  value={rc.alias}
                                  onValueChange={val => updateRuleCandidate(ruleIndex, rcIdx, { alias: val })}
                                >
                                  {candidates
                                    .map(c => c.alias.trim())
                                    .filter(Boolean)
                                    .map(candAlias => (
                                      <DropdownMenuRadioItem key={candAlias} value={candAlias}>
                                        {candAlias}
                                      </DropdownMenuRadioItem>
                                    ))}
                                </DropdownMenuRadioGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Input
                              type="number"
                              min={-1000}
                              max={1000}
                              disabled={busy}
                              aria-label={`Rule ${ruleIndex + 1} candidate ${rcIdx + 1} priority`}
                              value={rc.priority}
                              onChange={e => updateRuleCandidate(ruleIndex, rcIdx, { priority: Number(e.target.value) })}
                            />
                            <Input
                              type="number"
                              min={1}
                              max={10000}
                              disabled={busy}
                              aria-label={`Rule ${ruleIndex + 1} candidate ${rcIdx + 1} weight`}
                              value={rc.weight}
                              onChange={e => updateRuleCandidate(ruleIndex, rcIdx, { weight: Number(e.target.value) })}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={busy || rule.candidates.length <= 1}
                              onClick={() => removeRuleCandidate(ruleIndex, rcIdx)}
                            >
                              <IconTrash size={14} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Label className="text-xs text-muted-foreground">
                {t('When no routing rule matches a request:', '当没有任何分流规则命中请求时：')}
              </Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={busy} aria-label="Default fallback action">
                    <span>{defaultActionLabels[defaultAction]}</span>
                    <IconChevronDown size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuRadioGroup
                    value={defaultAction}
                    onValueChange={v => setDefaultAction(v as ModelRoutePoolDefaultAction)}
                  >
                    <DropdownMenuRadioItem value="candidates">{defaultActionLabels.candidates}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="reject">{defaultActionLabels.reject}</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {t('Cancel', '取消')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('Saving…', '正在保存…') : isNew ? 'Create model pool' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoutePoolPreviewDialog({
  token,
  pool,
  triggerRef,
  onClose,
}: {
  token: string;
  pool: ModelRoutePool;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [protocol, setProtocol] = useState<ModelRoutePoolPreviewInput['protocol']>('chat');
  const [streaming, setStreaming] = useState(false);
  const [tools, setTools] = useState(false);
  const [structuredOutput, setStructuredOutput] = useState(false);
  const [vision, setVision] = useState(false);
  const [reasoning, setReasoning] = useState(false);
  const [inputTokens, setInputTokens] = useState('2000');
  const [outputTokens, setOutputTokens] = useState('1024');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ModelRoutePoolPreviewResult | null>(null);

  async function runPreview() {
    setLoading(true);
    setError('');
    try {
      const response = await request<{ data: ModelRoutePoolPreviewResult }>(
        token,
        `/api/v1/pools/${encodePoolReference(pool.alias)}/preview`,
        'POST',
        {
          protocol,
          streaming,
          tools,
          structured_output: structuredOutput,
          vision,
          reasoning,
          estimated_input_tokens: inputTokens.trim() ? Number(inputTokens) : null,
          requested_output_tokens: outputTokens.trim() ? Number(outputTokens) : null,
        },
      );
      setResult(response.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Preview request failed.', '路由预览请求失败。'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void runPreview();
  }, [pool.alias]);

  const protocolLabels: Record<ModelRoutePoolPreviewInput['protocol'], string> = {
    chat: 'Chat Completions (/v1/chat/completions)',
    responses: 'Responses (/v1/responses)',
    messages: 'Anthropic Messages (/v1/messages)',
    embeddings: 'Embeddings (/v1/embeddings)',
    generate_content: 'Gemini GenerateContent',
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        className="grid-cols-1 w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[90dvh] overflow-x-hidden overflow-y-auto"
        onCloseAutoFocus={event => {
          if (triggerRef.current?.isConnected) {
            event.preventDefault();
            triggerRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t(`Routing preview · ${pool.alias}`, `路由分流预览 · ${pool.alias}`)}</DialogTitle>
          <DialogDescription>
            {t(
              'Simulate how this model pool evaluates routing rules, candidate eligibility, and traffic shares without dispatching upstream requests.',
              '在不发起真实上游请求的情况下，模拟测试该模型池的分流规则命中、候选模型可用性与流量分配比例。',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t('Protocol', '调用协议')}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-between" aria-label="Preview protocol">
                    <span className="truncate">{protocolLabels[protocol]}</span>
                    <IconChevronDown size={15} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  <DropdownMenuRadioGroup
                    value={protocol}
                    onValueChange={v => setProtocol(v as ModelRoutePoolPreviewInput['protocol'])}
                  >
                    {(Object.entries(protocolLabels) as Array<[ModelRoutePoolPreviewInput['protocol'], string]>).map(
                      ([val, label]) => (
                        <DropdownMenuRadioItem key={val} value={val}>
                          {label}
                        </DropdownMenuRadioItem>
                      ),
                    )}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="preview-input-tokens">{t('Estimated input tokens', '预估输入 Token 数')}</Label>
              <Input
                id="preview-input-tokens"
                type="number"
                min={1}
                value={inputTokens}
                onChange={e => setInputTokens(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="preview-output-tokens">{t('Requested output tokens', '请求最大输出 Token')}</Label>
              <Input
                id="preview-output-tokens"
                type="number"
                min={1}
                value={outputTokens}
                onChange={e => setOutputTokens(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Label className="flex items-center gap-2 text-sm">
              <Checkbox checked={vision} onCheckedChange={v => setVision(v === true)} />
              <span>{t('Vision / image input', '包含视觉图片 (vision)')}</span>
            </Label>
            <Label className="flex items-center gap-2 text-sm">
              <Checkbox checked={tools} onCheckedChange={v => setTools(v === true)} />
              <span>{t('Tool calling', '工具调用 (tools)')}</span>
            </Label>
            <Label className="flex items-center gap-2 text-sm">
              <Checkbox checked={structuredOutput} onCheckedChange={v => setStructuredOutput(v === true)} />
              <span>{t('Structured JSON output', '结构化输出')}</span>
            </Label>
            <Label className="flex items-center gap-2 text-sm">
              <Checkbox checked={reasoning} onCheckedChange={v => setReasoning(v === true)} />
              <span>{t('Reasoning / thinking', '深度推理 (reasoning)')}</span>
            </Label>
            <Label className="flex items-center gap-2 text-sm">
              <Checkbox checked={streaming} onCheckedChange={v => setStreaming(v === true)} />
              <span>{t('Streaming SSE', '流式输出 (stream)')}</span>
            </Label>
            <Button type="button" size="sm" disabled={loading} onClick={() => void runPreview()}>
              <IconPlayerPlay size={15} />
              {loading ? t('Evaluating…', '正在计算…') : t('Run preview', '执行预览')}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {result.matched_rule
                      ? t(`Matched rule: ${result.matched_rule.name}`, `命中分流规则：${result.matched_rule.name}`)
                      : result.used_default_action === 'reject'
                        ? t('No rule matched · Rejected by default action', '未命中规则 · 按默认策略拒绝请求')
                        : t('Using default pool candidates', '使用默认候选模型池')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {result.billing_mode === 'candidate_tariff'
                      ? t('Billing mode: Per-candidate model tariff', '计费模式：按实际命中的候选模型售价分别计费')
                      : t('Billing mode: Unified pool tariff', '计费模式：作为自定义模型按模型池统一售价计费')}
                  </p>
                </div>
                <Badge variant={result.eligible_candidates.length > 0 ? 'secondary' : 'outline'}>
                  {t(
                    `${result.eligible_candidates.length} eligible candidate(s)`,
                    `${result.eligible_candidates.length} 个可用候选模型`,
                  )}
                </Badge>
              </div>

              {result.eligible_candidates.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t('Eligible candidates & traffic share', '可用候选模型与预计流量占比')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {result.eligible_candidates.map(cand => (
                      <Badge key={cand.alias} variant={cand.winning_tier ? 'secondary' : 'outline'} className="font-normal">
                        <span className="font-medium">{cand.alias}</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          P{cand.priority} · W{cand.weight} · {cand.traffic_share_percent}%
                        </span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {result.ineligible_candidates.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t('Filtered out candidates', '被过滤排除的候选模型')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {result.ineligible_candidates.map(cand => (
                      <Badge key={cand.alias} variant="outline" className="font-normal text-muted-foreground">
                        <span>{cand.alias}</span>
                        <span className="ml-1.5 text-xs">({cand.reason})</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('Close', '关闭')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoutePoolAuditDialog({
  token,
  pool,
  triggerRef,
  onClose,
}: {
  token: string;
  pool: ModelRoutePool;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [audit, setAudit] = useState<ModelRoutePoolAudit | null>(null);

  async function loadAudit(windowDays: number) {
    setLoading(true);
    setError('');
    try {
      const response = await request<{ data: ModelRoutePoolAudit }>(
        token,
        `/api/v1/pools/${encodePoolReference(pool.alias)}/audit?days=${windowDays}`,
        'GET',
      );
      setAudit(response.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Pool audit could not be loaded.', '无法加载模型池策略审计数据。'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAudit(days);
  }, [pool.alias, days]);

  const dayLabels: Record<7 | 30 | 90, string> = {
    7: t('Last 7 days', '最近 7 天'),
    30: t('Last 30 days', '最近 30 天'),
    90: t('Last 90 days', '最近 90 天'),
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        className="grid-cols-1 w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90dvh] overflow-x-hidden overflow-y-auto"
        onCloseAutoFocus={event => {
          if (triggerRef.current?.isConnected) {
            event.preventDefault();
            triggerRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t(`Strategy & billing audit · ${pool.alias}`, `路由策略与计费审计 · ${pool.alias}`)}</DialogTitle>
          <DialogDescription>
            {t(
              'Audit whether this pooling strategy is commercially and operationally sound: tariff readiness, candidate margin health, configured weight % vs. observed traffic %, latency, and net margin.',
              '审计该模型池策略的合理性：售价配置完备度、候选渠道毛利倒挂检测、配置权重占比与实际命中流量对比、延迟表现及净毛利贡献。',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Audit period">
                  {dayLabels[days]}
                  <IconChevronDown size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup value={String(days)} onValueChange={v => setDays(Number(v) as 7 | 30 | 90)}>
                  <DropdownMenuRadioItem value="7">{dayLabels[7]}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="30">{dayLabels[30]}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="90">{dayLabels[90]}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadAudit(days)}>
            <IconRefresh size={15} />
            {t('Refresh audit', '刷新审计')}
          </Button>
        </div>

        {loading && !audit && <p role="status">{t('Loading strategy audit…', '正在加载策略审计…')}</p>}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {audit && (
          <div className="min-w-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="min-w-0 rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t('Billing strategy', '计费策略')}</p>
                <p className="mt-1 font-medium">
                  {audit.billing_mode === 'candidate_tariff'
                    ? t('Per-candidate model price', '按命中候选模型分别计费')
                    : t('Unified pool price (custom model)', '作为自定义模型统一定价')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {audit.billing_mode === 'pool_tariff'
                    ? audit.pool_tariff.has_retail_tariff
                      ? `${t('Pool rate:', '模型池售价：')} ${formatRatePerMillion(audit.pool_tariff.prompt_rate, audit.pool_tariff.currency)} / ${formatRatePerMillion(audit.pool_tariff.completion_rate, audit.pool_tariff.currency)}`
                      : audit.pool_tariff.has_credits_tariff
                        ? t('Credits tariff configured on pool', '已配置积分售价')
                        : t('No retail tariff configured on pool alias yet', '尚未为该模型池配置统一售价')
                    : t('Uses each candidate route retail/Credits tariff', '直接沿用所命中候选模型的售价')}
                </p>
              </div>

              <div className="min-w-0 rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t(`Observed traffic (${audit.days}d)`, `实际流量统计 (${audit.days} 天)`)}</p>
                <p className="mt-1 font-medium">
                  {t(`${audit.totals.observed_attempts} requests`, `${audit.totals.observed_attempts} 次请求`)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    `${audit.totals.completed_attempts} completed · ${audit.totals.failed_attempts} failed`,
                    `${audit.totals.completed_attempts} 次成功 · ${audit.totals.failed_attempts} 次失败`,
                  )}
                </p>
              </div>

              <div className="min-w-0 rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t('Revenue, cost & net margin', '客户收入、上游成本与净毛利')}</p>
                <p className="mt-1 font-medium">
                  {formatNanos(audit.totals.net_margin_nanos, audit.pool_tariff.currency ?? 'USD')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('Charge:', '收入：')} {formatNanos(audit.totals.customer_charge_nanos, audit.pool_tariff.currency ?? 'USD')} ·{' '}
                  {t('Cost:', '成本：')} {formatNanos(audit.totals.supplier_cost_nanos, audit.pool_tariff.currency ?? 'USD')}
                </p>
              </div>
            </div>

            <div className="min-w-0 space-y-2">
              <h4 className="text-sm font-medium">{t('Strategy findings & recommendations', '策略审计结论与建议')}</h4>
              {audit.findings.map((finding, idx) => (
                <Alert key={idx} variant={finding.severity === 'critical' ? 'destructive' : 'default'}>
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words">{finding.message}</span>
                    <Badge variant={finding.severity === 'healthy' ? 'secondary' : 'outline'}>
                      {finding.severity}
                    </Badge>
                  </AlertDescription>
                </Alert>
              ))}
            </div>

            <div className="min-w-0 space-y-2 overflow-x-auto">
              <h4 className="text-sm font-medium">{t('Candidate routing & margin breakdown', '候选模型分流占比与毛利明细')}</h4>
              <Table aria-label="Candidate strategy audit">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Candidate', '候选模型')}</TableHead>
                    <TableHead>{t('Config vs. observed share', '配置权重 vs 实际流量')}</TableHead>
                    <TableHead>{t('Customer vs. upstream rate', '客户售价 vs 上游底价')}</TableHead>
                    <TableHead>{t('Latency & status', '延迟与成功率')}</TableHead>
                    <TableHead>{t('Net margin', '净毛利')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.candidates.map(cand => (
                    <TableRow key={cand.alias}>
                      <TableCell className="whitespace-normal">
                        <div className="font-medium break-words">{cand.alias}</div>
                        <div className="text-xs text-muted-foreground">
                          P{cand.priority} · W{cand.weight} {!cand.enabled ? '· off' : ''}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="text-sm">
                          {t(`Config: ${cand.configured_share_percent}%`, `配置：${cand.configured_share_percent}%`)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t(
                            `Observed: ${cand.observed_share_percent}% (${cand.observed_attempts})`,
                            `实际：${cand.observed_share_percent}% (${cand.observed_attempts} 次)`,
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant={
                              cand.margin_status === 'healthy'
                                ? 'secondary'
                                : cand.margin_status === 'inverted_margin'
                                  ? 'destructive'
                                  : 'outline'
                            }
                          >
                            {cand.margin_status === 'healthy'
                              ? t('Healthy margin', '毛利正常')
                              : cand.margin_status === 'inverted_margin'
                                ? t('Inverted margin', '售价低于成本')
                                : cand.margin_status === 'unpriced_customer'
                                  ? t('Missing customer tariff', '缺少客户售价')
                                  : t('No qualified supply', '无合格供应商报价')}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t('Supplier min:', '上游最低：')}{' '}
                          {formatRatePerMillion(cand.min_supplier_prompt_rate, cand.retail_currency ?? audit.pool_tariff.currency)} /{' '}
                          {formatRatePerMillion(cand.min_supplier_completion_rate, cand.retail_currency ?? audit.pool_tariff.currency)}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="text-sm">
                          {cand.avg_duration_ms !== null
                            ? `${cand.avg_duration_ms} ms avg${cand.p95_duration_ms !== null ? ` · ${cand.p95_duration_ms} ms p95` : ''}`
                            : '—'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {cand.completed_attempts} ok / {cand.failed_attempts} err
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="text-sm font-medium">
                          {formatNanos(cand.net_margin_nanos, cand.retail_currency ?? audit.pool_tariff.currency ?? 'USD')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          +{formatNanos(cand.customer_charge_nanos, '')} / -{formatNanos(cand.supplier_cost_nanos, '')}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('Close', '关闭')}
          </Button>
        </DialogFooter>
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
  onRestore,
}: {
  token: string;
  pool: ModelRoutePool;
  organizations: Organization[];
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onRestore: (revision: ModelRoutePoolRevision) => void;
}) {
  const { t } = useLocale();
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
      if (!Array.isArray(result.data)) throw new Error(t('Model pool history could not be read.', '无法读取模型池历史版本。'));
      setRevisions(current =>
        beforeRevision ? [...current, ...result.data.filter(row => !current.some(item => item.revision === row.revision))] : result.data,
      );
      setHasMore(result.data.length === 100 && (result.data.at(-1)?.revision ?? 0) > 1);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : t('Model pool history unavailable.', '模型池历史版本不可用。'));
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
        className="grid-cols-1 w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[90dvh] overflow-x-hidden overflow-y-auto"
        onCloseAutoFocus={event => {
          if (triggerRef.current?.isConnected) {
            event.preventDefault();
            triggerRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t(`Revision history · ${pool.alias}`, `版本历史 · ${pool.alias}`)}</DialogTitle>
          <DialogDescription>
            {poolScopeLabel(pool.organization_id, organizations, t)} ·{' '}
            {t('Immutable configuration revisions in descending order.', '按时间倒序排列的不可变发布记录。')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadHistory()}>
            <IconRefresh size={15} />
            {t('Refresh history', '刷新历史')}
          </Button>
        </div>

        {loading && revisions.length === 0 && <p role="status">{t('Loading revision history…', '正在加载历史版本…')}</p>}

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{error}</span>
              <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadHistory()}>
                {t('Retry', '重试')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="divide-y">
          {revisions.map(entry => (
            <section key={entry.revision} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{t(`Revision ${entry.revision}`, `版本 ${entry.revision}`)}</Badge>
                  <Badge variant={entry.enabled ? 'secondary' : 'outline'}>
                    {entry.enabled ? t('Enabled', '已启用') : t('Disabled', '已停用')}
                  </Badge>
                  {entry.billing_mode && (
                    <Badge variant="outline" className="font-normal">
                      {entry.billing_mode === 'candidate_tariff'
                        ? t('Per-candidate billing', '按命中模型分别计费')
                        : t('Unified pool price', '按模型池统一定价')}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(entry.recorded_at, t('Date unavailable', '时间未知'))}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onRestore(entry)}
                  >
                    {t('Restore in editor', '在编辑器中恢复')}
                  </Button>
                </div>
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
            {t('Older revisions', '加载更早版本')}
          </Button>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('Close', '关闭')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
