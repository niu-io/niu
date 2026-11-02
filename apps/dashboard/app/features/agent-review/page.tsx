import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { translateUI, useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams, type LoaderFunctionArgs } from "react-router";
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from "@/lib/route-data";
import {
  IconArrowLeft,
  IconChevronDown,
  IconEdit,
  IconHistory,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { pinyin } from "pinyin-pro";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardContext, type Model } from "@/shell/dashboard-context";
import { useLocale } from "@/shell/ui-locale";
import { formatFinancialMoney } from "@/lib/money";
import { fetchQuery, invalidateForMutation, peekQuery } from "@/lib/query-cache";

function poolSlugFromName(name: string) {
  if (!name.trim()) return "";
  const romanized = pinyin(name, { toneType: "none", nonZh: "consecutive", v: true });
  return (
    romanized
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "") || "pool"
  );
}

type Kind = "routing" | "evaluations" | "events";
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
export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ workspace, url, params }) => {
    if (!workspace || params.slug) {
      return { endpoint: null };
    }
    const kind = (url.pathname.match(/\/(routing|evaluations|events)(?:\/|$)/)?.[1] ?? "routing") as Kind;
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
        if (kind === "routing") {
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
    /\/(routing|evaluations|events)(?:\/|$)/,
  )?.[1] ?? "routing") as Kind;
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
            canWrite={context.session?.permissions?.write !== false}
            models={context.models ?? []}
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
  canWrite,
  models,
}: {
  token: string;
  workspace: string;
  routeWorkspace: string;
  kind: Kind;
  slug?: string;
  run?: string;
  canWrite: boolean;
  models: Model[];
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const { t } = useLocale();
  const navigate = useNavigate();
  const availableModels = useMemo(
    () =>
      models.filter(
        (model) =>
          !model.id.startsWith("pool/") && !model.id.startsWith("codex/"),
      ),
    [models],
  );
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
  const revisionQuery = kind === "routing" ? query.get("revision") : null;
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
            if (kind === "routing") {
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
          if (kind === "routing") {
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
    kind === "routing"
      ? t("Routing", "模型路由")
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
    : kind === "routing"
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
  const [poolDialogOpen, setPoolDialogOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<WorkspaceModelPool | null>(null);
  const [poolName, setPoolName] = useState("");
  const [poolSlug, setPoolSlug] = useState("");
  const [poolSlugEdited, setPoolSlugEdited] = useState(false);
  const [poolDescription, setPoolDescription] = useState("");
  const [poolEnabled, setPoolEnabled] = useState(true);
  const [poolDefaultAction, setPoolDefaultAction] = useState<"candidates" | "reject">("candidates");
  const [poolCandidates, setPoolCandidates] = useState<
    Array<{ alias: string; priority: string; weight: string; enabled: boolean }>
  >([{ alias: "", priority: "100", weight: "1", enabled: true }]);
  const [poolRules, setPoolRules] = useState<
    NonNullable<WorkspaceModelPool["rules"]>
  >([]);
  const [savingPool, setSavingPool] = useState(false);
  const [poolFormError, setPoolFormError] = useState("");
  const [restoreRevisionError, setRestoreRevisionError] = useState("");

  function openCreatePoolDialog() {
    setEditingPool(null);
    setPoolName("");
    setPoolSlug("");
    setPoolSlugEdited(false);
    setPoolDescription("");
    setPoolEnabled(true);
    setPoolDefaultAction("candidates");
    setPoolCandidates([
      {
        alias: availableModels[0]?.id ?? "",
        priority: "100",
        weight: "1",
        enabled: true,
      },
    ]);
    setPoolRules([]);
    setPoolFormError("");
    setPoolDialogOpen(true);
  }

  function openEditPoolDialog(pool: WorkspaceModelPool) {
    setEditingPool(pool);
    setPoolName(pool.name);
    setPoolSlug(pool.slug);
    setPoolSlugEdited(true);
    setPoolDescription(pool.description);
    setPoolEnabled(pool.enabled);
    setPoolDefaultAction(pool.default_action ?? "candidates");
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
              alias: availableModels[0]?.id ?? "",
              priority: "100",
              weight: "1",
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
    setPoolFormError("");
    setPoolDialogOpen(true);
  }

  function addRoutingRule(
    preset?: "vision" | "tools" | "structured_output" | "reasoning",
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
        "";
      const name =
        preset === "vision"
          ? t("Vision & image requests", "视觉与图片输入分流")
          : preset === "tools"
            ? t("Tool calling requests", "工具调用分流")
            : preset === "structured_output"
              ? t("Structured JSON output", "结构化 JSON 输出分流")
              : preset === "reasoning"
                ? t("Deep reasoning requests", "深度推理分流")
                : t(`Routing rule ${nextIndex}`, `路由规则 ${nextIndex}`);
      const conditions =
        preset === "vision"
          ? { vision: true }
          : preset === "tools"
            ? { tools: true }
            : preset === "structured_output"
              ? { structured_output: true }
              : preset === "reasoning"
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
    patch: Partial<NonNullable<WorkspaceModelPool["rules"]>[number]>,
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
    patch: Partial<{ alias: string; priority: string; weight: string; enabled: boolean }>,
  ) {
    setPoolCandidates((current) =>
      current.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    );
  }

  function addCandidate() {
    setPoolCandidates((current) => [
      ...current,
      { alias: "", priority: "100", weight: "1", enabled: true },
    ]);
  }

  function removeCandidate(index: number) {
    setPoolCandidates((current) =>
      current.length <= 1 ? current : current.filter((_, idx) => idx !== index),
    );
  }

  async function submitPoolForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPool) return;
    const trimmedName = poolName.trim();
    const normalizedSlug = poolSlug.trim();
    if (!trimmedName) {
      setPoolFormError(t("Enter a model pool name.", "请输入模型池名称。"));
      return;
    }
    if (
      !normalizedSlug ||
      normalizedSlug.length > 80 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)
    ) {
      setPoolFormError(
        t(
          "Use a lowercase letters, numbers, and hyphens slug (up to 80 characters).",
          "请使用小写字母、数字和连字符组成的标识（最多 80 个字符）。",
        ),
      );
      return;
    }
    const parsedCandidates: WorkspaceModelPool["candidates"] = [];
    const seenAliases = new Set<string>();
    for (const candidate of poolCandidates) {
      const alias = candidate.alias.trim();
      const priority = Number(candidate.priority);
      const weight = Number(candidate.weight);
      if (!alias || alias.startsWith("pool/") || alias.startsWith("codex/")) {
        setPoolFormError(
          t(
            "Enter a valid workspace model alias for every candidate.",
            "请为每个候选模型填写有效的工作区模型标识。",
          ),
        );
        return;
      }
      if (seenAliases.has(alias)) {
        setPoolFormError(
          t(
            "Each candidate model in a pool must be unique.",
            "同一模型池中的候选模型不能重复。",
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
            "Priority must be between -1000 and 1000; weight must be between 1 and 10000.",
            "优先级必须在 -1000 到 1000 之间，权重必须在 1 到 10000 之间。",
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
    if (poolEnabled && !parsedCandidates.some((candidate) => candidate.enabled)) {
      setPoolFormError(
        t(
          "An enabled custom model requires at least one enabled candidate model.",
          "启用的自定义路由模型至少需要一个处于启用状态的候选模型。",
        ),
      );
      return;
    }
    const parsedRules: NonNullable<WorkspaceModelPool["rules"]> = [];
    for (const rule of poolRules) {
      const ruleName = (rule.name ?? "").trim();
      const targetAlias = (rule.candidates[0]?.alias ?? "").trim();
      if (!ruleName || !targetAlias) {
        setPoolFormError(
          t(
            "Every routing rule requires a name and a target model.",
            "每条路由规则都需要填写规则名称和目标模型。",
          ),
        );
        return;
      }
      if (!seenAliases.has(targetAlias)) {
        seenAliases.add(targetAlias);
        parsedCandidates.push({
          alias: targetAlias,
          priority: 100,
          weight: 1,
          enabled: true,
        });
      }
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
    setSavingPool(true);
    setPoolFormError("");
    try {
      const payload: WorkspaceModelPool = {
        slug: normalizedSlug,
        name: trimmedName,
        description: poolDescription.trim(),
        enabled: poolEnabled,
        revision: editingPool ? editingPool.revision : 0,
        default_action: poolDefaultAction,
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
        "PUT",
      );
      invalidateForMutation(
        token,
        `/api/v1/workspaces/${encodeURIComponent(workspace)}/routing`,
        "PUT",
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
          const filtered = previous.filter((row) => row.slug !== saved.data.slug);
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
              "Could not save the model pool. Check candidate model names and try again.",
              "无法保存模型池，请检查候选模型名称后重试。",
            );
      setPoolFormError(message);
    } finally {
      setSavingPool(false);
    }
  }

  async function restorePoolRevision(targetRevision: WorkspaceModelPool) {
    if (!detail.pool || savingPool) return;
    setSavingPool(true);
    setRestoreRevisionError("");
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
        "PUT",
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
              "Could not restore this revision. Refresh and try again.",
              "无法恢复此版本，请刷新页面后重试。",
            ),
      );
    } finally {
      setSavingPool(false);
    }
  }

  return (
    <section className="empty-region min-w-0 space-y-5" aria-label={title}>
      <PageHeader
        title={title}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {kind === "routing" && !slug && canWrite && (
              <Button size="sm" onClick={openCreatePoolDialog}>
                <IconPlus size={16} />
                {t("Create custom model", "创建自定义模型")}
              </Button>
            )}
            {kind === "routing" && slug && detail.pool && canWrite && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditPoolDialog(detail.pool!)}
              >
                <IconEdit size={16} />
                {t("Edit routing", "编辑路由配置")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={() => setRefresh((value) => value + 1)}
            >
              <IconRefresh size={16} />
              {t("Refresh", "刷新")}
            </Button>
          </div>
        }
      />
      {slug ? (
        <Button variant="ghost" size="sm" asChild>
          <Link to={run ? `${base}/${encodeURIComponent(slug)}` : base}>
            <IconArrowLeft size={16} />
            {run ? t("All runs", "所有评估记录") : title}
          </Link>
        </Button>
      ) : (
        <Tabs
          value={kind}
          onValueChange={(nextKind) =>
            navigate(base.replace(/\/(routing|evaluations|events)$/, `/${nextKind}`))
          }
        >
          <TabsList variant="line">
            <TabsTrigger value="routing">{t("Routing", "模型路由")}</TabsTrigger>
            <TabsTrigger value="evaluations">{t("Evaluations", "评估")}</TabsTrigger>
            <TabsTrigger value="events">{t("Event subscriptions", "事件订阅")}</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <div>
        {slug && (
          <h1 className="text-xl font-semibold break-words">
            {name ? safeText(name) : t("Review", "审阅")}
          </h1>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          {error
            ? uiT("Return to the list or retry loading this resource.")
            : loading
              ? uiT("Retrieving workspace evidence…")
              : slug
                ? run
                  ? uiT("Immutable evidence captured at submission. Judgments are attributed to the evaluator.")
                  : uiF("Saved workspace configuration{0}. Your agent can make changes within its delegated authority.", [revision ? uiF(" · revision {0}", [revision]) : ""])
                : kind === "routing"
                  ? t(
                      "Define custom models backed by conditional routing rules and fallback candidates, or review agent revisions and execution evidence.",
                      "将一系列条件路由与候选回退规则配置为自定义模型，或审阅智能体使用的路由策略、修订记录及执行证据。",
                    )
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
                          {kind === "routing"
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
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle role="heading" aria-level={2}>
                      {kind === "routing"
                        ? t("No custom models yet", "暂无自定义路由模型")
                        : uiF("No {0} yet", [title.toLowerCase()])}
                    </EmptyTitle>
                    <EmptyDescription>
                      {kind === "routing"
                        ? t(
                            "Combine conditional routing rules and prioritized candidate models into a callable custom model, or ask your coding agent to configure routing for your task.",
                            "将一系列条件路由分流规则与候选模型组合为可调用的自定义模型，或让你的 coding agent 为任务配置模型路由。",
                          )
                        : `${uiT("Ask your coding agent to")} ${
                            kind === "evaluations"
                              ? uiT(
                                  "evaluate models against your task criteria and approved budget",
                                )
                              : uiT(
                                  "configure an authorized notification receiver",
                                )
                          }.`}
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent className="flex-row flex-wrap justify-center">
                    {kind === "routing" && canWrite && (
                      <Button onClick={openCreatePoolDialog}>
                        <IconPlus size={16} />
                        {t("Create custom model", "创建自定义模型")}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(
                            `Use Niu to ${kind === "routing" ? "configure model routing for my task" : kind === "evaluations" ? "define a task-specific model evaluation; agree on acceptance criteria and a bounded paid budget before running it" : "configure workspace event notifications to a receiver I authorize"}. Read https://niu.io/docs/agents.md and inspect my current workspace grants first.`,
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
                  </EmptyContent>
                </Empty>
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
                    <Empty className="min-h-60"><EmptyHeader><EmptyDescription>{uiT("No recorded selections yet.")}</EmptyDescription></EmptyHeader></Empty>
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
                    <Empty className="min-h-60"><EmptyHeader><EmptyDescription>{uiT("No delivery evidence yet. Ask your agent to queue a targeted subscription test.")}</EmptyDescription></EmptyHeader></Empty>
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
                    <Empty className="min-h-60"><EmptyHeader><EmptyDescription>{uiT("No evaluation runs yet. Ask your agent to run an evaluation within your approved budget.")}</EmptyDescription></EmptyHeader></Empty>
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
                                    to={`/workspaces/${encodeURIComponent(routeWorkspace)}/routing/${encodeURIComponent(policy.slug)}?tab=history&revision=${policy.revision}`}
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
          if (!open) {
            setInspectedRevision(null);
            setRestoreRevisionError("");
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
              {restoreRevisionError && (
                <Alert variant="destructive">
                  <AlertDescription>{restoreRevisionError}</AlertDescription>
                </Alert>
              )}
              <PoolPolicyView pool={inspectedRevision} />
              {canWrite && inspectedRevision.revision !== detail.pool.revision && (
                <DialogFooter>
                  <Button
                    type="button"
                    disabled={savingPool}
                    onClick={() => void restorePoolRevision(inspectedRevision)}
                  >
                    <IconHistory size={16} />
                    {savingPool
                      ? t("Restoring…", "恢复中…")
                      : t("Restore this revision", "恢复此版本")}
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
            setPoolFormError("");
          }
        }}
      >
        <DialogContent className="max-h-[88dvh] min-w-0 overflow-x-hidden overflow-y-auto [&>*]:min-w-0 sm:max-w-2xl">
          <DialogHeader className="pr-6">
            <DialogTitle>
              {editingPool
                ? t("Edit custom model routing", "编辑自定义模型路由")
                : t("Create custom model", "创建自定义模型")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Define a custom model backed by conditional routing rules and prioritized fallback candidates.",
                "通过条件路由分流规则与按优先级/权重排列的候选模型，定义一个可直接调用的自定义模型。",
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submitPoolForm(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pool-name">{t("Name", "自定义模型名称")}</Label>
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
                  placeholder={t("Fast coding router", "快速编码路由模型")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pool-slug">{t("Slug", "模型标识 (Slug)")}</Label>
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
                        .replace(/[^a-z0-9-]+/g, "-")
                        .replace(/^-+|-+$/g, ""),
                    );
                  }}
                  placeholder={t("fast-coding-router", "fast-coding-router")}
                />
                <p className="break-words text-xs text-muted-foreground">
                  {t("Invoked as custom model", "作为自定义模型调用：")}{" "}
                  <code className="font-mono">pool/{poolSlug || "<slug>"}</code>
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pool-description">
                {t("Description", "描述")}
              </Label>
              <Textarea
                id="pool-description"
                rows={2}
                maxLength={4000}
                disabled={savingPool}
                value={poolDescription}
                onChange={(event) => setPoolDescription(event.target.value)}
                placeholder={t(
                  "Optional notes on routing criteria or fallback behavior",
                  "可选：说明路由分流条件或回退策略",
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("Default action", "默认路由动作")}</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={savingPool}
                      aria-label={t("Default action", "默认路由动作")}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {poolDefaultAction === "candidates"
                          ? t("Route to candidate models", "路由至候选模型")
                          : t("Reject when no rule matches", "无规则匹配时拒绝")}
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
                        setPoolDefaultAction(value as "candidates" | "reject")
                      }
                    >
                      <DropdownMenuRadioItem value="candidates">
                        {t("Route to candidate models", "路由至候选模型")}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="reject">
                        {t("Reject when no rule matches", "无规则匹配时拒绝")}
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
                  {t("Enable custom model routing", "启用该自定义路由模型")}
                </Label>
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>{t("Routing rules", "条件路由规则")}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(
                      "Route specific request types (vision, tools, structured output, reasoning) to dedicated models before falling back.",
                      "按请求特征（视觉输入、工具调用、结构化输出、深度推理）分流至指定模型，未命中时回退至下方默认候选模型。",
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
                      {t("Add routing rule", "添加路由规则")}
                      <IconChevronDown size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => addRoutingRule("vision")}>
                      {t("Vision & image requests", "视觉与图片输入分流")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => addRoutingRule("tools")}>
                      {t("Tool calling requests", "工具调用分流")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => addRoutingRule("structured_output")}
                    >
                      {t("Structured JSON output", "结构化 JSON 输出分流")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => addRoutingRule("reasoning")}>
                      {t("Deep reasoning requests", "深度推理分流")}
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
                            {t("Rule name", "规则名称")}
                          </Label>
                          <Input
                            id={`pool-rule-name-${ruleIndex}`}
                            required
                            disabled={savingPool}
                            value={rule.name ?? ""}
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
                            {t("Route to model", "目标路由模型")}
                          </Label>
                          <div className="flex items-center gap-1.5">
                            <Input
                              id={`pool-rule-target-${ruleIndex}`}
                              required
                              disabled={savingPool}
                              value={rule.candidates[0]?.alias ?? ""}
                              onChange={(event) =>
                                updateRoutingRule(ruleIndex, {
                                  candidates: [
                                    {
                                      alias: event.target.value,
                                      priority: 100,
                                      weight: 1,
                                      enabled: true,
                                    },
                                  ],
                                })
                              }
                              placeholder={t(
                                "e.g. gpt-4.1-mini",
                                "例如 gpt-4.1-mini",
                              )}
                            />
                            {availableModels.length > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={savingPool}
                                    className="shrink-0 font-normal"
                                  >
                                    {t("Choose", "选择")}
                                    <IconChevronDown size={14} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="max-h-64 overflow-y-auto"
                                >
                                  <DropdownMenuRadioGroup
                                    value={rule.candidates[0]?.alias ?? ""}
                                    onValueChange={(value) =>
                                      updateRoutingRule(ruleIndex, {
                                        candidates: [
                                          {
                                            alias: value,
                                            priority: 100,
                                            weight: 1,
                                            enabled: true,
                                          },
                                        ],
                                      })
                                    }
                                  >
                                    {availableModels.map((model) => (
                                      <DropdownMenuRadioItem
                                        key={model.id}
                                        value={model.id}
                                      >
                                        {model.id}
                                      </DropdownMenuRadioItem>
                                    ))}
                                  </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                        <div className="flex items-end justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={savingPool}
                            onClick={() => removeRoutingRule(ruleIndex)}
                            aria-label={t("Remove rule", "移除路由规则")}
                          >
                            <IconTrash size={14} />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
                        <span className="text-muted-foreground">
                          {t("Match when request uses:", "匹配条件：")}
                        </span>
                        {(
                          [
                            ["vision", "Vision / images", "视觉/图片"],
                            ["tools", "Tools", "工具调用"],
                            ["structured_output", "Structured output", "结构化输出"],
                            ["reasoning", "Reasoning", "深度推理"],
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
                  <Label>{t("Candidate models", "默认候选模型与回退顺序")}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(
                      "Higher priority (-1000 to 1000) is routed first; weight (1 to 10000) balances equally ranked candidates.",
                      "优先级（-1000 至 1000）越高越先路由；权重（1 至 10000）用于在同优先级候选模型间分配流量。",
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
                  {t("Add candidate", "添加候选模型")}
                </Button>
              </div>
              <div className="space-y-2.5">
                {poolCandidates.map((candidate, index) => (
                  <div
                    key={index}
                    className="grid gap-2.5 rounded-lg bg-muted/40 p-3 sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_auto]"
                  >
                    <div className="space-y-1">
                      <Label
                        htmlFor={`pool-candidate-model-${index}`}
                        className="text-xs text-muted-foreground"
                      >
                        {t("Model alias", "模型标识")}
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          id={`pool-candidate-model-${index}`}
                          required
                          disabled={savingPool}
                          value={candidate.alias}
                          onChange={(event) =>
                            updateCandidate(index, { alias: event.target.value })
                          }
                          placeholder={t("e.g. gpt-4.1-mini", "例如 gpt-4.1-mini")}
                        />
                        {availableModels.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={savingPool}
                                aria-label={t("Choose model", "选择模型")}
                                className="shrink-0 font-normal"
                              >
                                {t("Choose", "选择")}
                                <IconChevronDown size={14} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="max-h-64 overflow-y-auto"
                            >
                              <DropdownMenuRadioGroup
                                value={candidate.alias}
                                onValueChange={(value) =>
                                  updateCandidate(index, { alias: value })
                                }
                              >
                                {availableModels.map((model) => (
                                  <DropdownMenuRadioItem
                                    key={model.id}
                                    value={model.id}
                                  >
                                    {model.id}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor={`pool-candidate-priority-${index}`}
                        className="text-xs text-muted-foreground"
                      >
                        {t("Priority", "优先级")}
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
                    <div className="space-y-1">
                      <Label
                        htmlFor={`pool-candidate-weight-${index}`}
                        className="text-xs text-muted-foreground"
                      >
                        {t("Weight", "权重")}
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
                            updateCandidate(index, { enabled: checked === true })
                          }
                        />
                        <Label
                          htmlFor={`pool-candidate-enabled-${index}`}
                          className="text-xs font-normal"
                        >
                          {t("Enabled", "启用")}
                        </Label>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={savingPool || poolCandidates.length <= 1}
                        onClick={() => removeCandidate(index)}
                        aria-label={t("Remove candidate", "移除候选模型")}
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
                <AlertDescription>{poolFormError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={savingPool}
                onClick={() => setPoolDialogOpen(false)}
              >
                {t("Cancel", "取消")}
              </Button>
              <Button type="submit" disabled={savingPool}>
                {savingPool
                  ? t("Saving…", "保存中…")
                  : editingPool
                    ? t("Save changes", "保存更改")
                    : t("Create custom model", "创建自定义模型")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
