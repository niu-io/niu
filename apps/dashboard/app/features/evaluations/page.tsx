import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import {
  IconChevronDown,
  IconEdit,
  IconPlus,
} from '@tabler/icons-react';
import {
  NiuAdminClient,
  type EvaluationComparison,
  type EvaluationDefinition,
  type EvaluationReceipt,
  type EvaluationRunBrief,
} from '@niu-io/sdk';
import ConnectGate from '@/shell/ConnectGate';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
import { useDashboardContext } from '@/shell/dashboard-context';
import { useLocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { formatDurationMs } from '@/lib/duration';
import { fetchQuery, peekQuery } from '@/lib/query-cache';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import { CopyAgentPrompt, agentHandoffPrompt, formatModelAlias, ReviewEmptyState, ReviewPageShell, safeText, stamp } from '../agent-review/shared';
import {
  EvaluationComparisonTable,
  EvaluationMetrics,
  EvaluationSampleCriteriaSection,
} from './EvaluationComponents';
import { EvaluationFormDialog } from './EvaluationFormDialog';

const EVALUATION_LABELS: Record<string, string> = {
  chat_completions: 'Chat Completions',
  responses: 'Responses',
  messages: 'Messages',
  generate_content: 'GenerateContent',
  check: 'Check',
  matched: 'Matched',
  mismatched: 'Mismatched',
  unverified: 'Unverified',
  accepted: 'Accepted',
  rejected: 'Rejected',
  inconclusive: 'Inconclusive',
};

function formatEvalToken(value: string): string {
  return EVALUATION_LABELS[value] ?? value;
}

export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ workspace, url, params }) => {
    if (!workspace || params.slug) {
      return { endpoint: null };
    }
    const after = url.searchParams.get('after') ?? undefined;
    return {
      endpoint: `/api/v1/workspaces/${encodeURIComponent(workspace.id)}/evaluations${
        after ? `?after=${encodeURIComponent(after)}` : ''
      }`,
      fetcher: async (signal, snapshot) => {
        const client = new NiuAdminClient({
          adminToken: snapshot.token,
          baseURL: new URL('/api/v1', url.origin).href,
        });
        return await client.listWorkspaceReviewEvaluations(
          workspace.id,
          after,
          { signal },
        );
      },
    };
  });
}

export const shouldRevalidate = routeShouldRevalidate;

