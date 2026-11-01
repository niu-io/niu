import { readLocale as readUILocale } from '@/shell/ui-locale';
import { translateUI, useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams, type LoaderFunctionArgs } from "react-router";
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from "@/lib/route-data";
import {
  IconArrowLeft,
  IconChevronDown,
  IconRefresh,
} from "@tabler/icons-react";
import {
  NiuAdminClient,
  type EvaluationComparison,
  type EvaluationDefinition,
  type EvaluationReceipt,
  type EvaluationRunBrief,
  type EvaluationSummary,
  type EventDelivery,
  type EventSubscription,
  type WorkspaceModelPool,
  type WorkspacePoolSelection,
} from "@niu-io/sdk";
import ConnectGate from "@/shell/ConnectGate";
import PageHeader from "@/components/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardContext } from "@/shell/dashboard-context";
import { useLocale } from "@/shell/ui-locale";
import { formatFinancialMoney } from "@/lib/money";
import { fetchQuery, peekQuery } from "@/lib/query-cache";

type Kind = "pools" | "evaluations" | "events";
type Resource = WorkspaceModelPool | EvaluationDefinition | EventSubscription;
type Detail = {
  pool?: WorkspaceModelPool;
  definition?: EvaluationDefinition;
  subscription?: {
    data: EventSubscription;
    processed_cursor: string;
    authorization_active: boolean;
  };
  history?: WorkspaceModelPool[];
  selections?: WorkspacePoolSelection[];
  deliveries?: EventDelivery[];
  runs?: EvaluationRunBrief[];
  run?: EvaluationReceipt;
};
const ruleDescription = (
  conditions: NonNullable<WorkspaceModelPool["rules"]>[number]["conditions"],
) =>
  Object.entries(conditions)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => {
      const labels: Record<string, string> = {
        protocol: "Protocol",
        streaming: "Streaming",
        tools: "Tools",
        structured_output: "Structured output",
        vision: "Images",
        reasoning: "Reasoning",
        min_input_tokens: "Minimum input tokens",
        max_input_tokens: "Maximum input tokens",
        min_output_tokens: "Minimum output tokens",
        max_output_tokens: "Maximum output tokens",
      };
      return `${translateUI(labels[key] ?? "Condition")}: ${typeof value === "boolean" ? translateUI(value ? "required" : "not requested") : value}`;
    })
    .join(" · ") || translateUI("All requests");
const eventLabel = (value: string) =>
  value === "pool.changed"
    ? "Model pool changed"
    : value === "evaluation.recorded"
      ? "Evaluation recorded"
      : "Unknown event";
const deliveryLabel: Record<string, string> = {
  pending: "Pending",
  sending: "Sending",
  delivered: "Acknowledged",
  failed: "Failed",
  cancelled: "Cancelled",
};
const failureLabel: Record<string, string> = {
  http: "HTTP error",
  transport: "Connection failed",
  destination: "Destination rejected",
  signature: "Signing failed",
  authority: "Authority unavailable",
  superseded: "Configuration changed",
  exhausted: "Retries exhausted",
};
const stamp = (value: string) => new Date(value).toLocaleString(readUILocale());
const safeText = (value: string) =>
  value.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    "[internal reference]",
  );
