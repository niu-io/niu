import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import {
  IconChevronDown,
} from '@tabler/icons-react';
import {
  NiuAdminClient,
  type EvaluationComparison,
  type EvaluationDefinition,
  type EvaluationReceipt,
  type EvaluationRunBrief,
  type EvaluationSummary,
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
import { useLocale, translateUI } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { formatFinancialMoney } from '@/lib/money';
import { fetchQuery, peekQuery } from '@/lib/query-cache';
import {
  loadCriticalRouteEndpoint,
  routeShouldRevalidate,
  useOptionalRouteLoaderData,
} from '@/lib/route-data';
import {
  agentHandoffPrompt,
  ReviewEmptyState,
  ReviewPageShell,
  safeText,
  stamp,
} from '../agent-review/shared';

function charge(dimension: string, amount: string) {
  const money = /^money:([A-Z]{3}):nanos$/.exec(dimension);
  if (money) return `${money[1]} ${formatFinancialMoney(amount, money[1])}`;
  const unit = /^unit:[^:]+:(.*):atoms$/.exec(dimension);
  if (unit) {
    const n = BigInt(amount);
    const whole = n / 1000000000n;
    const fraction = (n % 1000000000n)
      .toString()
      .replace('-', '')
      .padStart(9, '0')
      .replace(/0+$/, '');
    return `${n < 0n && whole === 0n ? '-' : ''}${whole}${fraction ? '.' + fraction : ''} ${safeText(unit[1])}`;
  }
  return translateUI('Unavailable');
}

function EvaluationMetrics({ summary }: { summary: EvaluationSummary }) {
  const { t: uiT, format: uiF } = useUILocale();
  return (
    <div className="grid gap-5 border-b py-5 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <p className="text-sm text-muted-foreground">
          {uiT('Accepted samples')}
        </p>
        <p className="mt-1 text-xl font-medium tabular-nums">
          {summary.verdicts.accepted ?? 0} / {summary.samples}
        </p>
        <p className="text-sm text-muted-foreground">
          {summary.verdicts.rejected ?? 0} {uiT('rejected ·')}{' '}
          {summary.verdicts.unknown ?? 0} {uiT('unknown')}
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">
          {uiT('Input evidence')}
        </p>
        <p className="mt-1 text-xl font-medium">
          {summary.verified_inputs} {uiT('verified')}
        </p>
        <p className="text-sm text-muted-foreground">
          {summary.unverified_inputs} {uiT('unverified')}
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">
          {uiT('Known customer charges')}
        </p>
        <p className="mt-1 font-medium">
          {summary.customer_charge_totals.length
            ? summary.customer_charge_totals
                .map((row) => charge(row.dimension, row.amount))
                .join(' + ')
            : uiT('Unavailable')}
        </p>
        <p className="text-sm text-muted-foreground">
          {summary.unknown_charge_attempts} {uiT('of')} {summary.attempts}{' '}
          {uiT('attempts have unknown charges')}
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">
          {uiT('Cost per accepted sample')}
        </p>
        <p className="mt-1 font-medium">
          {summary.cost_per_accepted
            ? uiF('{0} / {1} accepted', [
                charge(
                  summary.cost_per_accepted.dimension,
                  summary.cost_per_accepted.numerator,
                ),
                summary.cost_per_accepted.denominator,
              ])
            : uiT('Insufficient comparable charge evidence')}
        </p>
      </div>
    </div>
  );
}

function EvaluationComparisonTable({
  comparison,
}: {
  comparison: EvaluationComparison;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const values: Array<[string, (summary: EvaluationSummary) => string]> = [
    [
      'Accepted samples',
      (summary) => `${summary.verdicts.accepted ?? 0} / ${summary.samples}`,
    ],
    [
      'Rejected / unknown judgments',
      (summary) =>
        `${summary.verdicts.rejected ?? 0} / ${summary.verdicts.unknown ?? 0}`,
    ],
    [
      'Verified / unverified inputs',
      (summary) => `${summary.verified_inputs} / ${summary.unverified_inputs}`,
    ],
    [
      'Known customer charges',
      (summary) =>
        summary.customer_charge_totals
          .map((row) => charge(row.dimension, row.amount))
          .join(' + ') || uiT('Unavailable'),
    ],
    [
      'Unknown-charge attempts',
      (summary) => `${summary.unknown_charge_attempts} / ${summary.attempts}`,
    ],
    [
      'Cost per accepted sample',
      (summary) =>
        summary.cost_per_accepted
          ? uiF('{0} / {1} accepted', [
              charge(
                summary.cost_per_accepted.dimension,
                summary.cost_per_accepted.numerator,
              ),
              summary.cost_per_accepted.denominator,
            ])
          : uiT('Insufficient charge evidence'),
    ],
  ];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/3 whitespace-normal">
            {uiT('Metric')}
          </TableHead>
          <TableHead className="w-1/3 whitespace-normal">
            {uiT('Baseline')}
          </TableHead>
          <TableHead className="w-1/3 whitespace-normal">
            {uiT('Current run')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {values.map(([label, value]) => (
          <TableRow key={label}>
            <TableCell className="whitespace-normal align-top font-medium">
              {uiT(label)}
            </TableCell>
            <TableCell className="whitespace-normal align-top">
              {value(comparison.left_summary)}
            </TableCell>
            <TableCell className="whitespace-normal align-top">
              {value(comparison.right_summary)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
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
}: {
  token: string;
  workspace: string;
  routeWorkspace: string;
  slug?: string;
  run?: string;
}) {
  const { t } = useLocale();
  const { t: uiT, format: uiF } = useUILocale();
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
          : rows.length ? uiT('Review task acceptance, performance and customer charges against a baseline.') : '';

  return (
    <ReviewPageShell
      title={title}
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
      {!slug &&
        (rows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{uiT('Name')}</TableHead>
                  <TableHead>{uiT('Task')}</TableHead>
                  <TableHead>{uiT('Protocol')}</TableHead>
                  <TableHead>{uiT('Revision')}</TableHead>
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
                    <TableCell>{row.protocol}</TableCell>
                    <TableCell>{row.revision}</TableCell>
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
            description={`${uiT('Ask your coding agent to')} ${uiT('evaluate models against your task criteria and intended test budget')}.`}
            prompt={agentHandoffPrompt(
              routeWorkspace,
              'define a task-specific model evaluation; agree on acceptance criteria and an intended test budget, and rely only on the server spending limits as enforcement',
            )}
            onError={setError}
          />
        ))}
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
          <TabsContent value="runs">
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
                {detail.runs?.map((receipt) => (
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
            {!detail.runs?.length && (
              <Empty className="min-h-60"><EmptyHeader><EmptyMedia variant="icon"><IconChevronDown size={20} aria-hidden="true" /></EmptyMedia><EmptyTitle>{uiT('No evaluation runs yet')}</EmptyTitle><EmptyDescription>
                    {uiT(
                      'No evaluation runs yet. Ask your agent to run an evaluation within your intended test budget and server spending limits.',
                    )}
                  </EmptyDescription></EmptyHeader></Empty>
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
              {uiT(detail.definition.protocol)} · {detail.definition.samples.length}{' '}
              {uiT('named samples · revision')} {detail.definition.revision}
              {uiT('. Runs retain their pinned definition.')}
            </p>
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
                      <TableCell>{uiT(result.input_match)}</TableCell>
                      <TableCell>{uiT(result.judgment.verdict)}</TableCell>
                      <TableCell>
                        {safeText(
                          result.attempts.find(
                            (attempt) =>
                              attempt.attempt_id ===
                              result.evaluated_attempt_id,
                          )?.model ?? 'Unavailable',
                        )}
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
                          : uiF('{0} ms', [result.duration_ms])}
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
    </ReviewPageShell>
  );
}
