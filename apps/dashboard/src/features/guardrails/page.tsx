import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { IconHistory, IconShieldOff } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import ContentRules from "./ContentRules";
import ExternalDetectors, { type DetectorBinding } from "./ExternalDetectors";
import { contentRulesError, type ContentRule } from "./rules";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import GuardrailHistory from "./History";
import GuardrailDenials from "./Denials";
import ConnectGate from "@/app/ConnectGate";
import { useDashboardContext } from "@/app/dashboard-context";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { request, VendorRequestError } from "@/features/vendors/api";

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
const describe = (rule: Rule) =>
  rule.mode === "allow_list"
    ? `${rule.values?.length ?? 0} allowed`
    : labels[rule.mode];

function Guardrails({ token, canWrite }: { token: string; canWrite: boolean }) {
  const { workspace, models } = useDashboardContext();
  const { section } = useParams();
  const [head, setHead] = useState<Head | null>(null);
  const [draft, setDraft] = useState<Policy>(emptyPolicy);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const modelSearchRef = useRef<HTMLInputElement>(null);
  const endpoint = workspace
    ? `/admin/v1/organizations/${workspace.organization_id}/projects/${workspace.id}/guardrails`
    : "";
  useEffect(() => {
    if (!endpoint) return;
    const controller = new AbortController();
    setLoading(true);
    setLoaded(false);
    setError("");
    setSaved(false);
    request<{ data: Head | null }>(
      token,
      endpoint,
      "GET",
      undefined,
      controller.signal,
    )
      .then(({ data }) => {
        setHead(data);
        setDraft(data?.policy ?? emptyPolicy());
        setLoaded(true);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load Guardrails.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, token, reload]);
  const changed =
    JSON.stringify(draft) !== JSON.stringify(head?.policy ?? emptyPolicy());
  function update(field: "models" | "providers", rule: Rule) {
    setSaved(false);
    setDraft((current) => ({ ...current, [field]: rule }));
  }
  async function save() {
    if (!endpoint || !canWrite || saving || loading || !loaded) return;
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
  if (!workspace) return null;
  if (section === "denials")
    return <GuardrailDenials key={`${token}:${endpoint}`} token={token} endpoint={endpoint} />;
  if (section === "history")
    return (
      <GuardrailHistory token={token} endpoint={endpoint} canWrite={canWrite} />
    );
  if (section && !["access", "policy", "input", "output", "detectors"].includes(section))
    return <p>This Guardrails section is unavailable.</p>;
  if (loading) return <p role="status">Loading Guardrails…</p>;
  if (!loaded)
    return (
      <div className="guardrails-page">
        <PageHeader title="Guardrails" />
        <Alert variant="destructive">
          <AlertDescription>
            {error || "Could not load Guardrails."}{" "}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReload((value) => value + 1)}
            >
              Reload
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  const invalidRules =
    contentRulesError(draft.input_rules ?? []) ||
    contentRulesError(draft.output?.rules ?? []) ||
    (draft.output && !draft.output.rules.length ? "Add an output rule or remove output inspection." : "");
  const disabledSave =
    !canWrite ||
    saving ||
    !changed ||
    !draft.name.trim() ||
    Boolean(invalidRules);
  if (section === "policy")
    return (
      <div className="guardrails-page">
        <PageHeader
          title="Workspace policy"
          action={
            <Button asChild variant="outline" className="header-icon-action">
              <Link to="../history" relative="path" aria-label="History" title="History">
                <IconHistory aria-hidden="true" /><span>History</span>
              </Link>
            </Button>
          }
        />
        
        <h2 className="guardrails-history-title">
          {head?.policy.name ?? "Workspace default"}
        </h2>
        <p className="guardrails-intro">
          This policy applies to every workspace API key.
        </p>
        {changed && <p role="status">You have unsaved policy changes.</p>}
        <div className="guardrails-policy-sections">
          <Link to="../access" relative="path">
            <Card>
              <CardHeader>
                <CardTitle>Model &amp; Provider Access</CardTitle>
                <CardDescription>
                  Control which models and API services are available.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary">
                  {head &&
                  [head.policy.models, head.policy.providers].some(
                    (rule) =>
                      rule.mode === "allow_list" || rule.mode === "deny_all",
                  )
                    ? "Configured"
                    : "No restrictions"}
                </Badge>
              </CardContent>
            </Card>
          </Link>
          <Link to="../input" relative="path">
            <Card>
              <CardHeader>
                <CardTitle>Input rules</CardTitle>
                <CardDescription>
                  Block or redact matching text before sending a request.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary">
                  {head?.policy.input_rules?.length
                    ? "Configured"
                    : "Not configured"}
                </Badge>
              </CardContent>
            </Card>
          </Link>
          <Link to="../detectors" relative="path">
            <Card><CardHeader><CardTitle>External input checks</CardTitle><CardDescription>Review processing conditions and require a configured detector.</CardDescription></CardHeader><CardContent><Badge variant="secondary">{head?.policy.input_detectors?.length ? "Configured" : "Not configured"}</Badge></CardContent></Card>
          </Link>
          <Link to="../output" relative="path">
            <Card>
              <CardHeader>
                <CardTitle>Output rules</CardTitle>
                <CardDescription>
                  {head?.policy.output?.mode === "observe_only"
                    ? "Record rule matches without blocking or changing responses."
                    : "Inspect complete generated text before delivery."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary">
                  {head?.policy.output
                    ? head.policy.output.mode === "observe_only"
                      ? "Observe only"
                      : "Enforced"
                    : "Not configured"}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    );
  if (section === "detectors") return <div className="guardrails-page">
    <PageHeader title="External input checks" action={<Button disabled={disabledSave} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</Button>} />
    
    {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" size="sm" disabled={saving} onClick={() => setReload(value => value + 1)}>Reload</Button></AlertDescription></Alert>}
    {saved && <p role="status">Policy saved.</p>}
    
    <ExternalDetectors key={`${token}:${endpoint}`} token={token} endpoint={endpoint} bindings={draft.input_detectors ?? []} disabled={!canWrite || saving} onChange={bindings => { setSaved(false); setDraft(current => { const next = { ...current }; if (bindings.length) next.input_detectors = bindings; else delete next.input_detectors; return next; }); }} />
  </div>;
  if (section === "input" || section === "output")
    return (
      <div className="guardrails-page">
        <PageHeader
          title={section === "input" ? "Input rules" : "Output rules"}
          action={
            <Button disabled={disabledSave} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          }
        />
        
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error}{" "}
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => setReload((value) => value + 1)}
              >
                Reload
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {saved && <p role="status">Policy saved.</p>}
        {section === "output" && <div className="mb-6 grid justify-items-start gap-2">
          <Label htmlFor="guardrail-output-mode">Output inspection mode</Label>
          <DropdownMenu>
          <DropdownMenuTrigger asChild><Button id="guardrail-output-mode" variant="outline" aria-label="Output inspection mode" disabled={!canWrite || saving}>{draft.output?.mode === "observe_only" ? "Observe only" : "Enforce · buffered output"}<ChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start"><DropdownMenuRadioGroup value={draft.output?.mode ?? "buffered_full"} onValueChange={(mode) => {
            setSaved(false);
            setDraft(current => ({ ...current, output: { mode: mode as "buffered_full" | "observe_only", rules: current.output?.rules ?? [] } }));
          }}>
            <DropdownMenuRadioItem value="buffered_full">Enforce · buffered output</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="observe_only">Observe only</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu></div>}
        <ContentRules
          key={section}
          stage={section}
          outputMode={draft.output?.mode ?? "buffered_full"}
          rules={
            (section === "input" ? draft.input_rules : draft.output?.rules) ??
            []
          }
          disabled={!canWrite || saving}
          token={token}
          endpoint={endpoint}
          onChange={(rules) => {
            setSaved(false);
            setDraft((current) => {
              const next = { ...current };
              if (section === "input") {
                if (rules.length) next.input_rules = rules;
                else delete next.input_rules;
              } else {
                if (rules.length)
                  next.output = { mode: current.output?.mode ?? "buffered_full", rules };
                else delete next.output;
              }
              return next;
            });
          }}
        />
      </div>
    );
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
  const filterChoices =
    section === "access"
      ? modelChoices.filter((model) =>
          model.toLowerCase().includes(search.toLowerCase()),
        )
      : [];
  return (
    <div className="guardrails-page">
      <PageHeader
        title={section ? "Model & Provider Access" : "Guardrails"}
        action={
          !section ? (
            <><Button asChild variant="outline" className="header-icon-action"><Link to="denials" aria-label="Blocked requests" title="Blocked requests"><IconShieldOff aria-hidden="true" /><span>Blocked requests</span></Link></Button><Button asChild variant="outline" className="header-icon-action"><Link to="history" aria-label="History" title="History"><IconHistory aria-hidden="true" /><span>History</span></Link></Button></>
          ) : (
            <Button disabled={disabledSave} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          )
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}{" "}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReload((value) => value + 1)}
            >
              Reload
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {saved && <p role="status">Policy saved.</p>}
      {invalidRules && (
        <Alert variant="destructive">
          <AlertDescription>
            Complete your input and output patterns before saving.
          </AlertDescription>
        </Alert>
      )}
      {!section ? (
        <>
          <p className="guardrails-intro">
            Workspace policies apply to every API key. Key permissions remain
            enforced.
          </p>
          <Table className="guardrails-policy-table">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="guardrails-policy-metadata">Policies</TableHead>
                <TableHead className="guardrails-policy-metadata">API keys</TableHead>
                <TableHead className="guardrails-policy-metadata">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <Link to="policy" className="guardrails-policy-link">
                    {head?.policy.name ?? "Workspace default"}
                  </Link>
                  <p className="guardrails-muted">
                    Default policy for this workspace
                  </p>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {head ? "Active" : "Not configured"}
                  </Badge>
                </TableCell>
                <TableCell className="guardrails-policy-metadata">
                  {head ? (
                    <>
                      <p>Models: {describe(head.policy.models)}</p>
                      <p>Providers: {describe(head.policy.providers)}</p>
                    </>
                  ) : (
                    "No restrictions"
                  )}
                  {Boolean(head?.policy.input_rules?.length) && (
                    <p>Input rules</p>
                  )}
                  {Boolean(head?.policy.input_detectors?.length) && <p>Required external input checks</p>}
                  {head?.policy.output && <p>{head.policy.output.mode === "observe_only" ? "Output observation rules" : "Buffered output rules"}</p>}
                </TableCell>
                <TableCell className="guardrails-policy-metadata">All</TableCell>
                <TableCell className="guardrails-policy-metadata">
                  <Button asChild variant="outline" size="sm">
                    <Link to="policy">{canWrite ? "Configure" : "View"}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </>
      ) : (
        <>
          
          <p className="guardrails-intro">
            Control which models and API providers can be used by workspace
            keys.
          </p>
          <section className="guardrails-section">
            <Label htmlFor="guardrail-name">Policy name</Label>
            <Input
              id="guardrail-name"
              value={draft.name}
              maxLength={200}
              disabled={!canWrite || saving}
              onChange={(event) => {
                setSaved(false);
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }));
              }}
            />
          </section>
          <section
            className="guardrails-section"
            aria-labelledby="guardrail-models-title"
          >
            <h2 id="guardrail-models-title">Models</h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  disabled={!canWrite || saving}
                  aria-label="Model restriction mode"
                >
                  {labels[draft.models.mode]}
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
                  {Object.entries(labels).map(([mode, label]) => (
                    <DropdownMenuRadioItem key={mode} value={mode}>
                      {label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {draft.models.mode === "allow_list" && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" disabled={!canWrite || saving}>
                      Choose models ({draft.models.values?.length ?? 0})
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="guardrails-model-menu"
                  >
                    <Input
                      ref={modelSearchRef}
                      aria-label="Search models"
                      placeholder="Search models…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      onKeyDown={(event) => event.stopPropagation()}
                    />
                    {filterChoices.map((model) => (
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
                        {model}
                      </DropdownMenuCheckboxItem>
                    ))}
                    {!filterChoices.length && (
                      <div className="p-2">
                        <p className="guardrails-muted">No matching models.</p>
                        {search && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); requestAnimationFrame(() => modelSearchRef.current?.focus()); }}>Clear search</Button>}
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="guardrails-muted">
                  {draft.models.values?.length
                    ? draft.models.values.join(", ")
                    : "No models selected. All model requests will be blocked."}
                </p>
              </>
            )}
          </section>
          <section
            className="guardrails-section"
            aria-labelledby="guardrail-providers-title"
          >
            <h2 id="guardrail-providers-title">Providers</h2>
            <p className="guardrails-muted">
              Limit the API services used for requests.
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  disabled={!canWrite || saving}
                  aria-label="Provider restriction mode"
                >
                  {labels[draft.providers.mode]}
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
                  {Object.entries(labels).map(([mode, label]) => (
                    <DropdownMenuRadioItem key={mode} value={mode}>
                      {label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {draft.providers.mode === "allow_list" && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" disabled={!canWrite || saving}>
                      Choose providers ({draft.providers.values?.length ?? 0})
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
                      <p className="guardrails-muted">
                        No configured providers.
                      </p>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="guardrails-muted">
                  {draft.providers.values?.length
                    ? draft.providers.values.join(", ")
                    : "No providers selected. All inference requests will be blocked."}
                </p>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function GuardrailsRoute() {
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