export default function EvaluationsPage() {
  const { t: uiT } = useUILocale();
  useOptionalRouteLoaderData();
  const context = useDashboardContext();
  const params = useParams();
  return (
    <ConnectGate>
      {() =>
        context.workspace ? (
          <EvaluationsView
            key={[
              context.token,
              context.workspace.id,
              params.slug,
              params.run,
            ].join(':')}
            token={context.token}
            workspace={context.workspace.id}
            routeWorkspace={params.workspace ?? 'default'}
            slug={params.slug}
            run={params.run}
            canWrite={context.session?.permissions?.write !== false}
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

type Detail = {
  definition?: EvaluationDefinition;
  runs?: EvaluationRunBrief[];
  run?: EvaluationReceipt;
};
type CachedListPage = {
  data: EvaluationDefinition[];
  next_after?: string | null;
};
type CachedDetailBundle = {
  detail: Detail;
  next: string | null;
};

function EvaluationsView({
  token,
  workspace,
  routeWorkspace,
  slug,
  run,
  canWrite,
}: {
  token: string;
  workspace: string;
  routeWorkspace: string;
  slug?: string;
  run?: string;
  canWrite: boolean;
}) {
  const { t } = useLocale();
  const { t: uiT, format: uiF } = useUILocale();
  const navigate = useNavigate();
  const client = useMemo(
    () =>
      new NiuAdminClient({
        adminToken: token,
        baseURL: new URL('/api/v1', window.location.origin).href,
      }),
    [token],
  );
  const base = `/workspaces/${encodeURIComponent(routeWorkspace)}/evaluations`;
  const [query, setQuery] = useSearchParams();
  const after = query.get('after') ?? undefined;
  const cacheScope = token || 'public';
  const listCacheKey = `/api/v1/workspaces/${encodeURIComponent(workspace)}/evaluations${
    after ? `?after=${encodeURIComponent(after)}` : ''
  }`;
  const detailCacheKey = `review:detail:${workspace}:evaluations:${
    slug ?? ''
  }:${run ?? ''}:${after ?? ''}:`;
  const initialListCached = !slug
    ? peekQuery<CachedListPage>(cacheScope, listCacheKey)
    : undefined;
  const initialDetailCached = slug
    ? peekQuery<CachedDetailBundle>(cacheScope, detailCacheKey)
    : undefined;
  const [rows, setRows] = useState<EvaluationDefinition[]>(
    () => initialListCached?.data ?? [],
  );
  const [detail, setDetail] = useState<Detail>(
    () => initialDetailCached?.detail ?? {},
  );
  const [next, setNext] = useState<string | null>(
    () =>
      (slug ? initialDetailCached?.next : initialListCached?.next_after) ?? null,
  );
  const [loading, setLoading] = useState(() =>
    slug ? !initialDetailCached : !initialListCached,
  );
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const lastRefresh = useRef(0);
  const baseline = query.get('baseline') ?? '';
  const comparisonRequest = useRef<AbortController | null>(null);
  const [comparison, setComparison] = useState<EvaluationComparison | null>(
    null,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const pagingRequest = useRef(false);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    comparisonRequest.current?.abort();
    setComparison(null);
    setComparing(false);
    return () => comparisonRequest.current?.abort();
  }, [baseline, refresh]);

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
          async (signal) =>
            await client.listWorkspaceReviewEvaluations(workspace, after, {
              signal,
            }),
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
        setNext(cachedDetail.next);
        setLoading(false);
      } else {
        setDetail({});
        setNext(null);
        setLoading(true);
      }

      const bundle = await fetchQuery<CachedDetailBundle>(
        cacheScope,
        detailCacheKey,
        async (signal) => {
          const reqOpts = { signal };
          const [definition, runs, receipt] = await Promise.all([
            client.getWorkspaceReviewEvaluation(
              workspace,
              slug,
              undefined,
              reqOpts,
            ),
            client.listWorkspaceReviewEvaluationRuns(
              workspace,
              slug,
              after,
              reqOpts,
            ),
            run
              ? client.getWorkspaceReviewEvaluationRun(
                  workspace,
                  slug,
                  run,
                  reqOpts,
                )
              : Promise.resolve(undefined),
          ]);
          return {
            detail: { definition, runs: runs.data, run: receipt },
            next: runs.next_after,
          };
        },
        { signal: controller.signal, force, awaitRevalidate: true },
      );
      if (!controller.signal.aborted) {
        setDetail(bundle.detail);
        setNext(bundle.next);
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
    run,
    after,
    refresh,
  ]);

  const title = t('Evaluations', '评估');
  const name = detail.run?.name ?? detail.definition?.name;
  const revision = detail.definition?.revision;
  const allowedTabs = run
    ? ['results', 'criteria', 'comparison']
    : ['runs', 'criteria'];
  const requestedTab = query.get('tab');
  const tab =
    requestedTab && allowedTabs.includes(requestedTab)
      ? requestedTab
      : allowedTabs[0];

  async function compare() {
    if (!slug || !run || !baseline) return;
    comparisonRequest.current?.abort();
    const controller = new AbortController();
    comparisonRequest.current = controller;
    setComparing(true);
    setError('');
    try {
      const result = await client.compareWorkspaceReviewEvaluationRuns(
        workspace,
        slug,
        baseline,
        run,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setComparison(result);
    } catch {
      if (!controller.signal.aborted)
        setError(
          'Could not compare these runs. Retry after checking their availability.',
        );
    } finally {
      if (!controller.signal.aborted) setComparing(false);
    }
  }

  async function loadMoreRuns() {
    if (!slug || !next || pagingRequest.current) return;
    pagingRequest.current = true;
    setLoadingMore(true);
    try {
      const result = await client.listWorkspaceReviewEvaluationRuns(
        workspace,
        slug,
        next,
      );
      setDetail((previous) => ({
        ...previous,
        runs: [...(previous.runs ?? []), ...result.data],
      }));
      setNext(result.next_after);
    } catch {
      setError('Could not load more baseline runs.');
    } finally {
      pagingRequest.current = false;
      setLoadingMore(false);
    }
  }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDefinition, setEditingDefinition] =
    useState<EvaluationDefinition | null>(null);
  const formTrigger = useRef<HTMLButtonElement | null>(null);

  const description = error
    ? uiT('Return to the list or retry loading this resource.')
    : loading
      ? uiT('Retrieving workspace evidence…')
      : run
        ? uiT(
            'Immutable evidence captured at submission. Judgments are attributed to the evaluator.',
          )
        : slug
          ? uiF(
              'Saved workspace configuration{0}. Your agent can make changes within its delegated authority.',
              [revision ? uiF(' · revision {0}', [revision]) : ''],
            )
          : rows.length ? t(
              'Review task criteria, recorded judgments, latency, and customer charges from agent-run evaluations.',
              '查看 Agent 评估的任务标准、已记录判定、耗时与客户费用。',
            ) : '';

  return (
    <ReviewPageShell
      title={title}
      actions={
        <>
          {!slug && rows.length > 0 && <CopyAgentPrompt prompt={agentHandoffPrompt(routeWorkspace, 'evaluate models against my task criteria within the authorized spending limits; report conclusions, cost, and limitations')} onError={setError} />}
          {!slug && canWrite && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('Manual setup', '手动配置')}
              onClick={(event) => {
                formTrigger.current = event.currentTarget;
                setEditingDefinition(null);
                setDialogOpen(true);
              }}
            >
              <IconPlus size={16} />
              <span className="hidden sm:inline">{t('Manual setup', '手动配置')}</span>
            </Button>
          )}
          {slug && detail.definition && !run && canWrite && (
            <Button
              variant="outline"
              size="sm"
              onClick={(event) => {
                formTrigger.current = event.currentTarget;
                setEditingDefinition(detail.definition!);
                setDialogOpen(true);
              }}
            >
              <IconEdit size={16} />
              {t('Edit evaluation', '编辑评估')}
            </Button>
          )}
        </>
      }
      back={
        slug
          ? {
              to: run ? `${base}/${encodeURIComponent(slug)}` : base,
              label: run ? t('All runs', '所有评估记录') : title,
            }
          : undefined
      }
      heading={
        slug ? (name ? safeText(name) : t('Review', '审阅')) : undefined
      }
      description={description}
      error={error}
      loading={loading}
      onRefresh={() => setRefresh((value) => value + 1)}
      onRetry={() => setRefresh((value) => value + 1)}
    >
      {!slug && (
        <>
          {rows.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiT('Name')}</TableHead>
                    <TableHead>{uiT('Task')}</TableHead>
                    <TableHead>{uiT('Protocol')}</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      {t('Samples', '样本数')}
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
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
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {safeText(row.task)}
                      </TableCell>
                      <TableCell>{uiT(formatEvalToken(row.protocol))}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {row.samples?.length ?? 0}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
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
              title={uiF('No {0} yet', [title.toLowerCase()])}
              description={t(
                'Ask your coding agent to evaluate models against your task criteria within an authorized test budget. Open an evaluation here to review its criteria, sample outcomes, input evidence, and known customer charges.',
                '让编码 Agent 在授权测试预算内，按照任务验收标准评测模型。在此打开评估，查看评估标准、样本结果、输入证据和已知客户费用。',
              )}
              prompt={agentHandoffPrompt(
                routeWorkspace,
                'define a task-specific model evaluation; agree on acceptance criteria and an intended test budget, and rely only on the server spending limits as enforcement',
              )}
              onError={setError}
            />
          )}
        </>
      )}
      {slug && detail.definition && !run && (
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
            <TabsTrigger value="runs">{uiT('Runs')}</TabsTrigger>
            <TabsTrigger value="criteria">{uiT('Criteria')}</TabsTrigger>
          </TabsList>
          <TabsContent value="runs" className="space-y-4">
            {detail.runs?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiT('Run')}</TableHead>
                    <TableHead>{uiT('Evaluator')}</TableHead>
                    <TableHead>{uiT('Accepted')}</TableHead>
                    <TableHead>{uiT('Unknown charges')}</TableHead>
                    <TableHead>{uiT('Captured')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.runs.map((receipt) => (
                    <TableRow key={receipt.slug}>
                      <TableCell>
                        <Link
                          className="font-medium hover:underline"
                          to={`${base}/${encodeURIComponent(slug)}/runs/${encodeURIComponent(receipt.slug)}`}
                        >
                          {safeText(receipt.name)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {safeText(receipt.evaluator.name)} ·{' '}
                        {safeText(receipt.evaluator.version)}
                      </TableCell>
                      <TableCell>
                        {receipt.summary.verdicts.accepted ?? 0} /{' '}
                        {receipt.summary.samples}
                      </TableCell>
                      <TableCell>
                        {receipt.summary.unknown_charge_attempts}{' '}
                        {uiT('attempts')}
                      </TableCell>
                      <TableCell>{stamp(receipt.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <>
                <Empty className="min-h-48"><EmptyHeader><EmptyMedia variant="icon"><IconChevronDown size={20} aria-hidden="true" /></EmptyMedia><EmptyTitle>{uiT('No evaluation runs yet')}</EmptyTitle><EmptyDescription>
                      {uiT(
                        'No evaluation runs yet. Ask your agent to run an evaluation within your intended test budget and server spending limits.',
                      )}
                    </EmptyDescription></EmptyHeader></Empty>
                <EvaluationSampleCriteriaSection
                  definition={detail.definition}
                  routeWorkspace={routeWorkspace}
                  onError={setError}
                />
              </>
            )}
            {next && (
              <Button variant="outline" onClick={() => setQuery({ after: next })}>
                {uiT('Next page')}
              </Button>
            )}
            {after && (
              <Button variant="outline" onClick={() => setQuery({})}>
                {uiT('First page')}
              </Button>
            )}
          </TabsContent>
          <TabsContent value="criteria" className="space-y-5 py-5">
            <div>
              <h2 className="font-medium">{uiT('Task')}</h2>
              <p className="mt-2 whitespace-pre-wrap">
                {safeText(detail.definition.task)}
              </p>
            </div>
            <div>
              <h2 className="font-medium">{uiT('Acceptance rubric')}</h2>
              <p className="mt-2 whitespace-pre-wrap">
                {safeText(detail.definition.rubric)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {uiT(formatEvalToken(detail.definition.protocol))} · {detail.definition.samples.length}{' '}
              {uiT('named samples · revision')} {detail.definition.revision}
              {uiT('. Runs retain their pinned definition.')}
            </p>
            <EvaluationSampleCriteriaSection
              definition={detail.definition}
              routeWorkspace={routeWorkspace}
              onError={setError}
            />
          </TabsContent>
        </Tabs>
      )}
      {detail.run && (
        <>
          <p className="text-sm text-muted-foreground">
            {safeText(detail.run.evaluator.name)} ·{' '}
            {safeText(detail.run.evaluator.version)} ·{' '}
            {uiT(detail.run.evaluator.kind)} {uiT('judgment · captured')}{' '}
            {stamp(detail.run.capture.finished_at)}{' '}
            {uiT('· definition revision')} {detail.run.evaluation_revision}
          </p>
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
              <TabsTrigger value="results">{uiT('Results')}</TabsTrigger>
              <TabsTrigger value="criteria">{uiT('Criteria')}</TabsTrigger>
              <TabsTrigger value="comparison">
                {uiT('Comparison')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="criteria" className="space-y-5 py-5">
              <div>
                <h2 className="font-medium">{uiT('Pinned task')}</h2>
                <p className="mt-2 whitespace-pre-wrap">
                  {safeText(detail.run.definition.task)}
                </p>
              </div>
              <div>
                <h2 className="font-medium">
                  {uiT('Pinned acceptance rubric')}
                </h2>
                <p className="mt-2 whitespace-pre-wrap">
                  {safeText(detail.run.definition.rubric)}
                </p>
              </div>
            </TabsContent>
            <TabsContent value="results" className="space-y-5">
              <EvaluationMetrics summary={detail.run.summary} />
              <h2 className="font-medium">{uiT('Sample results')}</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiT('Sample')}</TableHead>
                    <TableHead>{uiT('Input')}</TableHead>
                    <TableHead>{uiT('Judgment')}</TableHead>
                    <TableHead>{uiT('Evaluated model')}</TableHead>
                    <TableHead>{uiT('Duration')}</TableHead>
                    <TableHead>{uiT('Reason')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.run.results.map((result) => (
                    <TableRow key={result.sample}>
                      <TableCell>{safeText(result.sample)}</TableCell>
                      <TableCell>{uiT(formatEvalToken(result.input_match))}</TableCell>
                      <TableCell>{uiT(formatEvalToken(result.judgment.verdict))}</TableCell>
                      <TableCell>
                        {formatModelAlias(result.attempts.find(attempt => attempt.attempt_id === result.evaluated_attempt_id)?.model ?? 'Unavailable')}
                        {(result.pool_selections ?? [])
                          .filter(
                            (policy) =>
                              safeText(policy.slug) === policy.slug &&
                              /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(policy.slug) &&
                              Number.isSafeInteger(policy.revision) &&
                              policy.revision > 0 &&
                              policy.revision < Number.MAX_SAFE_INTEGER,
                          )
                          .map((policy) => (
                            <Link
                              key={`${policy.slug}:${policy.revision}`}
                              className="mt-1 block max-w-64 whitespace-normal break-words text-sm text-muted-foreground hover:underline"
                              to={`/workspaces/${encodeURIComponent(routeWorkspace)}/routing/${encodeURIComponent(policy.slug)}?tab=history&revision=${policy.revision}`}
                            >
                              {uiT('Policy')} {policy.slug}{' '}
                              {uiT('· revision')} {policy.revision}
                            </Link>
                          ))}
                      </TableCell>
                      <TableCell>
                        {result.duration_ms === null
                          ? uiT('Unavailable')
                          : formatDurationMs(result.duration_ms)}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {safeText(
                          result.judgment.reason ?? 'No reason supplied',
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-sm text-muted-foreground">
                {uiT(
                  'Duration is the evaluated attempt only. Charge totals include all attempts in submitted operations. Unknown and owner-funded charges are not zero.',
                )}
              </p>
            </TabsContent>
            <TabsContent value="comparison">
              <div className="space-y-3 pt-5">
                <h2 className="font-medium">
                  {uiT('Compare with a baseline')}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        {safeText(
                          detail.runs?.find((item) => item.slug === baseline)
                            ?.name ?? 'Choose baseline',
                        )}
                        <IconChevronDown size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuRadioGroup
                        value={baseline}
                        onValueChange={(value) => {
                          setQuery((previous) => {
                            const nextQuery = new URLSearchParams(previous);
                            nextQuery.set('baseline', value);
                            return nextQuery;
                          });
                          setComparison(null);
                        }}
                      >
                        {detail.runs
                          ?.filter((item) => item.slug !== run)
                          .map((item) => (
                            <DropdownMenuRadioItem
                              value={item.slug}
                              key={item.slug}
                            >
                              {safeText(item.name)}
                            </DropdownMenuRadioItem>
                          ))}
                      </DropdownMenuRadioGroup>
                      {next && (
                        <DropdownMenuItem
                          disabled={loadingMore}
                          onSelect={(event) => {
                            event.preventDefault();
                            void loadMoreRuns();
                          }}
                        >
                          {uiT('Load more runs')}
                        </DropdownMenuItem>
                      )}
                      {!detail.runs?.some((item) => item.slug !== run) && (
                        <p className="px-3 py-2 text-sm text-muted-foreground">
                          {uiT('No other runs available')}
                        </p>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="secondary"
                    disabled={!baseline || comparing}
                    onClick={() => void compare()}
                  >
                    {comparing
                      ? uiT('Comparing…')
                      : uiT('Compare matched samples')}
                  </Button>
                </div>
                {comparison && (
                  <div aria-live="polite" className="space-y-3">
                    <p>
                      {comparison.matched_verified_samples}{' '}
                      {uiT('verified matched samples ·')}{' '}
                      {comparison.left_unmatched_samples}{' '}
                      {uiT('baseline unmatched ·')}{' '}
                      {comparison.right_unmatched_samples}{' '}
                      {uiT('current unmatched')}
                    </p>
                    {!comparison.quality_comparable && (
                      <Alert>
                        <AlertDescription>
                          {uiT(
                            'Quality judgments are not directly comparable: check task, protocol, rubric, evaluator version and verified sample coverage.',
                          )}
                        </AlertDescription>
                      </Alert>
                    )}
                    {comparison.shared_operations > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {comparison.shared_operations}{' '}
                        {uiT(
                          'shared operations. These are repeated judgments of the same execution, not independent trials.',
                        )}
                      </p>
                    )}
                    <EvaluationComparisonTable comparison={comparison} />
                    <p className="text-sm text-muted-foreground">
                      {uiT(
                        'All submitted operation attempts are included. Unknown charges stay unknown; no winner is inferred.',
                      )}
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
      <EvaluationFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCloseAutoFocus={(event) => {
          if (formTrigger.current?.isConnected) {
            event.preventDefault();
            formTrigger.current.focus();
          }
        }}
        editingDefinition={editingDefinition}
        cacheScope={cacheScope}
        workspace={workspace}
        client={client}
        onSaved={(saved) => {
          setRefresh((value) => value + 1);
          if (!slug) {
            void navigate(`${base}/${encodeURIComponent(saved.slug)}`);
          } else {
            setDetail((previous) => ({ ...previous, definition: saved }));
          }
        }}
      />
    </ReviewPageShell>
  );
}
