import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams, type LoaderFunctionArgs } from "react-router";
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from "@/lib/route-data";
import { IconPencil, IconShieldCheck } from "@tabler/icons-react";
import DetectorPreview from "./DetectorPreview";
import {
  emptyGuardrailPolicy,
  guardrailAccessLabels,
  PolicyEditorDialog,
  type GuardrailAccessRule,
  type GuardrailHead,
  type GuardrailPolicy,
} from "./PolicyEditorDialog";
import { PolicyTestDialog } from "./PolicyTestDialog";
import { actions, presets, type ContentRule } from "./rules";
import GuardrailHistory from "./History";
import GuardrailDenials from "./Denials";
import ConnectGate from "@/shell/ConnectGate";
import { useDashboardContext } from "@/shell/dashboard-context";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cachedGet, markCachedStale, peekCachedGet } from "@/features/providers/api";
import { FormSectionSkeleton } from "@/components/PageSkeletons";
import { disambiguatedCatalogTitle } from "@/lib/providers";
import { translateUI, useLocale as useUILocale } from "@/shell/ui-locale";

type GuardrailsTab = "policy" | "blocked" | "history";

function validateHead(raw: unknown): GuardrailHead | null {
  if (raw === null) return null;
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    typeof (raw as GuardrailHead).revision !== "number" ||
    !(raw as GuardrailHead).policy ||
    typeof (raw as GuardrailHead).policy !== "object" ||
    typeof (raw as GuardrailHead).policy.name !== "string" ||
    !(raw as GuardrailHead).policy.models ||
    !(raw as GuardrailHead).policy.providers
  ) {
    throw new Error("The saved Guardrails policy could not be read.");
  }
  return raw as GuardrailHead;
}

function readCachedHead(token: string, endpoint: string): { data: GuardrailHead | null } | undefined {
  if (!endpoint) return undefined;
  const cached = peekCachedGet<{ data: unknown }>(token, endpoint);
  if (cached === undefined) return undefined;
  try {
    return { data: validateHead(cached.data) };
  } catch {
    return undefined; // A corrupt cache entry is optional; the network read below reports failures.
  }
}

function requestedTab(value: string | null): GuardrailsTab {
  if (value === "history") return "history";
  if (value === "blocked" || value === "denials") return "blocked";
  return "policy";
}

function ruleSummaryItem(
  rule: ContentRule,
  uiT: (text: string, zh?: string) => string,
  observeOnly = false,
): string {
  const actionLabel = observeOnly ? uiT("Observe") : uiT(actions[rule.action]);
  if (rule.preset) {
    const label = presets.find((item) => item.value === rule.preset)?.label ?? rule.preset;
    return `${uiT(label)} · ${actionLabel}`;
  }
  return `${uiT("Custom regex", "自定义正则")} ${rule.pattern ?? ""} · ${actionLabel}`;
}

function keyedRules(rules: ContentRule[]): Array<{ key: string; rule: ContentRule }> {
  const counts = new Map<string, number>();
  return rules.map((rule) => {
    const base = `${rule.preset ?? ""}:${rule.pattern ?? ""}:${rule.action}`;
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    return { key: seen ? `${base}#${seen}` : base, rule };
  });
}

function accessSummary(
  access: GuardrailAccessRule,
  kind: "models" | "providers",
  models: Array<{ id: string; catalog?: { name?: string | null } }>,
  uiT: (text: string, zh?: string) => string,
): string {
  if (access.mode === "allow_list") {
    const values = access.values ?? [];
    if (!values.length) {
      return uiT("Allow selected · None selected (all blocked)", "允许所选项 · 未选择（全部拦截）");
    }
    if (kind === "models") {
      return values
        .map((model) => {
          const found = models.find((item) => item.id === model);
          const hasFriendly = Boolean(found?.catalog?.name?.trim());
          return found && hasFriendly ? disambiguatedCatalogTitle(found, models) : model;
        })
        .join(", ");
    }
    return values.join(", ");
  }
  return translateUI(guardrailAccessLabels[access.mode]);
}

