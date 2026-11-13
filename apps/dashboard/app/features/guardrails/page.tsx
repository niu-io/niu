import { translateUI } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams, type LoaderFunctionArgs } from "react-router";
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from "@/lib/route-data";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import ContentRules from "./ContentRules";
import ExternalDetectors, { type DetectorBinding } from "./ExternalDetectors";
import { contentRulesError, type ContentRule } from "./rules";
import GuardrailHistory from "./History";
import GuardrailDenials from "./Denials";
import ConnectGate from "@/shell/ConnectGate";
import { useDashboardContext } from "@/shell/dashboard-context";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cachedGet, markCachedStale, peekCachedGet, request, VendorRequestError } from "@/features/providers/api";
import { FormSectionSkeleton } from "@/components/PageSkeletons";
import { disambiguatedCatalogTitle } from "@/lib/providers";

type Rule = {
  mode: "inherit" | "allow_all" | "allow_list" | "deny_all";
  values?: string[];
};
type Policy = {
  schema_version: 1;
  name: string;
  models: Rule;
  providers: Rule;
  input_rules?: ContentRule[];
  input_detectors?: DetectorBinding[];
  output?: { rules: ContentRule[]; mode: "buffered_full" | "observe_only" };
  [field: string]: unknown;
};
type Head = { revision: number; policy: Policy };
type GuardrailsTab = "policy" | "blocked" | "history";
const labels = {
  inherit: "No additional restriction",
  allow_all: "Allow all",
  allow_list: "Allow selected",
  deny_all: "Block all",
};
const emptyPolicy = (): Policy => ({
  schema_version: 1,
  name: "Workspace default",
  models: { mode: "inherit" },
  providers: { mode: "inherit" },
});
function validateHead(raw: unknown): Head | null {
  if (raw === null) return null;
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    typeof (raw as Head).revision !== "number" ||
    !(raw as Head).policy ||
    typeof (raw as Head).policy !== "object" ||
    typeof (raw as Head).policy.name !== "string" ||
    !(raw as Head).policy.models ||
    !(raw as Head).policy.providers
  ) {
    throw new Error("The saved Guardrails policy could not be read.");
  }
  return raw as Head;
}