function charge(dimension: string, amount: string) {
  const money = /^money:([A-Z]{3}):nanos$/.exec(dimension);
  if (money) return `${money[1]} ${formatFinancialMoney(amount, money[1])}`;
  const unit = /^unit:[^:]+:(.*):atoms$/.exec(dimension);
  if (unit) {
    const n = BigInt(amount);
    const whole = n / 1000000000n;
    const fraction = (n % 1000000000n)
      .toString()
      .replace("-", "")
      .padStart(9, "0")
      .replace(/0+$/, "");
    return `${n < 0n && whole === 0n ? "-" : ""}${whole}${fraction ? "." + fraction : ""} ${safeText(unit[1])}`;
  }
  return translateUI("Unavailable");
}
function EvaluationMetrics({ summary }: { summary: EvaluationSummary }) {
  const { t: uiT, format: uiF } = useUILocale();
  return (
    <div className="grid gap-5 border-b py-5 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <p className="text-sm text-muted-foreground">{uiT("Accepted samples")}</p>
        <p className="mt-1 text-xl font-medium tabular-nums">
          {summary.verdicts.accepted ?? 0} / {summary.samples}
        </p>
        <p className="text-sm text-muted-foreground">
          {summary.verdicts.rejected ?? 0}{" "}{uiT("rejected ·")}{" "}
          {summary.verdicts.unknown ?? 0}{" "}{uiT("unknown")}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{uiT("Input evidence")}</p>
        <p className="mt-1 text-xl font-medium">
          {summary.verified_inputs}{" "}{uiT("verified")}</p>
        <p className="text-sm text-muted-foreground">
          {summary.unverified_inputs}{" "}{uiT("unverified")}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{uiT("Known customer charges")}</p>
        <p className="mt-1 font-medium">
          {summary.customer_charge_totals.length
            ? summary.customer_charge_totals
                .map((row) => charge(row.dimension, row.amount))
                .join(" + ")
            : uiT("Unavailable")}
        </p>
        <p className="text-sm text-muted-foreground">
          {summary.unknown_charge_attempts}{" "}{uiT("of")}{" "}{summary.attempts}{" "}{uiT("attempts have unknown charges")}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">
          {uiT("Cost per accepted sample")}</p>
        <p className="mt-1 font-medium">
          {summary.cost_per_accepted
            ? uiF("{0} / {1} accepted", [charge(summary.cost_per_accepted.dimension, summary.cost_per_accepted.numerator), summary.cost_per_accepted.denominator])
            : uiT("Insufficient comparable charge evidence")}
        </p>
      </div>
    </div>
  );
}
function PoolPolicyView({ pool }: { pool: WorkspaceModelPool }) {
  const { t: uiT } = useUILocale();
  return (
    <div className="min-w-0 space-y-5">
      <div className="grid gap-5 border-b py-5 sm:grid-cols-2">
        <div>
          <h2 className="font-medium">{safeText(pool.name)}</h2>
          <p className="mt-2 text-sm">
            {safeText(pool.description) || uiT("No description supplied.")}
          </p>
        </div>
        <div>
          <p className="text-sm">
            {pool.enabled ? uiT("Enabled") : uiT("Disabled")}{" "}{uiT("· Default:")}{" "}
            {pool.default_action === "reject"
              ? uiT("Reject unmatched requests")
              : uiT("Use candidate models")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {uiT("Saved configuration does not prove live model access or task quality.")}</p>
        </div>
      </div>
      <h2 className="font-medium">{uiT("Candidate models")}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{uiT("Model")}</TableHead>
            <TableHead>{uiT("State")}</TableHead>
            <TableHead>{uiT("Priority")}</TableHead>
            <TableHead>{uiT("Weight")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pool.candidates.map((model) => (
            <TableRow key={model.alias}>
              <TableCell>{safeText(model.alias)}</TableCell>
              <TableCell>{model.enabled ? uiT("Enabled") : uiT("Disabled")}</TableCell>
              <TableCell>{model.priority}</TableCell>
              <TableCell>{model.weight}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {Boolean(pool.rules?.length) && (
        <>
          <h2 className="font-medium">{uiT("Routing rules")}</h2>
          {pool.rules?.map((rule) => (
            <div key={rule.id} className="border-b py-3">
              <p>
                {safeText(rule.name ?? "Rule")} ·{" "}
                {rule.enabled ? uiT("Enabled") : uiT("Disabled")}
              </p>
              <p className="text-sm text-muted-foreground">
                {ruleDescription(rule.conditions)}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiT("Model")}</TableHead>
                    <TableHead>{uiT("State")}</TableHead>
                    <TableHead>{uiT("Priority")}</TableHead>
                    <TableHead>{uiT("Weight")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rule.candidates.map((candidate) => (
                    <TableRow key={candidate.alias}>
                      <TableCell>{safeText(candidate.alias)}</TableCell>
                      <TableCell>
                        {candidate.enabled ? uiT("Enabled") : uiT("Disabled")}
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
        {uiT("Higher-priority candidates are considered first; weights balance equally ranked candidates. Rules are considered in saved order.")}</p>
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
      "Accepted samples",
      (summary) => `${summary.verdicts.accepted ?? 0} / ${summary.samples}`,
    ],
    [
      "Rejected / unknown judgments",
      (summary) =>
        `${summary.verdicts.rejected ?? 0} / ${summary.verdicts.unknown ?? 0}`,
    ],
    [
      "Verified / unverified inputs",
      (summary) => `${summary.verified_inputs} / ${summary.unverified_inputs}`,
    ],
    [
      "Known customer charges",
      (summary) =>
        summary.customer_charge_totals
          .map((row) => charge(row.dimension, row.amount))
          .join(" + ") || uiT("Unavailable"),
    ],
    [
      "Unknown-charge attempts",
      (summary) => `${summary.unknown_charge_attempts} / ${summary.attempts}`,
    ],
    [
      "Cost per accepted sample",
      (summary) =>
        summary.cost_per_accepted
          ? uiF("{0} / {1} accepted", [charge(summary.cost_per_accepted.dimension, summary.cost_per_accepted.numerator), summary.cost_per_accepted.denominator])
          : uiT("Insufficient charge evidence"),
    ],
  ];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/3 whitespace-normal">{uiT("Metric")}</TableHead>
          <TableHead className="w-1/3 whitespace-normal">{uiT("Baseline")}</TableHead>
          <TableHead className="w-1/3 whitespace-normal">{uiT("Current run")}</TableHead>
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
export function loader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ workspace, url, params }) => {
    if (!workspace || params.slug) {
      return { endpoint: null };
    }
    const kind = (url.pathname.match(/\/(pools|evaluations|events)(?:\/|$)/)?.[1] ?? "pools") as Kind;
    const after = url.searchParams.get("after") ?? undefined;
    const endpoint = `/api/v1/workspaces/${encodeURIComponent(workspace.id)}/${kind}${
      after && kind !== "events" ? `?after=${encodeURIComponent(after)}` : ""
    }`;
    return {
      endpoint,
      fetcher: async (signal, snapshot) => {
        const client = new NiuAdminClient({
          adminToken: snapshot.token,
          baseURL: new URL("/api/v1", url.origin).href,
        });
        if (kind === "pools") {
          return await client.listWorkspaceReviewPools(workspace.id, after, { signal });
        }
        if (kind === "evaluations") {
          return await client.listWorkspaceReviewEvaluations(workspace.id, after, { signal });
        }
        const subs = await client.listWorkspaceReviewSubscriptions(workspace.id, { signal });
        return { data: subs.data, next_after: null };
      },
    };
  });
}

export const shouldRevalidate = routeShouldRevalidate;

export default function AgentReviewPage() {
  const { t: uiT } = useUILocale();
  useOptionalRouteLoaderData();
  const context = useDashboardContext();
  const params = useParams();
  const location = useLocation();
  const kind = (location.pathname.match(
    /\/(pools|evaluations|events)(?:\/|$)/,
  )?.[1] ?? "pools") as Kind;
  return (
    <ConnectGate>
      {() =>
        context.workspace ? (
          <Review
            key={[
              context.token,
              context.workspace.id,
              kind,
              params.slug,
              params.run,
            ].join(":")}
            token={context.token}
            workspace={context.workspace.id}
            routeWorkspace={params.workspace ?? "default"}
            kind={kind}
            slug={params.slug}
            run={params.run}
          />
        ) : (
          <p role="status">
            {uiT("Choose a workspace to review its model management.")}</p>
        )
      }
    </ConnectGate>
  );
}
function Review({
  token,
  workspace,
  routeWorkspace,
  kind,
  slug,
  run,
}: {
  token: string;
  workspace: string;
  routeWorkspace: string;
  kind: Kind;
  slug?: string;
  run?: string;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const { t } = useLocale();
  const client = useMemo(
    () =>
      new NiuAdminClient({
        adminToken: token,
        baseURL: new URL("/api/v1", window.location.origin).href,
      }),
    [token],
  );
  const base = `/workspaces/${encodeURIComponent(routeWorkspace)}/${kind}`;
  const [query, setQuery] = useSearchParams();
  const after = query.get("after") ?? undefined;
  const revisionQuery = kind === "pools" ? query.get("revision") : null;
  const revisionNumber = Number(revisionQuery);
  const selectedRevision =
    revisionQuery &&
    /^[1-9][0-9]*$/.test(revisionQuery) &&
    Number.isSafeInteger(revisionNumber) &&
    revisionNumber < Number.MAX_SAFE_INTEGER
      ? revisionNumber
      : undefined;
  const cacheScope = token || "public";
  const listCacheKey = `/api/v1/workspaces/${encodeURIComponent(workspace)}/${kind}${
    after && kind !== "events" ? `?after=${encodeURIComponent(after)}` : ""
  }`;
  const detailCacheKey = `review:detail:${workspace}:${kind}:${slug ?? ""}:${run ?? ""}:${after ?? ""}:${selectedRevision ?? ""}`;
  type CachedListPage = { data: Resource[]; next_after?: string | null };
  type CachedDetailBundle = {
    detail: Detail;
    next: string | null;
    historyBefore: number | null;
  };
  const initialListCached = !slug
    ? peekQuery<CachedListPage>(cacheScope, listCacheKey)
    : undefined;
  const initialDetailCached = slug
    ? peekQuery<CachedDetailBundle>(cacheScope, detailCacheKey)
    : undefined;
  const [rows, setRows] = useState<Resource[]>(
    () => initialListCached?.data ?? [],
  );
  const [detail, setDetail] = useState<Detail>(
    () => initialDetailCached?.detail ?? {},
  );
  const [next, setNext] = useState<string | null>(
    () =>
      (slug ? initialDetailCached?.next : initialListCached?.next_after) ??
      null,
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
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const lastRefresh = useRef(0);
  const [copied, setCopied] = useState(false);
  const baseline = query.get("baseline") ?? "";
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
    setError("");
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
            const reqOpts = { signal };
            if (kind === "pools") {
              return await client.listWorkspaceReviewPools(
                workspace,
                after,
                reqOpts,
              );
            }
            if (kind === "evaluations") {
              return await client.listWorkspaceReviewEvaluations(
                workspace,
                after,
                reqOpts,
              );
            }
            const subs = await client.listWorkspaceReviewSubscriptions(
              workspace,
              reqOpts,
            );
            return { data: subs.data, next_after: null };
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
        setNext(cachedDetail.next);
        setHistoryBefore(cachedDetail.historyBefore);
        setLoading(false);
      } else {
        setDetail({});
        setNext(null);
        setHistoryBefore(null);
        setLoading(true);
      }

      const bundle = await fetchQuery<CachedDetailBundle>(
        cacheScope,
        detailCacheKey,
        async (signal) => {
          const reqOpts = { signal };
          if (kind === "pools") {
            const [pool, history, selections] = await Promise.all([
              client.getWorkspaceReviewPool(workspace, slug, reqOpts),
              client.getWorkspaceReviewPoolHistory(
                workspace,
                slug,
                selectedRevision === undefined
                  ? undefined
                  : selectedRevision + 1,
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
              next: null,
              historyBefore: history.next_before,
            };
          }
          if (kind === "events") {
            const [subscription, deliveries] = await Promise.all([
              client.getWorkspaceReviewSubscription(workspace, slug, reqOpts),
              client.getWorkspaceReviewDeliveries(workspace, slug, reqOpts),
            ]);
            return {
              detail: { subscription, deliveries: deliveries.data },
              next: null,
              historyBefore: null,
            };
          }
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
            historyBefore: null,
          };
        },
        { signal: controller.signal, force, awaitRevalidate: true },
      );
      if (!controller.signal.aborted) {
        setDetail(bundle.detail);
        setNext(bundle.next);
        setHistoryBefore(bundle.historyBefore);
      }
    }
    void load()
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error?.status === 403
              ? "Your current membership cannot read this workspace."
              : error?.status === 404
                ? "This resource is unavailable in the current workspace."
                : "Could not load workspace evidence. Check your connection and retry.",
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
    kind,
    slug,
    run,
    after,
    selectedRevision,
    refresh,
  ]);
  const title =
    kind === "pools"
      ? t("Model pools", "模型池")
      : kind === "evaluations"
        ? t("Evaluations", "评估")
        : t("Event subscriptions", "事件订阅");
  const name =
    detail.run?.name ??
    detail.pool?.name ??
    detail.definition?.name ??
    detail.subscription?.data.name;
  const allowedTabs = run
    ? ["results", "criteria", "comparison"]
    : kind === "pools"
      ? ["configuration", "history", "executions"]
      : kind === "events"
        ? ["configuration", "deliveries"]
        : ["runs", "criteria"];
  const requestedTab = query.get("tab");
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
    setError("");
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
          "Could not compare these runs. Retry after checking their availability.",
        );
    } finally {
      if (!controller.signal.aborted) setComparing(false);
    }
  }
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
      setError("Could not load earlier revisions. Retry this page.");
    } finally {
      pagingRequest.current = false;
      setLoadingMore(false);
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
      setError("Could not load more baseline runs.");
    } finally {
      pagingRequest.current = false;
      setLoadingMore(false);
    }
  }
  const revision =
    detail.pool?.revision ??
    detail.definition?.revision ??
    detail.subscription?.data.revision;
  return (
    <section className="min-w-0 space-y-5" aria-label={title}>
      <PageHeader
        title={title}
        action={
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <IconRefresh size={16} />
            {t("Refresh", "刷新")}
          </Button>
        }
      />
      {slug && (
        <Button variant="ghost" size="sm" asChild>
          <Link to={run ? `${base}/${encodeURIComponent(slug)}` : base}>
            <IconArrowLeft size={16} />
            {run ? t("All runs", "所有评估记录") : title}
          </Link>
        </Button>
      )}
      <div>
        <h1 className="text-xl font-semibold break-words">
          {slug ? (name ? safeText(name) : t("Review", "审阅")) : title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {error
            ? uiT("Return to the list or retry loading this resource.")
            : loading
              ? uiT("Retrieving workspace evidence…")
              : slug
                ? run
                  ? uiT("Immutable evidence captured at submission. Judgments are attributed to the evaluator.")
                  : uiF("Saved workspace configuration{0}. Your agent can make changes within its delegated authority.", [revision ? uiF(" · revision {0}", [revision]) : ""])
                : kind === "pools"
                  ? uiT("Review the model policies your agent uses, their revisions and execution evidence.")
                  : kind === "evaluations"
                    ? uiT("Review task acceptance, performance and customer charges against a baseline.")
                    : uiT("Review where workspace notifications go and whether receivers acknowledge them.")}
        </p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}{" "}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefresh((value) => value + 1)}
            >
              {uiT("Retry")}</Button>
          </AlertDescription>
        </Alert>
      )}
      {loading ? (
        <p role="status" className="py-8 text-muted-foreground">
          {uiT("Loading workspace evidence…")}</p>
      ) : (
        !error && (
          <>
            {!slug &&
              (rows.length ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{uiT("Name")}</TableHead>
                        <TableHead>
                          {kind === "evaluations" ? uiT("Task") : uiT("State")}
                        </TableHead>
                        <TableHead>
                          {kind === "pools"
                            ? uiT("Models")
                            : kind === "events"
                              ? uiT("Events")
                              : uiT("Protocol")}
                        </TableHead>
                        <TableHead>{uiT("Revision")}</TableHead>
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
                            {"task" in row ? (
                              safeText(row.task)
                            ) : (
                              <Badge
                                variant={row.enabled ? "secondary" : "outline"}
                              >
                                {row.enabled ? uiT("Enabled") : uiT("Disabled")}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {"candidates" in row
                              ? row.candidates
                                  .filter((model) => model.enabled)
                                  .map((model) => safeText(model.alias))
                                  .join(", ") || uiT("No enabled candidates")
                              : "event_types" in row
                                ? row.event_types.map(value => uiT(eventLabel(value))).join(", ")
                                : row.protocol}
                          </TableCell>
                          <TableCell>{row.revision}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex gap-2">
                    {after && (
                      <Button variant="outline" onClick={() => setQuery({})}>
                        {uiT("First page")}</Button>
                    )}
                    {next && (
                      <Button
                        variant="outline"
                        onClick={() => setQuery({ after: next })}
                      >
                        {uiT("Next page")}</Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-3 py-12 text-center">
                  <h2 className="font-medium">{uiF("No {0} yet", [title.toLowerCase()])}</h2>
                  <p className="text-sm text-muted-foreground">
                    {uiT("Ask your coding agent to")}{" "}
                    {kind === "pools"
                      ? uiT("build a model pool for your task")
                      : kind === "evaluations"
                        ? uiT("evaluate models against your task criteria and approved budget")
                        : uiT("configure an authorized notification receiver")}
                    .
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(
                          `Use Niu to ${kind === "pools" ? "build a model pool for my task" : kind === "evaluations" ? "define a task-specific model evaluation; agree on acceptance criteria and a bounded paid budget before running it" : "configure workspace event notifications to a receiver I authorize"}. Read https://niu.io/docs/agents.md and inspect my current workspace grants first.`,
                        )
                        .then(() => setCopied(true))
                        .catch(() =>
                          setError(
                            "Clipboard unavailable. Read the agent workflow in Docs.",
                          ),
                        );
                    }}
                  >
                    {copied ? uiT("Copied") : uiT("Copy agent prompt")}
                  </Button>
                  <Button variant="link" asChild>
                    <a href="/docs/install.md">{uiT("Connect your agent")}</a>
                  </Button>
                </div>
              ))}
            {slug && detail.pool && (
              <Tabs
                value={tab}
                onValueChange={(value) =>
                  setQuery((previous) => {
                    const next = new URLSearchParams(previous);
                    next.set("tab", value);
                    return next;
                  })
                }
              >
                <TabsList variant="line">
                  <TabsTrigger value="configuration">{uiT("Configuration")}</TabsTrigger>
                  <TabsTrigger value="history">{uiT("History")}</TabsTrigger>
                  <TabsTrigger value="executions">{uiT("Executions")}</TabsTrigger>
                </TabsList>
                <TabsContent value="configuration" className="space-y-5">
                  <PoolPolicyView pool={detail.pool} />{" "}
                </TabsContent>
                <TabsContent value="history">
                  {revisionQuery && (
                    <p
                      role="status"
                      className="py-3 text-sm text-muted-foreground"
                    >
                      {selectedRevision &&
                      detail.history?.some(
                        (policy) => policy.revision === selectedRevision,
                      )
                        ? uiF("Viewing saved revision {0} and earlier. Current workspace revision: {1}.", [selectedRevision, detail.pool.revision])
                        : uiT("The referenced saved revision is unavailable. Review the revisions listed below.")}
                    </p>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{uiT("Revision")}</TableHead>
                        <TableHead>{uiT("State")}</TableHead>
                        <TableHead>{uiT("Models")}</TableHead>
                        <TableHead>{uiT("Review")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.history?.map((policy) => (
                        <TableRow key={policy.revision}>
                          <TableCell>{policy.revision}</TableCell>
                          <TableCell>
                            {policy.enabled ? uiT("Enabled") : uiT("Disabled")}
                          </TableCell>
                          <TableCell>
                            {policy.candidates
                              .map((model) => safeText(model.alias))
                              .join(", ")}
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
                              {uiT("Review revision")}{" "}{policy.revision}
                            </Button>
                          </TableCell>{" "}
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
                        {uiT("Load earlier revisions")}</Button>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {uiT("Immutable revisions. Ask your agent to compare or restore a revision using the current expected revision.")}</p>
                </TabsContent>
                <TabsContent value="executions">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{uiT("Time")}</TableHead>
                        <TableHead>{uiT("Pool revision")}</TableHead>
                        <TableHead>{uiT("Selected model")}</TableHead>
                        <TableHead>{uiT("HTTP response")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.selections?.map((selection, index) => (
                        <TableRow key={index}>
                          <TableCell>{stamp(selection.created_at)}</TableCell>
                          <TableCell>{selection.pool_revision}</TableCell>
                          <TableCell>
                            {safeText(selection.selected_model)}
                          </TableCell>
                          <TableCell>
                            {selection.response_status ?? uiT("Unavailable")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {!detail.selections?.length && (
                    <p className="py-6 text-muted-foreground">
                      {uiT("No recorded selections yet.")}</p>
                  )}
                  <Button variant="link" asChild>
                    <Link
                      to={`/workspaces/${encodeURIComponent(routeWorkspace)}/executions`}
                    >
                      {uiT("Inspect request logs")}</Link>
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    {uiT("Latest 100 selections. An HTTP response does not establish terminal generation or task acceptance.")}</p>
                </TabsContent>
              </Tabs>
            )}
            {slug && detail.subscription && (
              <Tabs
                value={tab}
                onValueChange={(value) =>
                  setQuery((previous) => {
                    const next = new URLSearchParams(previous);
                    next.set("tab", value);
                    return next;
                  })
                }
              >
                <TabsList variant="line">
                  <TabsTrigger value="configuration">{uiT("Configuration")}</TabsTrigger>
                  <TabsTrigger value="deliveries">{uiT("Deliveries")}</TabsTrigger>
                </TabsList>
                <TabsContent value="configuration">
                  <dl className="grid gap-5 py-5 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm text-muted-foreground">
                        {uiT("Destination")}</dt>
                      <dd className="mt-1 break-all">
                        {safeText(detail.subscription.data.endpoint)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-muted-foreground">
                        {uiT("Selected events")}</dt>
                      <dd className="mt-1">
                        {detail.subscription.data.event_types
                          .map(value => uiT(eventLabel(value)))
                          .join(", ")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-muted-foreground">
                        {uiT("Configuration")}</dt>
                      <dd className="mt-1">
                        {detail.subscription.data.enabled
                          ? uiT("Enabled")
                          : uiT("Disabled")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-muted-foreground">
                        {uiT("Current delivery authority")}</dt>
                      <dd className="mt-1">
                        {detail.subscription.authorization_active
                          ? uiT("Active")
                          : uiT("Missing or expired — ask your agent to reconnect and explicitly update this subscription.")}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-sm text-muted-foreground">
                    {uiT("Signing credentials stay private. Enabled configuration is not proof of receiver acknowledgement or an active coding-agent session.")}</p>
                </TabsContent>
                <TabsContent value="deliveries">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{uiT("Updated")}</TableHead>
                        <TableHead>{uiT("Delivery")}</TableHead>
                        <TableHead>{uiT("Attempts")}</TableHead>
                        <TableHead>HTTP</TableHead>
                        <TableHead>{uiT("Next action")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.deliveries?.map((delivery) => (
                        <TableRow key={delivery.id}>
                          <TableCell>{stamp(delivery.updated_at)}</TableCell>
                          <TableCell>
                            {uiT(deliveryLabel[delivery.state])}
                            {delivery.failure_kind
                              ? ` · ${uiT(failureLabel[delivery.failure_kind] ?? "Unavailable")}`
                              : ""}
                          </TableCell>
                          <TableCell>{delivery.attempts}</TableCell>
                          <TableCell>
                            {delivery.response_status ?? uiT("Unavailable")}
                          </TableCell>
                          <TableCell>
                            {delivery.next_attempt_at
                              ? uiF("Retry {0}", [stamp(delivery.next_attempt_at)])
                              : delivery.lease_expired
                                ? uiT("Awaiting lease recovery")
                                : delivery.state === "failed"
                                  ? uiT("Ask your agent to reconcile the event log")
                                  : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {!detail.deliveries?.length && (
                    <p className="py-6 text-muted-foreground">
                      {uiT("No delivery evidence yet. Ask your agent to queue a targeted subscription test.")}</p>
                  )}
                  <p className="mt-3 text-sm text-muted-foreground">
                    {uiT("Failed deliveries require your agent to reconcile the event log and check the receiver. Latest 100 deliveries. A receiver’s 2xx acknowledges receipt, not processing or task success.")}</p>
                </TabsContent>
              </Tabs>
            )}
            {slug && detail.definition && !run && (
              <Tabs
                value={tab}
                onValueChange={(value) =>
                  setQuery((previous) => {
                    const next = new URLSearchParams(previous);
                    next.set("tab", value);
                    return next;
                  })
                }
              >
                <TabsList variant="line">
                  <TabsTrigger value="runs">{uiT("Runs")}</TabsTrigger>
                  <TabsTrigger value="criteria">{uiT("Criteria")}</TabsTrigger>
                </TabsList>
                <TabsContent value="runs">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{uiT("Run")}</TableHead>
                        <TableHead>{uiT("Evaluator")}</TableHead>
                        <TableHead>{uiT("Accepted")}</TableHead>
                        <TableHead>{uiT("Unknown charges")}</TableHead>
                        <TableHead>{uiT("Captured")}</TableHead>
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
                            {safeText(receipt.evaluator.name)} ·{" "}
                            {safeText(receipt.evaluator.version)}
                          </TableCell>
                          <TableCell>
                            {receipt.summary.verdicts.accepted ?? 0} /{" "}
                            {receipt.summary.samples}
                          </TableCell>
                          <TableCell>
                            {receipt.summary.unknown_charge_attempts}{" "}{uiT("attempts")}</TableCell>
                          <TableCell>{stamp(receipt.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {!detail.runs?.length && (
                    <p className="py-6 text-muted-foreground">
                      {uiT("No evaluation runs yet. Ask your agent to run an evaluation within your approved budget.")}</p>
                  )}
                  {next && (
                    <Button
                      variant="outline"
                      onClick={() => setQuery({ after: next })}
                    >
                      {uiT("Next page")}</Button>
                  )}
                  {after && (
                    <Button variant="outline" onClick={() => setQuery({})}>
                      {uiT("First page")}</Button>
                  )}
                </TabsContent>
                <TabsContent value="criteria" className="space-y-5 py-5">
                  <div>
                    <h2 className="font-medium">{uiT("Task")}</h2>
                    <p className="mt-2 whitespace-pre-wrap">
                      {safeText(detail.definition.task)}
                    </p>
                  </div>
                  <div>
                    <h2 className="font-medium">{uiT("Acceptance rubric")}</h2>
                    <p className="mt-2 whitespace-pre-wrap">
                      {safeText(detail.definition.rubric)}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {uiT(detail.definition.protocol)} ·{" "}
                    {detail.definition.samples.length}{" "}{uiT("named samples · revision")}{" "}
                    {detail.definition.revision}{uiT(". Runs retain their pinned definition.")}</p>
                </TabsContent>
              </Tabs>
            )}
            {detail.run && (
              <>
                <p className="text-sm text-muted-foreground">
                  {safeText(detail.run.evaluator.name)} ·{" "}
                  {safeText(detail.run.evaluator.version)} ·{" "}
                  {uiT(detail.run.evaluator.kind)}{" "}{uiT("judgment · captured")}{" "}
                  {stamp(detail.run.capture.finished_at)}{" "}{uiT("· definition revision")}{" "}
                  {detail.run.evaluation_revision}
                </p>
                <Tabs
                  value={tab}
                  onValueChange={(value) =>
                    setQuery((previous) => {
                      const next = new URLSearchParams(previous);
                      next.set("tab", value);
                      return next;
                    })
                  }
                >
                  <TabsList variant="line">
                    <TabsTrigger value="results">{uiT("Results")}</TabsTrigger>
                    <TabsTrigger value="criteria">{uiT("Criteria")}</TabsTrigger>
                    <TabsTrigger value="comparison">{uiT("Comparison")}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="criteria" className="space-y-5 py-5">
                    <div>
                      <h2 className="font-medium">{uiT("Pinned task")}</h2>
                      <p className="mt-2 whitespace-pre-wrap">
                        {safeText(detail.run.definition.task)}
                      </p>
                    </div>
                    <div>
                      <h2 className="font-medium">{uiT("Pinned acceptance rubric")}</h2>
                      <p className="mt-2 whitespace-pre-wrap">
                        {safeText(detail.run.definition.rubric)}
                      </p>
                    </div>
                  </TabsContent>
                  <TabsContent value="results" className="space-y-5">
                    <EvaluationMetrics summary={detail.run.summary} />
                    <h2 className="font-medium">{uiT("Sample results")}</h2>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{uiT("Sample")}</TableHead>
                          <TableHead>{uiT("Input")}</TableHead>
                          <TableHead>{uiT("Judgment")}</TableHead>
                          <TableHead>{uiT("Evaluated model")}</TableHead>
                          <TableHead>{uiT("Duration")}</TableHead>
                          <TableHead>{uiT("Reason")}</TableHead>
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
                                )?.model ?? "Unavailable",
                              )}
                              {(result.pool_selections ?? [])
                                .filter(
                                  (policy) =>
                                    safeText(policy.slug) === policy.slug &&
                                    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
                                      policy.slug,
                                    ) &&
                                    Number.isSafeInteger(policy.revision) &&
                                    policy.revision > 0 &&
                                    policy.revision < Number.MAX_SAFE_INTEGER,
                                )
                                .map((policy) => (
                                  <Link
                                    key={`${policy.slug}:${policy.revision}`}
                                    className="mt-1 block max-w-64 whitespace-normal break-words text-sm text-muted-foreground hover:underline"
                                    to={`/workspaces/${encodeURIComponent(routeWorkspace)}/pools/${encodeURIComponent(policy.slug)}?tab=history&revision=${policy.revision}`}
                                  >
                                    {uiT("Policy")}{" "}{policy.slug}{" "}{uiT("· revision")}{" "}
                                    {policy.revision}
                                  </Link>
                                ))}
                            </TableCell>
                            <TableCell>
                              {result.duration_ms === null
                                ? uiT("Unavailable")
                                : uiF("{0} ms", [result.duration_ms])}
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              {safeText(
                                result.judgment.reason ?? "No reason supplied",
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="text-sm text-muted-foreground">
                      {uiT("Duration is the evaluated attempt only. Charge totals include all attempts in submitted operations. Unknown and owner-funded charges are not zero.")}</p>
                  </TabsContent>
                  <TabsContent value="comparison">
                    <div className="space-y-3 pt-5">
                      <h2 className="font-medium">{uiT("Compare with a baseline")}</h2>
                      <div className="flex flex-wrap items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                              {safeText(
                                detail.runs?.find(
                                  (item) => item.slug === baseline,
                                )?.name ?? "Choose baseline",
                              )}
                              <IconChevronDown size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuRadioGroup
                              value={baseline}
                              onValueChange={(value) => {
                                setQuery((previous) => {
                                  const next = new URLSearchParams(previous);
                                  next.set("baseline", value);
                                  return next;
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
                                {uiT("Load more runs")}</DropdownMenuItem>
                            )}
                            {!detail.runs?.some(
                              (item) => item.slug !== run,
                            ) && (
                              <p className="px-3 py-2 text-sm text-muted-foreground">
                                {uiT("No other runs available")}</p>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="secondary"
                          disabled={!baseline || comparing}
                          onClick={() => void compare()}
                        >
                          {comparing ? uiT("Comparing…") : uiT("Compare matched samples")}
                        </Button>
                      </div>
                      {comparison && (
                        <div aria-live="polite" className="space-y-3">
                          <p>
                            {comparison.matched_verified_samples}{" "}{uiT("verified matched samples ·")}{" "}
                            {comparison.left_unmatched_samples}{" "}{uiT("baseline unmatched ·")}{" "}{comparison.right_unmatched_samples}{" "}
                            {uiT("current unmatched")}</p>
                          {!comparison.quality_comparable && (
                            <Alert>
                              <AlertDescription>
                                {uiT("Quality judgments are not directly comparable: check task, protocol, rubric, evaluator version and verified sample coverage.")}</AlertDescription>
                            </Alert>
                          )}
                          {comparison.shared_operations > 0 && (
                            <p className="text-sm text-muted-foreground">
                              {comparison.shared_operations}{" "}{uiT("shared operations. These are repeated judgments of the same execution, not independent trials.")}</p>
                          )}
                          <EvaluationComparisonTable comparison={comparison} />
                          <p className="text-sm text-muted-foreground">
                            {uiT("All submitted operation attempts are included. Unknown charges stay unknown; no winner is inferred.")}</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </>
        )
      )}
      <Dialog
        open={Boolean(inspectedRevision)}
        onOpenChange={(open) => {
          if (!open) setInspectedRevision(null);
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
              {uiT("Revision")}{" "}{inspectedRevision?.revision} ·{" "}
              {inspectedRevision ? safeText(inspectedRevision.name) : ""}
            </DialogTitle>
            <DialogDescription>
              {uiT("Immutable saved configuration. Current workspace revision:")}{" "}
              {detail.pool?.revision ?? uiT("unavailable")}.
            </DialogDescription>
          </DialogHeader>
          {inspectedRevision && detail.pool && (
            <>
              <p className="text-sm text-muted-foreground">
                {uiT("Changed compared with current revision:")}{" "}
                {(
                  [
                    "name",
                    "description",
                    "enabled",
                    "default_action",
                    "candidates",
                    "rules",
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
                        name: "Name",
                        description: "Description",
                        enabled: "Enabled state",
                        default_action: "Default action",
                        candidates: "Candidate models",
                        rules: "Routing rules",
                      })[field],
                  )
                  .join(", ") || uiT("No policy differences")}
                {uiT(". Restoring requires a new revision through your authorized agent.")}</p>
              <PoolPolicyView pool={inspectedRevision} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