function Guardrails({ token, canWrite }: { token: string; canWrite: boolean }) {
  const { t: uiT, format: uiF } = useUILocale();
  const { workspace, models } = useDashboardContext();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const tab = requestedTab(searchParams.get("tab"));
  const endpoint = workspace
    ? `/api/v1/workspaces/${workspace.id}/guardrails`
    : "";
  const cachedHead = readCachedHead(token, endpoint);
  const [head, setHead] = useState<GuardrailHead | null>(() => cachedHead?.data ?? null);
  const [loading, setLoading] = useState(() => cachedHead === undefined);
  const [loaded, setLoaded] = useState(() => cachedHead !== undefined);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [loadGeneration, setLoadGeneration] = useState(0);
  const [saved, setSaved] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const loadedScope = useRef(`${token}:${endpoint}`);
  const lastReload = useRef(0);
  const policyOpenerRef = useRef<HTMLButtonElement>(null);
  const testOpenerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!endpoint) return;
    const controller = new AbortController();
    const nextScope = `${token}:${endpoint}`;
    if (loadedScope.current !== nextScope) {
      loadedScope.current = nextScope;
      const nextCached = readCachedHead(token, endpoint);
      setHead(nextCached?.data ?? null);
      setLoaded(nextCached !== undefined);
      setLoading(nextCached === undefined);
      setEditorOpen(false);
      setTestOpen(false);
    } else if (!loaded || reload !== lastReload.current) {
      setLoading(true);
    }
    const force = lastReload.current !== reload;
    lastReload.current = reload;
    if (force) setLoaded(false);
    setError("");
    if (!force) setSaved(false);
    cachedGet<{ data: unknown }>(token, endpoint, {
      signal: controller.signal,
      force,
    })
      .then(({ data }) => {
        const verified = validateHead(data);
        if (controller.signal.aborted) return;
        setHead(verified);
        setLoaded(true);
        setLoadGeneration((value) => value + 1);
      })
      .catch((cause) => {
        markCachedStale(token, endpoint);
        if (!controller.signal.aborted) {
          setLoaded(false);
          setError(
            cause instanceof Error ? cause.message : "Could not load Guardrails.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, token, reload]);

  function selectTab(next: string) {
    const query = new URLSearchParams(searchParams);
    query.set("tab", next);
    if (next !== "history") {
      query.delete("revision");
      query.delete("from");
    }
    navigate({
      pathname: location.pathname,
      search: `?${query.toString()}`,
      hash: "",
    });
  }

  if (!workspace) return null;

  const activePolicy: GuardrailPolicy = head?.policy ?? emptyGuardrailPolicy();
  const hasTestableRules = Boolean(
    activePolicy.input_rules?.length || activePolicy.output?.rules.length,
  );
  const inputRules = activePolicy.input_rules ?? [];
  const outputRules = activePolicy.output?.rules ?? [];
  const outputObserveOnly = activePolicy.output?.mode === "observe_only";

  const policyContent =
    loading && !loaded ? (
      <FormSectionSkeleton fields={3} label={uiT("Loading Guardrails…")} />
    ) : !loaded ? (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>{uiT(error || "Could not load Guardrails.")}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReload((value) => value + 1)}
          >
            {uiT("Reload")}
          </Button>
        </AlertDescription>
      </Alert>
    ) : head === null ? (
      <Empty className="min-h-56">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconShieldCheck size={20} aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{uiT("No workspace policy configured", "尚未配置工作空间护栏策略")}</EmptyTitle>
          <EmptyDescription>
            {uiT(
              "Apply model restrictions, content filters, and external checks consistently across every API key in this workspace.",
              "为当前工作空间的所有 API 密钥统一配置模型限制、内容过滤及外部检测规则。",
            )}
          </EmptyDescription>
        </EmptyHeader>
        {canWrite && (
          <EmptyContent>
            <Button
              ref={policyOpenerRef}
              onClick={() => {
                setSaved(false);
                setEditorOpen(true);
              }}
            >
              {uiT("Create policy")}
            </Button>
          </EmptyContent>
        )}
      </Empty>
    ) : (
      <section
        className="space-y-6 rounded-[var(--radius-panel)] bg-card p-6"
        aria-label={uiT("Workspace policy")}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-semibold">{activePolicy.name}</h2>
              <Badge variant="secondary">
                {uiF("{0} · Version {1}", [uiT("Active"), head.revision])}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {uiT("This policy applies to every workspace API key.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasTestableRules && (
              <Button
                ref={testOpenerRef}
                variant="outline"
                size="sm"
                onClick={() => setTestOpen(true)}
              >
                {uiT("Test rules", "测试规则")}
              </Button>
            )}
            {canWrite && (
              <Button
                ref={policyOpenerRef}
                variant="outline"
                size="sm"
                onClick={() => {
                  setSaved(false);
                  setEditorOpen(true);
                }}
              >
                <IconPencil size={15} aria-hidden="true" />
                {uiT("Edit policy", "编辑策略")}
              </Button>
            )}
          </div>
        </div>

        {saved && (
          <p role="status" className="text-sm text-muted-foreground">
            {uiT("Policy saved.")}
          </p>
        )}

        <dl className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">{uiT("Models")}</dt>
            <dd className="text-sm font-medium break-words">
              {accessSummary(activePolicy.models, "models", models, uiT)}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">{uiT("Providers")}</dt>
            <dd className="text-sm font-medium break-words">
              {accessSummary(activePolicy.providers, "providers", models, uiT)}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">{uiT("Input rules")}</dt>
            <dd className="text-sm font-medium">
              {inputRules.length ? (
                <ul className="space-y-1">
                  {keyedRules(inputRules).map(({ key, rule }) => (
                    <li key={`in-${key}`} className="break-words">
                      {ruleSummaryItem(rule, uiT)}
                    </li>
                  ))}
                </ul>
              ) : (
                uiT("None")
              )}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">{uiT("Output rules")}</dt>
            <dd className="text-sm font-medium">
              {outputRules.length ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    {outputObserveOnly ? uiT("Observe only") : uiT("Enforce · buffered output")}
                  </p>
                  <ul className="space-y-1">
                    {keyedRules(outputRules).map(({ key, rule }) => (
                      <li key={`out-${key}`} className="break-words">
                        {ruleSummaryItem(rule, uiT, outputObserveOnly)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                uiT("None")
              )}
            </dd>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <dt className="text-xs text-muted-foreground">{uiT("External input checks")}</dt>
            <dd className="text-sm">
              {activePolicy.input_detectors?.length ? (
                <DetectorPreview
                  key={`${token}:${endpoint}:${head.revision}`}
                  token={token}
                  endpoint={endpoint}
                  bindings={activePolicy.input_detectors}
                />
              ) : (
                <span className="font-medium">{uiT("None")}</span>
              )}
            </dd>
          </div>
        </dl>
      </section>
    );

  return (
    <div className="guardrails-page">
      <PageHeader title={uiT("Guardrails")} />
      <Tabs value={tab} onValueChange={selectTab} className="gap-4">
        <TabsList aria-label={uiT("Guardrails")}>
          <TabsTrigger value="policy">{uiT("Policy")}</TabsTrigger>
          <TabsTrigger value="blocked">{uiT("Blocked requests")}</TabsTrigger>
          <TabsTrigger value="history">{uiT("History")}</TabsTrigger>
        </TabsList>
        <TabsContent value="policy" className="space-y-4">
          {policyContent}
        </TabsContent>
        <TabsContent value="blocked">
          <GuardrailDenials key={`${token}:${endpoint}`} token={token} endpoint={endpoint} />
        </TabsContent>
        <TabsContent value="history" className="space-y-4">
          <GuardrailHistory
            token={token}
            endpoint={endpoint}
            canWrite={canWrite}
            onRestored={() => {
              setSaved(false);
              setReload((value) => value + 1);
            }}
          />
        </TabsContent>
      </Tabs>

      {canWrite && (loaded || editorOpen) && (
        <PolicyEditorDialog
          open={editorOpen}
          head={head}
          loadGeneration={loadGeneration}
          token={token}
          endpoint={endpoint}
          canWrite={canWrite}
          models={models}
          returnFocusRef={policyOpenerRef}
          onOpenChange={setEditorOpen}
          onSaved={(next) => {
            setHead(next);
            setSaved(true);
            setLoadGeneration((value) => value + 1);
          }}
          onReload={() => setReload((value) => value + 1)}
        />
      )}

      {loaded && head && hasTestableRules && (
        <PolicyTestDialog
          open={testOpen}
          onOpenChange={setTestOpen}
          token={token}
          endpoint={endpoint}
          policy={head.policy}
          returnFocusRef={testOpenerRef}
        />
      )}
    </div>
  );
}

export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ workspace }) => ({
    endpoint: workspace
      ? `/api/v1/workspaces/${workspace.id}/guardrails`
      : null,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function GuardrailsRoute() {
  useOptionalRouteLoaderData();
  const { workspace } = useDashboardContext();
  return (
    <ConnectGate>
      {({ token, session }) => (
        <Guardrails
          key={`${token}:${workspace?.id ?? ""}`}
          token={token}
          canWrite={session?.permissions.write === true}
        />
      )}
    </ConnectGate>
  );
}
