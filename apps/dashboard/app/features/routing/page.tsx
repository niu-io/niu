import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import { pinyin } from 'pinyin-pro';
import {
  IconChevronDown,
  IconEdit,
  IconHistory,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import {
  NiuAdminClient,
  type WorkspaceModelPool,
  type WorkspacePoolSelection,
} from '@niu-io/sdk';
import ConnectGate from '@/shell/ConnectGate';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useDashboardContext, type Model } from '@/shell/dashboard-context';
import { useLocale, translateUI } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import {
  fetchQuery,
  invalidateForMutation,
  peekQuery,
} from '@/lib/query-cache';
import {
  loadCriticalRouteEndpoint,
  routeShouldRevalidate,
  useOptionalRouteLoaderData,
} from '@/lib/route-data';
import ModelPicker from '../agent-review/ModelPicker';
import {
  agentHandoffPrompt,
  ReviewEmptyState,
  ReviewPageShell,
  safeText,
  stamp,
} from '../agent-review/shared';
import {
  buildPoolStrategy,
  PoolStrategyFields,
  poolStrategyErrorMessage,
  PoolStrategySummary,
  strategyDraftFrom,
  type PoolStrategyDraft,
} from './strategy';

function poolSlugFromName(name: string) {
  if (!name.trim()) return '';
  const romanized = pinyin(name, { toneType: 'none', nonZh: 'consecutive', v: true });
  return (
    romanized
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'pool'
  );
}

const ruleDescription = (
  conditions: NonNullable<WorkspaceModelPool['rules']>[number]['conditions'],
) =>
  Object.entries(conditions)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => {
      const labels: Record<string, string> = {
        protocol: 'Protocol',
        streaming: 'Streaming',
        tools: 'Tools',
        structured_output: 'Structured output',
        vision: 'Images',
        reasoning: 'Reasoning',
        min_input_tokens: 'Minimum input tokens',
        max_input_tokens: 'Maximum input tokens',
        min_output_tokens: 'Minimum output tokens',
        max_output_tokens: 'Maximum output tokens',
      };
      return `${translateUI(labels[key] ?? 'Condition')}: ${typeof value === 'boolean' ? translateUI(value ? 'required' : 'not requested') : value}`;
    })
    .join(' · ') || translateUI('All requests');