function readCachedHead(token: string, endpoint: string): { data: Head | null } | undefined {
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

function Guardrails({ token, canWrite }: { token: string; canWrite: boolean }) {
  const { t: uiT, format: uiF } = useUILocale();
  const { workspace, models } = useDashboardContext();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const tab = requestedTab(searchParams.get("tab"));
  const endpoint = workspace
    ? `/api/v1/organizations/${workspace.organization_id}/projects/${workspace.id}/guardrails`
    : "";
  const cachedHead = readCachedHead(token, endpoint);
  const [head, setHead] = useState<Head | null>(() => cachedHead?.data ?? null);
  const [draft, setDraft] = useState<Policy>(() => cachedHead?.data?.policy ?? emptyPolicy());
  const [loading, setLoading] = useState(() => cachedHead === undefined);
  const [loaded, setLoaded] = useState(() => cachedHead !== undefined);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [saved, setSaved] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const [search, setSearch] = useState("");
  const modelSearchRef = useRef<HTMLInputElement>(null);
  const loadedScope = useRef(`${token}:${endpoint}`);
  const lastReload = useRef(0);
  useEffect(() => {
    if (!endpoint) return;
    const controller = new AbortController();
    const nextScope = `${token}:${endpoint}`;
    if (loadedScope.current !== nextScope) {
      loadedScope.current = nextScope;
      const nextCached = readCachedHead(token, endpoint);
      setHead(nextCached?.data ?? null);
      setDraft(nextCached?.data?.policy ?? emptyPolicy());
      setLoaded(nextCached !== undefined);
      setLoading(nextCached === undefined);
      setConflicted(false);
    } else if (!loaded || reload !== lastReload.current) {
      setLoading(true);
    }
    const force = lastReload.current !== reload;
    lastReload.current = reload;
    if (force) setLoaded(false);
    setError("");
    setSaved(false);
    cachedGet<{ data: unknown }>(token, endpoint, {
      signal: controller.signal,
      force,
    })
      .then(({ data }) => {
        const verified = validateHead(data);
        if (controller.signal.aborted) return;
        setHead(verified);
        setDraft(verified?.policy ?? emptyPolicy());
        setLoaded(true);
        setConflicted(false);
      })
      .catch((cause) => {
        markCachedStale(token, endpoint);
        if (!controller.signal.aborted) {
          setLoaded(false);
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load Guardrails.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, token, reload]);
  useEffect(() => {
    if (tab !== "policy" || !loaded || !location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView?.({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, loaded, location.hash]);
  const changed =
    JSON.stringify(draft) !== JSON.stringify(head?.policy ?? emptyPolicy());
  function update(field: "models" | "providers", rule: Rule) {
    setSaved(false);
    setDraft((current) => ({ ...current, [field]: rule }));
  }
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
  async function save() {
    if (!endpoint || !canWrite || saving || loading || !loaded || conflicted) return;
    if ((draft.models.mode === 'allow_list' && !draft.models.values?.length) || (draft.providers.mode === 'allow_list' && !draft.providers.values?.length)) {
      setError('Choose at least one model or Provider when using an allow-selected restriction.');
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const result = await request<{ revision: number }>(
        token,
        endpoint,
        "PUT",
        { expected_revision: head?.revision ?? 0, policy: draft },
      );
      setHead({ revision: result.revision, policy: draft });
      setSaved(true);
    } catch (cause) {
      if (cause instanceof VendorRequestError && cause.status === 409) setConflicted(true);
      setError(
        cause instanceof VendorRequestError && cause.status === 409
          ? "This policy changed elsewhere. Reload it before saving your changes."
          : cause instanceof Error
            ? cause.message
            : "Could not save the policy.",
      );
    } finally {
      setSaving(false);
    }
  }
  const original = head?.policy ?? emptyPolicy();
  const invalidRules =
    contentRulesError(draft.input_rules ?? []) ||
    contentRulesError(draft.output?.rules ?? []) ||
    (draft.output && !draft.output.rules.length ? "Add an output rule or remove output inspection." : "");
  const invalidSections = [
    { label: uiT('Policy name'), anchor: 'policy-name', error: !draft.name.trim() ? uiT('Enter a policy name.') : '' },
    { label: uiT('Input rules'), anchor: 'input', error: contentRulesError(draft.input_rules ?? []) },
    { label: uiT('Output rules'), anchor: 'output', error: contentRulesError(draft.output?.rules ?? []) || (draft.output && !draft.output.rules.length ? uiT('Add an output rule or remove output inspection.') : '') },
  ].filter(item => item.error);
  const pendingNotice = loaded && changed && <Alert className="mb-4" role="region" aria-label={uiT("Unsaved policy changes")}><AlertDescription>
    <p>{uiT("Unsaved workspace policy changes. Saving applies every change on this page.")}</p>
    {invalidSections.length > 0 && <div className="my-2 text-destructive"><p>{uiT("Resolve these changes before saving:")}</p><ul className="list-disc pl-5">{invalidSections.map(item => <li key={item.anchor}><a className="underline underline-offset-4" href={`#${item.anchor}`}>{item.label}</a>: {uiT(item.error)}</li>)}</ul></div>}
    <Button variant="outline" size="sm" disabled={saving} onClick={()=>{setDraft(original);setError('');setSaved(false);}}>{uiT("Discard all changes")}</Button>
  </AlertDescription></Alert>;
  function modeHelp(mode: Rule["mode"], kind: "models" | "providers"): string {
    if (mode === "allow_list") {
      return kind === "models"
        ? uiT("Only selected models are allowed. Key grants still apply; a request must satisfy both.")
        : uiT("Only selected Providers are allowed. Key grants still apply; a request must satisfy both.");
    }
    if (mode === "deny_all") {
      return kind === "models"
        ? uiT("All model requests are blocked regardless of key grants.")
        : uiT("All Provider requests are blocked regardless of key grants.");
    }
    return kind === "models"
      ? uiT("Key grants still apply. This policy adds no model restriction.")
      : uiT("Key grants still apply. This policy adds no Provider restriction.");
  }

  if (!workspace) return null;
  const disabledSave =
    conflicted ||
    !canWrite ||
    saving ||
    !loaded ||
    !changed ||
    !draft.name.trim() ||
    Boolean(invalidRules);
  const modelChoices = [
    ...new Set([
      ...models.map((model) => model.id),
      ...(draft.models.values ?? []),
    ]),
  ].sort();
  const providerChoices = [
    ...new Set([
      ...models
        .map((model) => model.provider)
        .filter((value): value is string => Boolean(value)),
      ...(draft.providers.values ?? []),
    ]),
  ].sort();
  const filterChoices = modelChoices.filter((model) =>
    model.toLowerCase().includes(search.toLowerCase()),
  );
  const policyContent = loading && !loaded ? (
    <FormSectionSkeleton fields={4} label={uiT("Loading Guardrails…")} />
  ) : !loaded ? (
    <Alert variant="destructive">
      <AlertDescription>
        {uiT(error || "Could not load Guardrails.")}{" "}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setReload((value) => value + 1)}
        >
          {uiT("Reload")}</Button>
      </AlertDescription>
    </Alert>
  ) : (
    <>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {uiT(error)}{" "}
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => setReload((value) => value + 1)}
            >
              {uiT("Reload")}</Button>
          </AlertDescription>
        </Alert>
      )}
      {pendingNotice}
      {saved && <p role="status">{uiT("Policy saved.")}</p>}
      {invalidRules && !changed && (
        <Alert variant="destructive">
          <AlertDescription>
            {uiT("Complete your input and output patterns before saving.")}</AlertDescription>
        </Alert>
      )}
      <div className="guardrails-policy-summary">
        <div>
          <h2>{uiT("Workspace policy")}</h2>
          <p className="guardrails-muted">{uiT(head ? "This policy applies to every workspace API key." : "When saved, this policy applies to every workspace API key.")}</p>
        </div>
        <Badge variant="secondary">
          {head ? uiF("{0} · Version {1}", [uiT("Active"), head.revision]) : uiT("Not configured")}
        </Badge>
      </div>
      <section id="policy-name" className="guardrails-section scroll-mt-24">
        <Label htmlFor="guardrail-name">{uiT("Policy name")}</Label>
        <Input
          id="guardrail-name"
          value={draft.name}
          maxLength={200}
          disabled={!canWrite || saving}
          aria-invalid={!draft.name.trim()}
          aria-describedby={!draft.name.trim() ? "guardrail-name-error" : undefined}
          onChange={(event) => {
            setSaved(false);
            setDraft((current) => ({
              ...current,
              name: event.target.value,
            }));
          }}
        />
        {!draft.name.trim() && <p id="guardrail-name-error" role="alert" className="text-sm text-destructive">{uiT("Enter a policy name.")}</p>}
      </section>
      <section
        id="access"
        className="guardrails-section guardrails-access-section guardrails-content-section scroll-mt-24"
        aria-labelledby="guardrail-access-title"
      >
        <h2 id="guardrail-access-title">{uiT("Model & Provider Access")}</h2>
        <p className="guardrails-muted">{uiT("Control which models and API providers can be used by workspace keys.")}</p>
        <div className="guardrails-access-grid">
          <div>
            <h3>{uiT("Models")}</h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  disabled={!canWrite || saving}
                  aria-label={uiT("Model restriction mode")}
                >
                  {translateUI(labels[draft.models.mode])}
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                  value={draft.models.mode}
                  onValueChange={(mode) =>
                    update("models", {
                      mode: mode as Rule["mode"],
                      ...(mode === "allow_list"
                        ? { values: draft.models.values ?? [] }
                        : {}),
                    })
                  }
                >
                  {Object.entries(labels).filter(([mode]) => mode !== 'allow_all').map(([mode, label]) => (
                    <DropdownMenuRadioItem key={mode} value={mode}>
                      {translateUI(label)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="text-sm text-muted-foreground">{modeHelp(draft.models.mode, "models")}</p>
            {draft.models.mode === "allow_list" && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" disabled={!canWrite || saving}>
                      {uiF("Choose models ({0})", [draft.models.values?.length ?? 0])}
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="guardrails-model-menu"
                  >
                    <Input
                      ref={modelSearchRef}
                      aria-label={uiT("Search models")}
                      placeholder={uiT("Search models…")}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                          event.preventDefault();
                          event.stopPropagation();
                          const items = event.currentTarget
                            .closest('[role="menu"]')
                            ?.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]:not([data-disabled])');
                          (event.key === "ArrowDown" ? items?.[0] : items?.[items.length - 1])?.focus();
                        } else if (event.key !== "Escape" && event.key !== "Tab") {
                          event.stopPropagation();
                        }
                      }}
                    />
                    {filterChoices.map((model) => {
                      const found = models.find((item) => item.id === model);
                      const hasFriendly = Boolean(found?.catalog?.name?.trim());
                      const label = found && hasFriendly ? disambiguatedCatalogTitle(found, models) : model;
                      return (
                        <DropdownMenuCheckboxItem
                          key={model}
                          checked={draft.models.values?.includes(model)}
                          onSelect={(event) => event.preventDefault()}
                          onCheckedChange={(checked) =>
                            update("models", {
                              mode: "allow_list",
                              values: checked
                                ? [...(draft.models.values ?? []), model]
                                : (draft.models.values ?? []).filter(
                                    (value) => value !== model,
                                  ),
                            })
                          }
                        >
                          <span>{label}</span>
                          {label !== model && <span className="sr-only"> {model}</span>}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                    {!filterChoices.length && (
                      <div className="p-2">
                        <p className="guardrails-muted">{uiT("No matching models.")}</p>
                        {search && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); requestAnimationFrame(() => modelSearchRef.current?.focus()); }}>{uiT("Clear search")}</Button>}
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="guardrails-muted">
                  {draft.models.values?.length
                    ? draft.models.values.map((model) => {
                        const found = models.find((item) => item.id === model);
                        const hasFriendly = Boolean(found?.catalog?.name?.trim());
                        return found && hasFriendly ? disambiguatedCatalogTitle(found, models) : model;
                      }).join(", ")
                    : uiT("No models selected. All model requests will be blocked.")}
                </p>
              </>
            )}
          </div>
          <div>
            <h3>{uiT("Providers")}</h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  disabled={!canWrite || saving}
                  aria-label={uiT("Provider restriction mode")}
                >
                  {translateUI(labels[draft.providers.mode])}
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                  value={draft.providers.mode}
                  onValueChange={(mode) =>
                    update("providers", {
                      mode: mode as Rule["mode"],
                      ...(mode === "allow_list"
                        ? { values: draft.providers.values ?? [] }
                        : {}),
                    })
                  }
                >
                  {Object.entries(labels).filter(([mode]) => mode !== 'allow_all').map(([mode, label]) => (
                    <DropdownMenuRadioItem key={mode} value={mode}>
                      {translateUI(label)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="text-sm text-muted-foreground">{modeHelp(draft.providers.mode, "providers")}</p>
            {draft.providers.mode === "allow_list" && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" disabled={!canWrite || saving}>
                      {uiF("Choose providers ({0})", [draft.providers.values?.length ?? 0])}
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {providerChoices.map((provider) => (
                      <DropdownMenuCheckboxItem
                        key={provider}
                        checked={draft.providers.values?.includes(provider)}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={(checked) =>
                          update("providers", {
                            mode: "allow_list",
                            values: checked
                              ? [...(draft.providers.values ?? []), provider]
                              : (draft.providers.values ?? []).filter(
                                  (value) => value !== provider,
                                ),
                          })
                        }
                      >
                        {provider}
                      </DropdownMenuCheckboxItem>
                    ))}
                    {!providerChoices.length && (
                      <div className="guardrails-muted space-y-1 px-2 py-1">
                        <p>{uiT("No Provider is available to this workspace's policy yet.")}</p>
                        <p>{uiT("This can mean no Provider is connected, no model route is eligible, or your role cannot see platform supply. Ask an installation administrator to confirm the workspace route and Provider access.")}</p>
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="guardrails-muted">
                  {draft.providers.values?.length
                    ? draft.providers.values.join(", ")
                    : uiT("No providers selected. All inference requests will be blocked.")}
                </p>
              </>
            )}
          </div>
        </div>
      </section>
      <section
        id="input"
        className="guardrails-section guardrails-content-section scroll-mt-24"
        aria-labelledby="guardrail-input-title"
      >
        <h2 id="guardrail-input-title">{uiT("Input rules")}</h2>
        <p className="guardrails-muted">{uiT("Block or redact matching text before sending a request.")}</p>
        <ContentRules
          showHeading={false}
          stage="input"
          rules={draft.input_rules ?? []}
          disabled={!canWrite || saving}
          token={token}
          endpoint={endpoint}
          onChange={(rules) => {
            setSaved(false);
            setDraft((current) => {
              const next = { ...current };
              if (rules.length) next.input_rules = rules;
              else delete next.input_rules;
              return next;
            });
          }}
        />
      </section>
      <section
        id="output"
        className="guardrails-section guardrails-content-section scroll-mt-24"
        aria-labelledby="guardrail-output-title"
      >
        <h2 id="guardrail-output-title">{uiT("Output rules")}</h2>
        <p className="guardrails-muted">
          {draft.output?.mode === "observe_only"
            ? uiT("Record rule matches without blocking or changing responses.")
            : uiT("Inspect complete generated text before delivery.")}
        </p>
        <p className="rounded-lg bg-muted/55 px-3.5 py-2.5 text-xs text-muted-foreground">
          {draft.output?.mode === "observe_only"
            ? uiT("Observe-only checks record matches without changing the response. Mandatory enforcement still applies. Streaming, tools, structured output and Embeddings are unsupported.")
            : uiT("Buffered full-text inspection holds the response until checks finish. Streaming, tools, structured output and Embeddings are blocked when output rules are active.")}
        </p>
        <div className="grid justify-items-start gap-2">
          <Label htmlFor="guardrail-output-mode">{uiT("Output inspection mode")}</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button id="guardrail-output-mode" variant="outline" aria-label={uiT("Output inspection mode")} disabled={!canWrite || saving}>{draft.output?.mode === "observe_only" ? uiT("Observe only") : uiT("Enforce · buffered output")}<ChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start"><DropdownMenuRadioGroup value={draft.output?.mode ?? "buffered_full"} onValueChange={(mode) => {
              setSaved(false);
              setDraft(current => ({ ...current, output: { mode: mode as "buffered_full" | "observe_only", rules: current.output?.rules ?? [] } }));
            }}>
              <DropdownMenuRadioItem value="buffered_full">{uiT("Enforce · buffered output")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="observe_only">{uiT("Observe only")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup></DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ContentRules
          showHeading={false}
          stage="output"
          outputMode={draft.output?.mode ?? "buffered_full"}
          rules={draft.output?.rules ?? []}
          disabled={!canWrite || saving}
          token={token}
          endpoint={endpoint}
          onChange={(rules) => {
            setSaved(false);
            setDraft((current) => {
              const next = { ...current };
              if (rules.length)
                next.output = { mode: current.output?.mode ?? "buffered_full", rules };
              else delete next.output;
              return next;
            });
          }}
        />
      </section>
      <section
        id="detectors"
        className="guardrails-section guardrails-content-section scroll-mt-24"
        aria-labelledby="guardrail-detectors-title"
      >
        <h2 id="guardrail-detectors-title">{uiT("External input checks")}</h2>
        <p className="guardrails-muted">{uiT("Review processing conditions and require a configured detector.")}</p>
        <ExternalDetectors
          key={`${token}:${endpoint}`}
          token={token}
          endpoint={endpoint}
          bindings={draft.input_detectors ?? []}
          disabled={!canWrite || saving}
          onChange={bindings => {
            setSaved(false);
            setDraft(current => {
              const next = { ...current };
              if (bindings.length) next.input_detectors = bindings;
              else delete next.input_detectors;
              return next;
            });
          }}
        />
      </section>
    </>
  );

  return (
    <div className="guardrails-page">
      <PageHeader
        title={uiT("Guardrails")}
        action={
          tab === "policy" && loaded ? (
            <Button disabled={disabledSave} onClick={() => void save()} aria-label={uiT("Save all changes")}>
              <span className="hidden sm:inline">{saving ? uiT("Saving…") : uiT("Save all changes")}</span>
              <span className="sm:hidden">{saving ? uiT("Saving…") : uiT("Save")}</span>
            </Button>
          ) : undefined
        }
      />
      <Tabs value={tab} onValueChange={selectTab} className="gap-4">
        <TabsList aria-label={uiT("Guardrails")}>
          <TabsTrigger
            value="policy"
            aria-label={loaded && changed ? `${uiT("Policy")}, ${uiT("Unsaved changes")}` : uiT("Policy")}
          >
            {uiT("Policy")}
            {loaded && changed && (
              <>
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="sr-only">{uiT("Unsaved changes")}</span>
              </>
            )}
          </TabsTrigger>
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
          {changed && <p className="text-sm text-muted-foreground">{uiT("Save or discard your draft before restoring another policy version.")}</p>}
          <GuardrailHistory token={token} endpoint={endpoint} canWrite={canWrite && !changed} onRestored={()=>{setSaved(false);setReload(value=>value+1);}} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ workspace }) => ({
    endpoint: workspace
      ? `/api/v1/organizations/${workspace.organization_id}/projects/${workspace.id}/guardrails`
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