function PoolPolicyView({ pool }: { pool: WorkspaceModelPool }) {
  const { t: uiT } = useUILocale();
  const { t } = useLocale();
  const customerPrice = pool.strategy?.mode === 'customer_price';
  return (
    <div className="min-w-0 space-y-5">
      <div className="grid gap-5 border-b py-5 sm:grid-cols-2">
        <div>
          <h2 className="font-medium">{safeText(pool.name)}</h2>
          <p className="mt-2 text-sm">
            {safeText(pool.description) || uiT('No description supplied.')}
          </p>
        </div>
        <div>
          <p className="text-sm">
            {pool.enabled ? uiT('Enabled') : uiT('Disabled')}{' '}
            {uiT('· Default:')}{' '}
            {pool.default_action === 'reject'
              ? uiT('Reject unmatched requests')
              : uiT('Use candidate models')}
          </p>
          <PoolStrategySummary strategy={pool.strategy} />
          <p className="mt-2 text-sm text-muted-foreground">
            {uiT(
              'Saved configuration does not prove live model access or task quality.',
            )}
          </p>
        </div>
      </div>
      <h2 className="font-medium">{uiT('Candidate models')}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{uiT('Model')}</TableHead>
            <TableHead>{uiT('State')}</TableHead>
            <TableHead>{uiT('Priority')}</TableHead>
            <TableHead>{uiT('Weight')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pool.candidates.map((model) => (
            <TableRow key={model.alias}>
              <TableCell>{safeText(model.alias)}</TableCell>
              <TableCell>{model.enabled ? uiT('Enabled') : uiT('Disabled')}</TableCell>
              <TableCell>{model.priority}</TableCell>
              <TableCell>{model.weight}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {Boolean(pool.rules?.length) && (
        <>
          <h2 className="font-medium">{uiT('Routing rules')}</h2>
          {pool.rules?.map((rule) => (
            <div key={rule.id} className="border-b py-3">
              <p>
                {safeText(rule.name ?? 'Rule')} ·{' '}
                {rule.enabled ? uiT('Enabled') : uiT('Disabled')}
              </p>
              <p className="text-sm text-muted-foreground">
                {ruleDescription(rule.conditions)}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiT('Model')}</TableHead>
                    <TableHead>{uiT('State')}</TableHead>
                    <TableHead>{uiT('Priority')}</TableHead>
                    <TableHead>{uiT('Weight')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rule.candidates.map((candidate) => (
                    <TableRow key={candidate.alias}>
                      <TableCell>{safeText(candidate.alias)}</TableCell>
                      <TableCell>
                        {candidate.enabled ? uiT('Enabled') : uiT('Disabled')}
                      </TableCell>
                      <TableCell>{candidate.priority}</TableCell>
                      <TableCell>{candidate.weight}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </>
      )}
      <p className="text-sm text-muted-foreground">
        {customerPrice
          ? t(
              'Candidates with a comparable customer price are ranked by estimated charge; missing or incomparable prices stay unknown. Ties use priority, then weight. Rules are considered in saved order.',
              '有可比客户价格的候选模型按预计费用排序；缺失或不可比的价格保持未知。同价时依次比较优先级与权重。规则按保存顺序生效。',
            )
          : uiT(
              'Higher-priority candidates are considered first; weights balance equally ranked candidates. Rules are considered in saved order.',
            )}
      </p>
    </div>
  );
}

export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ workspace, url, params }) => {
    if (!workspace || params.slug) {
      return { endpoint: null };
    }
    const after = url.searchParams.get('after') ?? undefined;
    return {
      endpoint: `/api/v1/workspaces/${encodeURIComponent(workspace.id)}/routing${
        after ? `?after=${encodeURIComponent(after)}` : ''
      }`,
      fetcher: async (signal, snapshot) => {
        const client = new NiuAdminClient({
          adminToken: snapshot.token,
          baseURL: new URL('/api/v1', url.origin).href,
        });
        return await client.listWorkspaceReviewPools(workspace.id, after, {
          signal,
        });
      },
    };
  });
}

export const shouldRevalidate = routeShouldRevalidate;

export default function RoutingPage() {
  const { t: uiT } = useUILocale();
  useOptionalRouteLoaderData();
  const context = useDashboardContext();
  const params = useParams();
  return (
    <ConnectGate>
      {() =>
        context.workspace ? (
          <RoutingView
            key={[context.token, context.workspace.id, params.slug].join(':')}
            token={context.token}
            workspace={context.workspace.id}
            routeWorkspace={params.workspace ?? 'default'}
            slug={params.slug}
            canWrite={context.session?.permissions?.write !== false}
            models={context.models ?? []}
          />
        ) : (
          <p role="status">
            {uiT('Choose a workspace to review its model management.')}
          </p>
        )
      }
    </ConnectGate>
  );
}

type CachedListPage = {
  data: WorkspaceModelPool[];
  next_after?: string | null;
};
type Detail = {
  pool?: WorkspaceModelPool;
  history?: WorkspaceModelPool[];
  selections?: WorkspacePoolSelection[];
};
type CachedDetailBundle = {
  detail: Detail;
  historyBefore: number | null;
};

function RoutingView({
  token,
  workspace,
  routeWorkspace,
  slug,
  canWrite,
  models,
}: {
  token: string;
  workspace: string;
  routeWorkspace: string;
  slug?: string;
  canWrite: boolean;
  models: Model[];
}) {
  const { t } = useLocale();
  const { t: uiT, format: uiF } = useUILocale();
  const availableModels = useMemo(
    () =>
      models.filter(
        (model) =>
          !model.id.startsWith('pool/') && !model.id.startsWith('codex/'),
      ),
    [models],
  );
  const client = useMemo(
    () =>
      new NiuAdminClient({
        adminToken: token,
        baseURL: new URL('/api/v1', window.location.origin).href,
      }),
    [token],
  );
  const base = `/workspaces/${encodeURIComponent(routeWorkspace)}/routing`;
  const [query, setQuery] = useSearchParams();
  const after = query.get('after') ?? undefined;
  const revisionQuery = query.get('revision');
  const revisionNumber = Number(revisionQuery);
  const selectedRevision =
    revisionQuery &&
    /^[1-9][0-9]*$/.test(revisionQuery) &&
    Number.isSafeInteger(revisionNumber) &&
    revisionNumber < Number.MAX_SAFE_INTEGER
      ? revisionNumber
      : undefined;
  const cacheScope = token || 'public';
  const listCacheKey = `/api/v1/workspaces/${encodeURIComponent(workspace)}/routing${
    after ? `?after=${encodeURIComponent(after)}` : ''
  }`;
  const detailCacheKey = `review:detail:${workspace}:routing:${
    slug ?? ''
  }::${after ?? ''}:${selectedRevision ?? ''}`;
  const initialListCached = !slug
    ? peekQuery<CachedListPage>(cacheScope, listCacheKey)
    : undefined;
  const initialDetailCached = slug
    ? peekQuery<CachedDetailBundle>(cacheScope, detailCacheKey)
    : undefined;
  const [rows, setRows] = useState<WorkspaceModelPool[]>(
    () => initialListCached?.data ?? [],
  );
  const [detail, setDetail] = useState<Detail>(
    () => initialDetailCached?.detail ?? {},
  );
  const [next, setNext] = useState<string | null>(
    () => (slug ? null : initialListCached?.next_after) ?? null,
  );
  const historyOpener = useRef<HTMLButtonElement | null>(null);
  const [inspectedRevision, setInspectedRevision] =
    useState<WorkspaceModelPool | null>(null);
  const [historyBefore, setHistoryBefore] = useState<number | null>(
    () => initialDetailCached?.historyBefore ?? null,
  );
  const [loading, setLoading] = useState(() =>
    slug ? !initialDetailCached : !initialListCached,
  );
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const lastRefresh = useRef(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const pagingRequest = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const force = lastRefresh.current !== refresh;
    lastRefresh.current = refresh;
    setError('');
    async function load() {
      if (!slug) {
        const cached = !force
          ? peekQuery<CachedListPage>(cacheScope, listCacheKey)
          : undefined;
        if (cached && Array.isArray(cached.data)) {
          setRows(cached.data);
          setNext(cached.next_after ?? null);
          setLoading(false);
        } else {
          if (!cached) {
            setRows([]);
            setNext(null);
          }
          setLoading(true);
        }
        const page = await fetchQuery<CachedListPage>(
          cacheScope,
          listCacheKey,
          async (signal) => {
            return await client.listWorkspaceReviewPools(workspace, after, {
              signal,
            });
          },
          { signal: controller.signal, force, awaitRevalidate: true },
        );
        if (!controller.signal.aborted) {
          setRows(page.data);
          setNext(page.next_after ?? null);
        }
        return;
      }

      const cachedDetail = !force
        ? peekQuery<CachedDetailBundle>(cacheScope, detailCacheKey)
        : undefined;
      if (cachedDetail) {
        setDetail(cachedDetail.detail);
        setHistoryBefore(cachedDetail.historyBefore);
        setLoading(false);
      } else {
        setDetail({});
        setHistoryBefore(null);
        setLoading(true);
      }

      const bundle = await fetchQuery<CachedDetailBundle>(
        cacheScope,
        detailCacheKey,
        async (signal) => {
          const reqOpts = { signal };
          const [pool, history, selections] = await Promise.all([
            client.getWorkspaceReviewPool(workspace, slug, reqOpts),
            client.getWorkspaceReviewPoolHistory(
              workspace,
              slug,
              selectedRevision === undefined ? undefined : selectedRevision + 1,
              reqOpts,
            ),
            client.getWorkspaceReviewPoolSelections(workspace, slug, reqOpts),
          ]);
          return {
            detail: {
              pool: pool.data,
              history: history.data,
              selections: selections.data,
            },
            historyBefore: history.next_before,
          };
        },
        { signal: controller.signal, force, awaitRevalidate: true },
      );
      if (!controller.signal.aborted) {
        setDetail(bundle.detail);
        setHistoryBefore(bundle.historyBefore);
      }
    }
    void load()
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason?.status === 403
              ? 'Your current membership cannot read this workspace.'
              : reason?.status === 404
                ? 'This resource is unavailable in the current workspace.'
                : 'Could not load workspace evidence. Check your connection and retry.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    cacheScope,
    client,
    detailCacheKey,
    listCacheKey,
    workspace,
    slug,
    after,
    selectedRevision,
    refresh,
  ]);

  const title = t('Routing', '模型路由');
  const name = detail.pool?.name;
  const allowedTabs = ['configuration', 'history', 'executions'];
  const requestedTab = query.get('tab');
  const tab =
    requestedTab && allowedTabs.includes(requestedTab)
      ? requestedTab
      : allowedTabs[0];

  async function loadEarlierHistory() {
    if (!slug || !historyBefore || pagingRequest.current) return;
    pagingRequest.current = true;
    setLoadingMore(true);
    try {
      const result = await client.getWorkspaceReviewPoolHistory(
        workspace,
        slug,
        historyBefore,
      );
      setDetail((previous) => ({
        ...previous,
        history: [...(previous.history ?? []), ...result.data],
      }));
      setHistoryBefore(result.next_before);
    } catch {
      setError('Could not load earlier revisions. Retry this page.');
    } finally {
      pagingRequest.current = false;
      setLoadingMore(false);
    }
  }

  const revision = detail.pool?.revision;
  const [poolDialogOpen, setPoolDialogOpen] = useState(false);
  const [deletePoolTarget, setDeletePoolTarget] =
    useState<WorkspaceModelPool | null>(null);
  const [deletingPool, setDeletingPool] = useState(false);
  const [deletePoolError, setDeletePoolError] = useState('');
  const [editingPool, setEditingPool] = useState<WorkspaceModelPool | null>(null);
  const [poolName, setPoolName] = useState('');
  const [poolSlug, setPoolSlug] = useState('');
  const [poolSlugEdited, setPoolSlugEdited] = useState(false);
  const [poolDescription, setPoolDescription] = useState('');
  const [poolEnabled, setPoolEnabled] = useState(true);
  const [poolDefaultAction, setPoolDefaultAction] = useState<
    'candidates' | 'reject'
  >('candidates');
  const [poolStrategy, setPoolStrategy] = useState<PoolStrategyDraft>(() =>
    strategyDraftFrom(),
  );
  const [advancedPool, setAdvancedPool] = useState(false);
  const [poolCandidates, setPoolCandidates] = useState<
    Array<{ alias: string; priority: string; weight: string; enabled: boolean }>
  >([{ alias: '', priority: '100', weight: '1', enabled: true }]);
  const [poolRules, setPoolRules] = useState<
    NonNullable<WorkspaceModelPool['rules']>
  >([]);
  const [savingPool, setSavingPool] = useState(false);
  const [poolFormError, setPoolFormError] = useState('');
  const [restoreRevisionError, setRestoreRevisionError] = useState('');

  function openCreatePoolDialog() {
    setEditingPool(null);
    setAdvancedPool(false);
    setPoolName('');
    setPoolSlug('');
    setPoolSlugEdited(false);
    setPoolDescription('');
    setPoolEnabled(true);
    setPoolDefaultAction('candidates');
    const pricingCurrency =
      availableModels.find((model) => model.customer_pricing)?.customer_pricing
        ?.currency ?? 'USD';
    setPoolStrategy(strategyDraftFrom(undefined, pricingCurrency));
    setPoolCandidates([
      {
        alias: availableModels[0]?.id ?? '',
        priority: '100',
        weight: '1',
        enabled: true,
      },
    ]);
    setPoolRules([]);
    setPoolFormError('');
    setPoolDialogOpen(true);
  }

  function openEditPoolDialog(pool: WorkspaceModelPool) {
    setEditingPool(pool);
    setAdvancedPool(true);
    setPoolName(pool.name);
    setPoolSlug(pool.slug);
    setPoolSlugEdited(true);
    setPoolDescription(pool.description);
    setPoolEnabled(pool.enabled);
    setPoolDefaultAction(pool.default_action ?? 'candidates');
    setPoolStrategy(strategyDraftFrom(pool));
    setPoolCandidates(
      pool.candidates.length
        ? pool.candidates.map((candidate) => ({
            alias: candidate.alias,
            priority: String(candidate.priority),
            weight: String(candidate.weight),
            enabled: candidate.enabled,
          }))
        : [
            {
              alias: availableModels[0]?.id ?? '',
              priority: '100',
              weight: '1',
              enabled: true,
            },
          ],
    );
    setPoolRules(
      (pool.rules ?? []).map((rule) => ({
        ...rule,
        conditions: { ...rule.conditions },
        candidates: rule.candidates.map((c) => ({ ...c })),
      })),
    );
    setPoolFormError('');
    setPoolDialogOpen(true);
  }

  async function deletePool() {
    if (!deletePoolTarget) return;
    setDeletingPool(true);
    setDeletePoolError('');
    try {
      await client.deleteWorkspaceReviewPool(
        workspace,
        deletePoolTarget.slug,
        deletePoolTarget.revision,
      );
      setDeletePoolTarget(null);
      window.location.assign(base);
    } catch (reason) {
      setDeletePoolError(
        reason instanceof Error
          ? reason.message
          : t('Could not delete custom model.', '无法删除自定义模型。'),
      );
    } finally {
      setDeletingPool(false);
    }
  }

  function addRoutingRule(
    preset?: 'vision' | 'tools' | 'structured_output' | 'reasoning',
  ) {
    setPoolRules((current) => {
      if (current.length >= 32) return current;
      const nextIndex = current.length + 1;
      let id = `rule-${nextIndex}`;
      while (current.some((r) => r.id === id)) {
        id = `rule-${nextIndex}-${Math.floor(Math.random() * 900 + 100)}`;
      }
      const defaultTarget =
        poolCandidates.find((c) => c.alias.trim())?.alias.trim() ||
        availableModels[0]?.id ||
        '';
      const name =
        preset === 'vision'
          ? t('Vision & image requests', '视觉与图片输入分流')
          : preset === 'tools'
            ? t('Tool calling requests', '工具调用分流')
            : preset === 'structured_output'
              ? t('Structured JSON output', '结构化 JSON 输出分流')
              : preset === 'reasoning'
                ? t('Deep reasoning requests', '深度推理分流')
                : t(`Routing rule ${nextIndex}`, `路由规则 ${nextIndex}`);
      const conditions =
        preset === 'vision'
          ? { vision: true }
          : preset === 'tools'
            ? { tools: true }
            : preset === 'structured_output'
              ? { structured_output: true }
              : preset === 'reasoning'
                ? { reasoning: true }
                : { tools: true };
      return [
        ...current,
        {
          id,
          name,
          enabled: true,
          conditions,
          candidates: [
            { alias: defaultTarget, priority: 100, weight: 1, enabled: true },
          ],
        },
      ];
    });
  }

  function updateRoutingRule(
    index: number,
    patch: Partial<NonNullable<WorkspaceModelPool['rules']>[number]>,
  ) {
    setPoolRules((current) =>
      current.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)),
    );
  }

  function removeRoutingRule(index: number) {
    setPoolRules((current) => current.filter((_, idx) => idx !== index));
  }

  function updateCandidate(
    index: number,
    patch: Partial<{
      alias: string;
      priority: string;
      weight: string;
      enabled: boolean;
    }>,
  ) {
    setPoolCandidates((current) =>
      current.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    );
  }

  function addCandidate() {
    setPoolCandidates((current) => [
      ...current,
      { alias: '', priority: '100', weight: '1', enabled: true },
    ]);
  }

  function removeCandidate(index: number) {
    setPoolCandidates((current) =>
      current.length <= 1
        ? current
        : current.filter((_, idx) => idx !== index),
    );
  }

  async function submitPoolForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPool) return;
    const trimmedName = poolName.trim();
    const normalizedSlug = poolSlug.trim();
    if (!trimmedName) {
      setPoolFormError(t('Enter a model pool name.', '请输入模型池名称。'));
      return;
    }
    if (
      !normalizedSlug ||
      normalizedSlug.length > 80 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)
    ) {
      setPoolFormError(
        t(
          'Use a lowercase letters, numbers, and hyphens slug (up to 80 characters).',
          '请使用小写字母、数字和连字符组成的标识（最多 80 个字符）。',
        ),
      );
      return;
    }
    const parsedCandidates: WorkspaceModelPool['candidates'] = [];
    const seenAliases = new Set<string>();
    for (const candidate of poolCandidates) {
      const alias = candidate.alias.trim();
      const priority = Number(candidate.priority);
      const weight = Number(candidate.weight);
      if (!alias || alias.startsWith('pool/') || alias.startsWith('codex/')) {
        setPoolFormError(
          t(
            'Enter a valid workspace model alias for every candidate.',
            '请为每个候选模型填写有效的工作区模型标识。',
          ),
        );
        return;
      }
      if (seenAliases.has(alias)) {
        setPoolFormError(
          t(
            'Each candidate model in a pool must be unique.',
            '同一模型池中的候选模型不能重复。',
          ),
        );
        return;
      }
      seenAliases.add(alias);
      if (
        !Number.isInteger(priority) ||
        priority < -1000 ||
        priority > 1000 ||
        !Number.isInteger(weight) ||
        weight < 1 ||
        weight > 10000
      ) {
        setPoolFormError(
          t(
            'Priority must be between -1000 and 1000; weight must be between 1 and 10000.',
            '优先级必须在 -1000 到 1000 之间，权重必须在 1 到 10000 之间。',
          ),
        );
        return;
      }
      parsedCandidates.push({
        alias,
        priority,
        weight,
        enabled: candidate.enabled,
      });
    }
    if (
      poolEnabled &&
      !parsedCandidates.some((candidate) => candidate.enabled)
    ) {
      setPoolFormError(
        t(
          'An enabled custom model requires at least one enabled candidate model.',
          '启用的自定义路由模型至少需要一个处于启用状态的候选模型。',
        ),
      );
      return;
    }
    const parsedRules: NonNullable<WorkspaceModelPool['rules']> = [];
    for (const rule of poolRules) {
      const ruleName = (rule.name ?? '').trim();
      const targetAlias = (rule.candidates[0]?.alias ?? '').trim();
      if (!ruleName || !targetAlias) {
        setPoolFormError(
          t(
            'Every routing rule requires a name and a target model.',
            '每条路由规则都需要填写规则名称和目标模型。',
          ),
        );
        return;
      }
      // Rule targets only receive matching traffic. They must never be added
      // to the default candidate pool, which handles unmatched requests.
      parsedRules.push({
        id: rule.id,
        name: ruleName,
        enabled: rule.enabled,
        conditions: rule.conditions,
        candidates: [
          {
            alias: targetAlias,
            priority: rule.candidates[0]?.priority ?? 100,
            weight: rule.candidates[0]?.weight ?? 1,
            enabled: true,
          },
        ],
      });
    }
    const strategyResult = buildPoolStrategy(poolStrategy);
    if ('error' in strategyResult) {
      setPoolFormError(poolStrategyErrorMessage(t, strategyResult.error));
      return;
    }
    setSavingPool(true);
    setPoolFormError('');
    try {
      const payload: WorkspaceModelPool = {
        slug: normalizedSlug,
        name: trimmedName,
        description: poolDescription.trim(),
        enabled: poolEnabled,
        revision: editingPool ? editingPool.revision : 0,
        default_action: poolDefaultAction,
        strategy: strategyResult.strategy,
        candidates: parsedCandidates,
        rules: parsedRules,
      };
      const saved = await client.setWorkspaceReviewPool(
        workspace,
        normalizedSlug,
        payload,
      );
      invalidateForMutation(
        token,
        `/api/v1/workspaces/${encodeURIComponent(workspace)}/routing/${encodeURIComponent(normalizedSlug)}`,
        'PUT',
      );
      invalidateForMutation(
        token,
        `/api/v1/workspaces/${encodeURIComponent(workspace)}/routing`,
        'PUT',
      );
      setPoolDialogOpen(false);
      if (slug) {
        setDetail((previous) => ({
          ...previous,
          pool: saved.data,
          history: [
            saved.data,
            ...(previous.history ?? []).filter(
              (item) => item.revision !== saved.data.revision,
            ),
          ],
        }));
      } else {
        setRows((previous) => {
          const filtered = previous.filter(
            (row) => row.slug !== saved.data.slug,
          );
          return [...filtered, saved.data].sort((a, b) =>
            a.slug.localeCompare(b.slug),
          );
        });
      }
      setRefresh((value) => value + 1);
    } catch (reason) {
      const message =
        reason instanceof Error && reason.message
          ? reason.message
          : t(
              'Could not save the model pool. Check candidate model names and try again.',
              '无法保存模型池，请检查候选模型名称后重试。',
            );
      setPoolFormError(message);
    } finally {
      setSavingPool(false);
    }
  }

  async function restorePoolRevision(targetRevision: WorkspaceModelPool) {
    if (!detail.pool || savingPool) return;
    setSavingPool(true);
    setRestoreRevisionError('');
    try {
      const payload: WorkspaceModelPool = {
        ...targetRevision,
        slug: detail.pool.slug,
        revision: detail.pool.revision,
      };
      const saved = await client.setWorkspaceReviewPool(
        workspace,
        detail.pool.slug,
        payload,
      );
      invalidateForMutation(
        token,
        `/api/v1/workspaces/${encodeURIComponent(workspace)}/routing/${encodeURIComponent(detail.pool.slug)}`,
        'PUT',
      );
      setDetail((previous) => ({
        ...previous,
        pool: saved.data,
        history: [
          saved.data,
          ...(previous.history ?? []).filter(
            (item) => item.revision !== saved.data.revision,
          ),
        ],
      }));
      setInspectedRevision(null);
      setRefresh((value) => value + 1);
    } catch (reason) {
      setRestoreRevisionError(
        reason instanceof Error && reason.message
          ? reason.message
          : t(
              'Could not restore this revision. Refresh and try again.',
              '无法恢复此版本，请刷新页面后重试。',
            ),
      );
    } finally {
      setSavingPool(false);
    }
  }

  const description = error
    ? uiT('Return to the list or retry loading this resource.')
    : loading
      ? uiT('Retrieving workspace evidence…')
      : slug
        ? uiF(
            'Saved workspace configuration{0}. Your agent can make changes within its delegated authority.',
            [revision ? uiF(' · revision {0}', [revision]) : ''],
          )
        : rows.length ? t(
            'Define custom models backed by conditional routing rules and fallback candidates, or review agent revisions and execution evidence.',
            '将一系列条件路由与候选回退规则配置为自定义模型，或审阅智能体使用的路由策略、修订记录及执行证据。',
          ) : '';

  return (
    <ReviewPageShell
      title={title}
      actions={
        <>
          {!slug && canWrite && (
            <Button size="sm" onClick={openCreatePoolDialog}>
              <IconPlus size={16} />
              {t('Create custom model', '创建自定义模型')}
            </Button>
          )}
          {slug && detail.pool && canWrite && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditPoolDialog(detail.pool!)}
              >
                <IconEdit size={16} />
                {t('Edit routing', '编辑路由配置')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDeletePoolError('');
                  setDeletePoolTarget(detail.pool!);
                }}
              >
                <IconTrash size={16} />
                {t('Delete custom model', '删除自定义模型')}
              </Button>
            </>
          )}
        </>
      }
      back={slug ? { to: base, label: title } : undefined}
      heading={slug ? (name ? safeText(name) : t('Review', '审阅')) : undefined}
      description={description}
      error={error}
      loading={loading}
      onRefresh={() => setRefresh((value) => value + 1)}
      onRetry={() => setRefresh((value) => value + 1)}
    >
      {!slug &&
        (rows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{uiT('Name')}</TableHead>
                  <TableHead>{uiT('State')}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {uiT('Models')}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {uiT('Revision')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.slug}>
                    <TableCell>
                      <Link
                        className="font-medium underline-offset-4 hover:underline"
                        to={`${base}/${encodeURIComponent(row.slug)}`}
                      >
                        {safeText(row.name)}
                      </Link>
                      <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                        {uiF('pool/{0}', [safeText(row.slug)])}
                      </p>
                      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground sm:hidden">
                        <p>
                          {uiT('Models')}:{' '}
                          {row.candidates
                            .filter((model) => model.enabled)
                            .map((model) => safeText(model.alias))
                            .join(', ') || uiT('No enabled candidates')}
                        </p>
                        <p>
                          {uiT('Revision')}: {row.revision}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="lifecycle-badge" data-tone={row.enabled ? 'active' : 'inactive'}>
                        <span className="status-dot" aria-hidden="true" />{row.enabled ? uiT('Enabled') : uiT('Disabled')}
                      </span>
                    </TableCell>
                    <TableCell className="hidden whitespace-normal break-words sm:table-cell">
                      {row.candidates
                        .filter((model) => model.enabled)
                        .map((model) => safeText(model.alias))
                        .join(', ') || uiT('No enabled candidates')}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {row.revision}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex gap-2">
              {after && (
                <Button variant="outline" onClick={() => setQuery({})}>
                  {uiT('First page')}
                </Button>
              )}
              {next && (
                <Button
                  variant="outline"
                  onClick={() => setQuery({ after: next })}
                >
                  {uiT('Next page')}
                </Button>
              )}
            </div>
          </>
        ) : (
          <ReviewEmptyState
            title={t('No custom models yet', '暂无自定义路由模型')}
            description={t(
              'Combine conditional routing rules and prioritized candidate models into a callable custom model, or ask your coding agent to configure routing for your task.',
              '将一系列条件路由分流规则与候选模型组合为可调用的自定义模型，或让你的 coding agent 为任务配置模型路由。',
            )}
            actions={
              canWrite ? (
                <Button onClick={openCreatePoolDialog}>
                  <IconPlus size={16} />
                  {t('Create custom model', '创建自定义模型')}
                </Button>
              ) : undefined
            }
            prompt={agentHandoffPrompt(
              routeWorkspace,
              'configure model routing for my task',
            )}
            onError={setError}
          />
        ))}
      {slug && detail.pool && (
        <Tabs
          value={tab}
          onValueChange={(value) =>
            setQuery((previous) => {
              const nextQuery = new URLSearchParams(previous);
              nextQuery.set('tab', value);
              return nextQuery;
            })
          }
        >
          <TabsList variant="line">
            <TabsTrigger value="configuration">
              {uiT('Configuration')}
            </TabsTrigger>
            <TabsTrigger value="history">{uiT('History')}</TabsTrigger>
            <TabsTrigger value="executions">{uiT('Executions')}</TabsTrigger>
          </TabsList>
          <TabsContent value="configuration" className="space-y-5">
            <PoolPolicyView pool={detail.pool} />{' '}
          </TabsContent>
          <TabsContent value="history">
            {revisionQuery && (
              <p role="status" className="py-3 text-sm text-muted-foreground">
                {selectedRevision &&
                detail.history?.some(
                  (policy) => policy.revision === selectedRevision,
                )
                  ? uiF(
                      'Viewing saved revision {0} and earlier. Current workspace revision: {1}.',
                      [selectedRevision, detail.pool.revision],
                    )
                  : uiT(
                      'The referenced saved revision is unavailable. Review the revisions listed below.',
                    )}
              </p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{uiT('Revision')}</TableHead>
                  <TableHead>{uiT('State')}</TableHead>
                  <TableHead>{uiT('Models')}</TableHead>
                  <TableHead>{uiT('Review')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.history?.map((policy) => (
                  <TableRow key={policy.revision}>
                    <TableCell>{policy.revision}</TableCell>
                    <TableCell>
                      {policy.enabled ? uiT('Enabled') : uiT('Disabled')}
                    </TableCell>
                    <TableCell>
                      {policy.candidates
                        .map((model) => safeText(model.alias))
                        .join(', ')}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          historyOpener.current = event.currentTarget;
                          setInspectedRevision(policy);
                        }}
                      >
                        {uiT('Review revision')} {policy.revision}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3">
              {historyBefore && (
                <Button
                  variant="outline"
                  disabled={loadingMore}
                  onClick={() => void loadEarlierHistory()}
                >
                  {uiT('Load earlier revisions')}
                </Button>
              )}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {uiT(
                'Immutable revisions. Ask your agent to compare or restore a revision using the current expected revision.',
              )}
            </p>
          </TabsContent>
          <TabsContent value="executions">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{uiT('Time')}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {uiT('Pool revision')}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {uiT('Selected model')}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {uiT('HTTP response')}
                  </TableHead>
                  <TableHead>{uiT('Evidence')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.selections?.map((selection, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {stamp(selection.created_at)}
                      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground sm:hidden">
                        <p>
                          {uiT('Pool revision')}: {selection.pool_revision}
                        </p>
                        <p>
                          {uiT('Selected model')}:{' '}
                          {safeText(selection.selected_model)}
                        </p>
                        <p>
                          {uiT('HTTP response')}:{' '}
                          {selection.response_status ?? uiT('Unavailable')}
                        </p>
                        <p>
                          {uiT('Evidence')}:{' '}
                          {selection.reference ? (
                            <Link
                              className="underline underline-offset-2"
                              to={`/workspaces/${encodeURIComponent(routeWorkspace)}/executions#gateway-attempt-${encodeURIComponent(selection.reference)}`}
                            >
                              {uiT('Inspect request')}
                            </Link>
                          ) : (
                            uiT('Evidence unavailable')
                          )}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {selection.pool_revision}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {safeText(selection.selected_model)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {selection.response_status ?? uiT('Unavailable')}
                    </TableCell>
                    <TableCell>
                      {selection.reference ? (
                        <Link
                          className="underline underline-offset-2"
                          to={`/workspaces/${encodeURIComponent(routeWorkspace)}/executions#gateway-attempt-${encodeURIComponent(selection.reference)}`}
                        >
                          {uiT('Inspect request')}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {uiT('Evidence unavailable')}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!detail.selections?.length && (
              <Empty className="min-h-60">
                <EmptyHeader>
                  <EmptyDescription>
                    {uiT('No recorded selections yet.')}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            <Button variant="link" asChild>
              <Link
                to={`/workspaces/${encodeURIComponent(routeWorkspace)}/executions`}
              >
                {uiT('Inspect request logs')}
              </Link>
            </Button>
            <p className="text-sm text-muted-foreground">
              {uiT(
                'Latest 100 selections. An HTTP response does not establish terminal generation or task acceptance.',
              )}
            </p>
          </TabsContent>
        </Tabs>
      )}
      <Dialog
        open={Boolean(inspectedRevision)}
        onOpenChange={(open) => {
          if (!open) {
            setInspectedRevision(null);
            setRestoreRevisionError('');
          }
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            historyOpener.current?.focus();
          }}
          className="max-h-[85dvh] min-w-0 overflow-x-hidden overflow-y-auto [&>*]:min-w-0 sm:max-w-3xl"
        >
          <DialogHeader className="pr-6">
            <DialogTitle className="break-words">
              {uiT('Revision')} {inspectedRevision?.revision} ·{' '}
              {inspectedRevision ? safeText(inspectedRevision.name) : ''}
            </DialogTitle>
            <DialogDescription>
              {uiT('Immutable saved configuration. Current workspace revision:')}{' '}
              {detail.pool?.revision ?? uiT('unavailable')}.
            </DialogDescription>
          </DialogHeader>
          {inspectedRevision && detail.pool && (
            <>
              <p className="text-sm text-muted-foreground">
                {uiT('Changed compared with current revision:')}{' '}
                {(
                  [
                    'name',
                    'description',
                    'enabled',
                    'default_action',
                    'strategy',
                    'candidates',
                    'rules',
                  ] as const
                )
                  .filter(
                    (field) =>
                      JSON.stringify(inspectedRevision[field]) !==
                      JSON.stringify(detail.pool![field]),
                  )
                  .map(
                    (field) =>
                      ({
                        name: 'Name',
                        description: 'Description',
                        enabled: 'Enabled state',
                        default_action: 'Default action',
                        strategy: 'Selection strategy',
                        candidates: 'Candidate models',
                        rules: 'Routing rules',
                      })[field],
                  )
                  .join(', ') || uiT('No policy differences')}
              </p>
              {restoreRevisionError && (
                <Alert variant="destructive">
                  <AlertDescription>{uiT(restoreRevisionError)}</AlertDescription>
                </Alert>
              )}
              <PoolPolicyView pool={inspectedRevision} />
              {canWrite &&
                inspectedRevision.revision !== detail.pool.revision && (
                  <DialogFooter>
                    <Button
                      type="button"
                      disabled={savingPool}
                      onClick={() => void restorePoolRevision(inspectedRevision)}
                    >
                      <IconHistory size={16} />
                      {savingPool
                        ? t('Restoring…', '恢复中…')
                        : t('Restore this revision', '恢复此版本')}
                    </Button>
                  </DialogFooter>
                )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={poolDialogOpen}
        onOpenChange={(open) => {
          if (!open && !savingPool) {
            setPoolDialogOpen(false);
            setPoolFormError('');
          }
        }}
      >
        <DialogContent className="max-h-[88dvh] min-w-0 overflow-x-hidden overflow-y-auto [&>*]:min-w-0 sm:max-w-2xl">
          <DialogHeader className="pr-6">
            <DialogTitle>
              {editingPool
                ? t('Edit custom model routing', '编辑自定义模型路由')
                : t('Create custom model', '创建自定义模型')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'Define a custom model backed by conditional routing rules and prioritized fallback candidates.',
                '通过条件路由分流规则与按优先级/权重排列的候选模型，定义一个可直接调用的自定义模型。',
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => void submitPoolForm(event)}
            className="space-y-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t('Start with one model', '先从一个模型开始')}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(
                    'Niu routes to the first enabled candidate, then falls back in order. Show advanced settings to add routing rules, choose a selection strategy, or adjust priority and weight.',
                    'Niu 会先路由到第一个启用的候选模型，再按顺序回退。需要条件分流规则、选择策略或调整优先级/权重时，再展开高级设置。',
                  )}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={savingPool}
                aria-expanded={advancedPool}
                onClick={() => setAdvancedPool((value) => !value)}
              >
                {advancedPool
                  ? t('Hide advanced settings', '收起高级设置')
                  : t('Advanced settings', '高级设置')}
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pool-name">{t('Name', '自定义模型名称')}</Label>
                <Input
                  id="pool-name"
                  required
                  maxLength={200}
                  disabled={savingPool}
                  value={poolName}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setPoolName(nextName);
                    if (!editingPool && !poolSlugEdited) {
                      setPoolSlug(poolSlugFromName(nextName));
                    }
                  }}
                  placeholder={t('Fast coding router', '快速编码路由模型')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pool-slug">
                  {t('Slug', '模型标识 (Slug)')}
                </Label>
                <Input
                  id="pool-slug"
                  required
                  maxLength={80}
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={Boolean(editingPool) || savingPool}
                  value={poolSlug}
                  onChange={(event) => {
                    setPoolSlugEdited(true);
                    setPoolSlug(
                      event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]+/g, '-')
                        .replace(/^-+|-+$/g, ''),
                    );
                  }}
                  placeholder={t('fast-coding-router', 'fast-coding-router')}
                />
                <p className="break-words text-xs text-muted-foreground">
                  {t('Invoked as custom model', '作为自定义模型调用：')}{' '}
                  <code className="font-mono">
                    pool/{poolSlug || '<slug>'}
                  </code>
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pool-description">
                {t('Description', '描述')}
              </Label>
              <Textarea
                id="pool-description"
                rows={2}
                maxLength={4000}
                disabled={savingPool}
                value={poolDescription}
                onChange={(event) => setPoolDescription(event.target.value)}
                placeholder={t(
                  'Optional notes on routing criteria or fallback behavior',
                  '可选：说明路由分流条件或回退策略',
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('Default action', '默认路由动作')}</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={savingPool}
                      aria-label={t('Default action', '默认路由动作')}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {poolDefaultAction === 'candidates'
                          ? t('Route to candidate models', '路由至候选模型')
                          : t('Reject when no rule matches', '无规则匹配时拒绝')}
                      </span>
                      <IconChevronDown size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-[var(--radix-dropdown-menu-trigger-width)]"
                  >
                    <DropdownMenuRadioGroup
                      value={poolDefaultAction}
                      onValueChange={(value) =>
                        setPoolDefaultAction(value as 'candidates' | 'reject')
                      }
                    >
                      <DropdownMenuRadioItem value="candidates">
                        {t('Route to candidate models', '路由至候选模型')}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="reject">
                        {t('Reject when no rule matches', '无规则匹配时拒绝')}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-2 pt-2 sm:pt-7">
                <Checkbox
                  id="pool-enabled"
                  disabled={savingPool}
                  checked={poolEnabled}
                  onCheckedChange={(checked) => setPoolEnabled(checked === true)}
                />
                <Label htmlFor="pool-enabled" className="font-normal">
                  {t('Enable custom model routing', '启用该自定义路由模型')}
                </Label>
              </div>
            </div>
            <div className={advancedPool ? 'space-y-4' : 'hidden'}>
              <PoolStrategyFields
                draft={poolStrategy}
                onChange={setPoolStrategy}
                disabled={savingPool}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>{t('Routing rules', '条件路由规则')}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(
                      'Route specific request types (vision, tools, structured output, reasoning) to dedicated models before falling back.',
                      '按请求特征（视觉输入、工具调用、结构化输出、深度推理）分流至指定模型，未命中时回退至下方默认候选模型。',
                    )}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={savingPool || poolRules.length >= 32}
                    >
                      <IconPlus size={14} />
                      {t('Add routing rule', '添加路由规则')}
                      <IconChevronDown size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => addRoutingRule('vision')}>
                      {t('Vision & image requests', '视觉与图片输入分流')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => addRoutingRule('tools')}>
                      {t('Tool calling requests', '工具调用分流')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => addRoutingRule('structured_output')}
                    >
                      {t('Structured JSON output', '结构化 JSON 输出分流')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => addRoutingRule('reasoning')}
                    >
                      {t('Deep reasoning requests', '深度推理分流')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {poolRules.length > 0 && (
                <div className="space-y-2.5">
                  {poolRules.map((rule, ruleIndex) => (
                    <div
                      key={rule.id}
                      className="space-y-2.5 rounded-lg bg-muted/40 p-3"
                    >
                      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <div className="space-y-1">
                          <Label
                            htmlFor={`pool-rule-name-${ruleIndex}`}
                            className="text-xs text-muted-foreground"
                          >
                            {t('Rule name', '规则名称')}
                          </Label>
                          <Input
                            id={`pool-rule-name-${ruleIndex}`}
                            required
                            disabled={savingPool}
                            value={rule.name ?? ''}
                            onChange={(event) =>
                              updateRoutingRule(ruleIndex, {
                                name: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label
                            htmlFor={`pool-rule-target-${ruleIndex}`}
                            className="text-xs text-muted-foreground"
                          >
                            {t('Route to model', '目标路由模型')}
                          </Label>
                          <ModelPicker
                            id={`pool-rule-target-${ruleIndex}`}
                            value={rule.candidates[0]?.alias ?? ''}
                            models={availableModels}
                            disabled={savingPool}
                            placeholder={t(
                              'e.g. gpt-4.1-mini',
                              '例如 gpt-4.1-mini',
                            )}
                            onChange={(alias) =>
                              updateRoutingRule(ruleIndex, {
                                candidates: [
                                  {
                                    alias,
                                    priority: 100,
                                    weight: 1,
                                    enabled: true,
                                  },
                                ],
                              })
                            }
                          />
                        </div>
                        <div className="flex items-end justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={savingPool}
                            onClick={() => removeRoutingRule(ruleIndex)}
                            aria-label={t('Remove rule', '移除路由规则')}
                          >
                            <IconTrash size={14} />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
                        <span className="text-muted-foreground">
                          {t('Match when request uses:', '匹配条件：')}
                        </span>
                        {(
                          [
                            ['vision', 'Vision / images', '视觉/图片'],
                            ['tools', 'Tools', '工具调用'],
                            [
                              'structured_output',
                              'Structured output',
                              '结构化输出',
                            ],
                            ['reasoning', 'Reasoning', '深度推理'],
                          ] as const
                        ).map(([condKey, condEn, condZh]) => (
                          <label
                            key={condKey}
                            className="inline-flex items-center gap-1.5"
                          >
                            <Checkbox
                              checked={rule.conditions[condKey] === true}
                              onCheckedChange={(checked) => {
                                const nextConditions = { ...rule.conditions };
                                if (checked === true) {
                                  nextConditions[condKey] = true;
                                } else {
                                  delete nextConditions[condKey];
                                }
                                updateRoutingRule(ruleIndex, {
                                  conditions: nextConditions,
                                });
                              }}
                            />
                            <span>{t(condEn, condZh)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>
                    {t('Candidate models', '默认候选模型与回退顺序')}
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(
                      'Higher priority (-1000 to 1000) is routed first; weight (1 to 10000) balances equally ranked candidates.',
                      '优先级（-1000 至 1000）越高越先路由；权重（1 至 10000）用于在同优先级候选模型间分配流量。',
                    )}
                  </p>
                  {availableModels.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(
                        'No eligible models detected. Enter a configured model alias or ask a platform administrator to publish a route.',
                        '未检测到可用模型。请输入已配置的模型标识，或请平台管理员发布路由。',
                      )}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      'Model details show catalog capabilities; availability and customer prices can differ. Inspect each candidate before saving.',
                      '模型详情展示目录能力；可用性与客户价格可能不同，保存前请逐个查看。',
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={savingPool || poolCandidates.length >= 64}
                  onClick={addCandidate}
                >
                  <IconPlus size={14} />
                  {t('Add candidate', '添加候选模型')}
                </Button>
              </div>
              <div className="space-y-2.5">
                {poolCandidates.map((candidate, index) => (
                  <div
                    key={index}
                    className={`grid gap-2.5 rounded-lg bg-muted/40 p-3 ${advancedPool ? 'sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_auto]' : 'sm:grid-cols-[minmax(0,1fr)_auto]'}`}
                  >
                    <div className="space-y-1">
                      <Label
                        htmlFor={`pool-candidate-model-${index}`}
                        className="text-xs text-muted-foreground"
                      >
                        {t('Model alias', '模型标识')}
                      </Label>
                      <ModelPicker
                        id={`pool-candidate-model-${index}`}
                        value={candidate.alias}
                        models={availableModels}
                        disabled={savingPool}
                        placeholder={t('e.g. gpt-4.1-mini', '例如 gpt-4.1-mini')}
                        onChange={(alias) => updateCandidate(index, { alias })}
                      />
                      {candidate.alias.trim() && (
                        <Link
                          className="text-xs text-muted-foreground underline underline-offset-2"
                          to={`/models/${encodeURIComponent(candidate.alias.trim())}?workspace=${encodeURIComponent(routeWorkspace)}`}
                        >
                          {t('Inspect model details', '查看模型详情')}
                        </Link>
                      )}
                    </div>
                    <div className={advancedPool ? 'space-y-1' : 'hidden'}>
                      <Label
                        htmlFor={`pool-candidate-priority-${index}`}
                        className="text-xs text-muted-foreground"
                      >
                        {t('Priority', '优先级')}
                      </Label>
                      <Input
                        id={`pool-candidate-priority-${index}`}
                        type="number"
                        min={-1000}
                        max={1000}
                        required
                        disabled={savingPool}
                        value={candidate.priority}
                        onChange={(event) =>
                          updateCandidate(index, { priority: event.target.value })
                        }
                      />
                    </div>
                    <div className={advancedPool ? 'space-y-1' : 'hidden'}>
                      <Label
                        htmlFor={`pool-candidate-weight-${index}`}
                        className="text-xs text-muted-foreground"
                      >
                        {t('Weight', '权重')}
                      </Label>
                      <Input
                        id={`pool-candidate-weight-${index}`}
                        type="number"
                        min={1}
                        max={10000}
                        required
                        disabled={savingPool}
                        value={candidate.weight}
                        onChange={(event) =>
                          updateCandidate(index, { weight: event.target.value })
                        }
                      />
                    </div>
                    <div className="flex items-end justify-between gap-2 pb-0.5 sm:justify-end">
                      <div className="flex items-center gap-1.5 pb-2">
                        <Checkbox
                          id={`pool-candidate-enabled-${index}`}
                          disabled={savingPool}
                          checked={candidate.enabled}
                          onCheckedChange={(checked) =>
                            updateCandidate(index, {
                              enabled: checked === true,
                            })
                          }
                        />
                        <Label
                          htmlFor={`pool-candidate-enabled-${index}`}
                          className="text-xs font-normal"
                        >
                          {t('Enabled', '启用')}
                        </Label>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={savingPool || poolCandidates.length <= 1}
                        onClick={() => removeCandidate(index)}
                        aria-label={t('Remove candidate', '移除候选模型')}
                      >
                        <IconTrash size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {poolFormError && (
              <Alert variant="destructive">
                <AlertDescription>{uiT(poolFormError)}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={savingPool}
                onClick={() => setPoolDialogOpen(false)}
              >
                {t('Cancel', '取消')}
              </Button>
              <Button type="submit" disabled={savingPool}>
                {savingPool
                  ? t('Saving…', '保存中…')
                  : editingPool
                    ? t('Save changes', '保存更改')
                    : t('Create custom model', '创建自定义模型')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deletePoolTarget)}
        onOpenChange={(open) => {
          if (!open && !deletingPool) {
            setDeletePoolTarget(null);
            setDeletePoolError('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('Delete custom model?', '删除自定义模型？')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'This removes the custom model from the routing list. Its slug and immutable history remain reserved; existing API keys using it will no longer resolve.',
                '该自定义模型将从路由列表中移除。其标识与不可变历史仍会保留；继续使用它的 API 密钥将无法解析。',
              )}
            </DialogDescription>
          </DialogHeader>
          {deletePoolError && (
            <p role="alert" className="text-sm text-destructive">
              {uiT(deletePoolError)}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deletingPool}
              onClick={() => setDeletePoolTarget(null)}
            >
              {t('Cancel', '取消')}
            </Button>
            <Button
              variant="destructive"
              disabled={deletingPool}
              onClick={() => void deletePool()}
            >
              {deletingPool
                ? t('Deleting…', '删除中…')
                : t('Delete custom model', '删除自定义模型')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ReviewPageShell>
  );
}
