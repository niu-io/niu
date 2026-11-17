import { useEffect, useRef, useState, type RefObject } from "react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import ContentRules from "./ContentRules";
import ExternalDetectors, { type DetectorBinding } from "./ExternalDetectors";
import { contentRulesError, type ContentRule } from "./rules";
import { translateUI, useLocale as useUILocale } from "@/shell/ui-locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { request, VendorRequestError } from "@/features/providers/api";
import { disambiguatedCatalogTitle } from "@/lib/providers";

export type GuardrailAccessRule = {
  mode: "inherit" | "allow_all" | "allow_list" | "deny_all";
  values?: string[];
};

export type GuardrailPolicy = {
  schema_version: 1;
  name: string;
  models: GuardrailAccessRule;
  providers: GuardrailAccessRule;
  input_rules?: ContentRule[];
  input_detectors?: DetectorBinding[];
  output?: { rules: ContentRule[]; mode: "buffered_full" | "observe_only" };
  [field: string]: unknown;
};

export type GuardrailHead = { revision: number; policy: GuardrailPolicy };

export const guardrailAccessLabels: Record<GuardrailAccessRule["mode"], string> = {
  inherit: "No additional restriction",
  allow_all: "Allow all",
  allow_list: "Allow selected",
  deny_all: "Block all",
};

export const emptyGuardrailPolicy = (): GuardrailPolicy => ({
  schema_version: 1,
  name: "Workspace default",
  models: { mode: "inherit" },
  providers: { mode: "inherit" },
});

type ModelOption = {
  id: string;
  provider?: string;
  catalog?: { name?: string | null };
};

export function PolicyEditorDialog({
  open,
  head,
  loadGeneration,
  token,
  endpoint,
  canWrite,
  models,
  returnFocusRef,
  onOpenChange,
  onSaved,
  onReload,
}: {
  open: boolean;
  head: GuardrailHead | null;
  loadGeneration: number;
  token: string;
  endpoint: string;
  canWrite: boolean;
  models: ModelOption[];
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
  onSaved: (next: GuardrailHead) => void;
  onReload: () => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const [draft, setDraft] = useState<GuardrailPolicy>(() => head?.policy ?? emptyGuardrailPolicy());
  const [saving, setSaving] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const [waitingReload, setWaitingReload] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const modelSearchRef = useRef<HTMLInputElement>(null);
  const lastGeneration = useRef(loadGeneration);

  useEffect(() => {
    if (!open) return;
    setDraft(head?.policy ?? emptyGuardrailPolicy());
    setConflicted(false);
    setWaitingReload(false);
    setError("");
    setSearch("");
    lastGeneration.current = loadGeneration;
  }, [open]);

  useEffect(() => {
    if (!waitingReload || loadGeneration === lastGeneration.current) return;
    lastGeneration.current = loadGeneration;
    setDraft(head?.policy ?? emptyGuardrailPolicy());
    setConflicted(false);
    setWaitingReload(false);
    setError("");
  }, [waitingReload, loadGeneration, head]);

  const changed = JSON.stringify(draft) !== JSON.stringify(head?.policy ?? emptyGuardrailPolicy());

  function updateAccess(field: "models" | "providers", rule: GuardrailAccessRule) {
    setDraft((current) => ({ ...current, [field]: rule }));
    setError("");
  }

  function modeHelp(mode: GuardrailAccessRule["mode"], kind: "models" | "providers"): string {
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

  const invalidRules =
    contentRulesError(draft.input_rules ?? []) ||
    contentRulesError(draft.output?.rules ?? []) ||
    (draft.output && !draft.output.rules.length ? "Add an output rule or remove output inspection." : "");

  const modelChoices = [
    ...new Set([...models.map((model) => model.id), ...(draft.models.values ?? [])]),
  ].sort();

  const providerChoices = [
    ...new Set([
      ...models.map((model) => model.provider).filter((value): value is string => Boolean(value)),
      ...(draft.providers.values ?? []),
    ]),
  ].sort();

  const filterChoices = modelChoices.filter((model) =>
    model.toLowerCase().includes(search.toLowerCase()),
  );

  const disabledSave =
    conflicted ||
    waitingReload ||
    !canWrite ||
    saving ||
    (!changed && head !== null) ||
    !draft.name.trim() ||
    Boolean(invalidRules);

  async function save() {
    if (!endpoint || !canWrite || saving || conflicted) return;
    if (
      (draft.models.mode === "allow_list" && !draft.models.values?.length) ||
      (draft.providers.mode === "allow_list" && !draft.providers.values?.length)
    ) {
      setError("Choose at least one model or Provider when using an allow-selected restriction.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await request<{ revision: number }>(token, endpoint, "PUT", {
        expected_revision: head?.revision ?? 0,
        policy: draft,
      });
      onSaved({ revision: result.revision, policy: draft });
      onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!saving) onOpenChange(value); }}>
      <DialogContent
        className="flex max-h-[90dvh] w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          if (returnFocusRef?.current?.isConnected) {
            event.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {head ? uiT("Edit policy", "编辑护栏策略") : uiT("Create policy")}
          </DialogTitle>
          <DialogDescription>
            {uiT(
              "Rules apply to every API key in this workspace unless pinned to another version.",
              "规则将应用于当前工作空间内的所有 API 密钥，除非某密钥固定了其他版本。",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-2 min-h-0 flex-1 space-y-6 overflow-y-auto px-2 py-1">
          <div id="policy-name" className="space-y-2">
            <Label htmlFor="guardrail-name">{uiT("Policy name")}</Label>
            <Input
              id="guardrail-name"
              value={draft.name}
              maxLength={200}
              disabled={!canWrite || saving || conflicted}
              aria-invalid={!draft.name.trim()}
              aria-describedby={!draft.name.trim() ? "guardrail-name-error" : undefined}
              onChange={(event) => {
                setError("");
                setDraft((current) => ({ ...current, name: event.target.value }));
              }}
            />
            {!draft.name.trim() && (
              <p id="guardrail-name-error" role="alert" className="text-sm text-destructive">
                {uiT("Enter a policy name.")}
              </p>
            )}
          </div>

          <section id="access" className="space-y-4 border-t pt-5" aria-labelledby="guardrail-access-title">
            <div>
              <h3 id="guardrail-access-title" className="text-sm font-semibold">
                {uiT("Model & Provider Access")}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {uiT("Control which models and API providers can be used by workspace keys.")}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{uiT("Models")}</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between font-normal"
                      disabled={!canWrite || saving || conflicted}
                      aria-label={uiT("Model restriction mode")}
                    >
                      <span className="truncate">{translateUI(guardrailAccessLabels[draft.models.mode])}</span>
                      <ChevronDown className="size-4 shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuRadioGroup
                      value={draft.models.mode}
                      onValueChange={(mode) =>
                        updateAccess("models", {
                          mode: mode as GuardrailAccessRule["mode"],
                          ...(mode === "allow_list" ? { values: draft.models.values ?? [] } : {}),
                        })
                      }
                    >
                      {Object.entries(guardrailAccessLabels)
                        .filter(([mode]) => mode !== "allow_all")
                        .map(([mode, label]) => (
                          <DropdownMenuRadioItem key={mode} value={mode}>
                            {translateUI(label)}
                          </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-xs text-muted-foreground">{modeHelp(draft.models.mode, "models")}</p>
                {draft.models.mode === "allow_list" && (
                  <div className="space-y-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" disabled={!canWrite || saving || conflicted}>
                          {uiF("Choose models ({0})", [draft.models.values?.length ?? 0])}
                          <ChevronDown className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="guardrails-model-menu">
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
                                updateAccess("models", {
                                  mode: "allow_list",
                                  values: checked
                                    ? [...(draft.models.values ?? []), model]
                                    : (draft.models.values ?? []).filter((value) => value !== model),
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
                            <p className="text-xs text-muted-foreground">{uiT("No matching models.")}</p>
                            {search && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSearch("");
                                  requestAnimationFrame(() => modelSearchRef.current?.focus());
                                }}
                              >
                                {uiT("Clear search")}
                              </Button>
                            )}
                          </div>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <p className="text-xs text-muted-foreground break-words">
                      {draft.models.values?.length
                        ? draft.models.values
                            .map((model) => {
                              const found = models.find((item) => item.id === model);
                              const hasFriendly = Boolean(found?.catalog?.name?.trim());
                              return found && hasFriendly ? disambiguatedCatalogTitle(found, models) : model;
                            })
                            .join(", ")
                        : uiT("No models selected. All model requests will be blocked.")}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>{uiT("Providers")}</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between font-normal"
                      disabled={!canWrite || saving || conflicted}
                      aria-label={uiT("Provider restriction mode")}
                    >
                      <span className="truncate">{translateUI(guardrailAccessLabels[draft.providers.mode])}</span>
                      <ChevronDown className="size-4 shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuRadioGroup
                      value={draft.providers.mode}
                      onValueChange={(mode) =>
                        updateAccess("providers", {
                          mode: mode as GuardrailAccessRule["mode"],
                          ...(mode === "allow_list" ? { values: draft.providers.values ?? [] } : {}),
                        })
                      }
                    >
                      {Object.entries(guardrailAccessLabels)
                        .filter(([mode]) => mode !== "allow_all")
                        .map(([mode, label]) => (
                          <DropdownMenuRadioItem key={mode} value={mode}>
                            {translateUI(label)}
                          </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-xs text-muted-foreground">{modeHelp(draft.providers.mode, "providers")}</p>
                {draft.providers.mode === "allow_list" && (
                  <div className="space-y-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" disabled={!canWrite || saving || conflicted}>
                          {uiF("Choose providers ({0})", [draft.providers.values?.length ?? 0])}
                          <ChevronDown className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {providerChoices.map((provider) => (
                          <DropdownMenuCheckboxItem
                            key={provider}
                            checked={draft.providers.values?.includes(provider)}
                            onSelect={(event) => event.preventDefault()}
                            onCheckedChange={(checked) =>
                              updateAccess("providers", {
                                mode: "allow_list",
                                values: checked
                                  ? [...(draft.providers.values ?? []), provider]
                                  : (draft.providers.values ?? []).filter((value) => value !== provider),
                              })
                            }
                          >
                            {provider}
                          </DropdownMenuCheckboxItem>
                        ))}
                        {!providerChoices.length && (
                          <div className="space-y-1 px-2 py-1 text-xs text-muted-foreground">
                            <p>{uiT("No Provider is available to this workspace's policy yet.")}</p>
                            <p>{uiT("This can mean no Provider is connected, no model route is eligible, or your role cannot see platform supply. Ask an installation administrator to confirm the workspace route and Provider access.")}</p>
                          </div>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <p className="text-xs text-muted-foreground break-words">
                      {draft.providers.values?.length
                        ? draft.providers.values.join(", ")
                        : uiT("No providers selected. All inference requests will be blocked.")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section id="input" className="space-y-3 border-t pt-5" aria-labelledby="guardrail-input-title">
            <div>
              <h3 id="guardrail-input-title" className="text-sm font-semibold">{uiT("Input rules")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{uiT("Block or redact matching text before sending a request.")}</p>
            </div>
            <ContentRules
              showHeading={false}
              hideTester
              stage="input"
              rules={draft.input_rules ?? []}
              disabled={!canWrite || saving || conflicted}
              token={token}
              endpoint={endpoint}
              onChange={(rules) => {
                setError("");
                setDraft((current) => {
                  const next = { ...current };
                  if (rules.length) next.input_rules = rules;
                  else delete next.input_rules;
                  return next;
                });
              }}
            />
          </section>

          <section id="output" className="space-y-3 border-t pt-5" aria-labelledby="guardrail-output-title">
            <div>
              <h3 id="guardrail-output-title" className="text-sm font-semibold">{uiT("Output rules")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {draft.output?.mode === "observe_only"
                  ? uiT("Record rule matches without blocking or changing responses.")
                  : uiT("Inspect complete generated text before delivery.")}
              </p>
            </div>
            <div className="grid justify-items-start gap-2">
              <Label htmlFor="guardrail-output-mode">{uiT("Output inspection mode")}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    id="guardrail-output-mode"
                    type="button"
                    variant="outline"
                    aria-label={uiT("Output inspection mode")}
                    disabled={!canWrite || saving || conflicted}
                  >
                    {draft.output?.mode === "observe_only" ? uiT("Observe only") : uiT("Enforce · buffered output")}
                    <ChevronDown aria-hidden="true" className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup
                    value={draft.output?.mode ?? "buffered_full"}
                    onValueChange={(mode) => {
                      setError("");
                      setDraft((current) => ({
                        ...current,
                        output: {
                          mode: mode as "buffered_full" | "observe_only",
                          rules: current.output?.rules ?? [],
                        },
                      }));
                    }}
                  >
                    <DropdownMenuRadioItem value="buffered_full">{uiT("Enforce · buffered output")}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="observe_only">{uiT("Observe only")}</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <ContentRules
              showHeading={false}
              hideTester
              stage="output"
              outputMode={draft.output?.mode ?? "buffered_full"}
              rules={draft.output?.rules ?? []}
              disabled={!canWrite || saving || conflicted}
              token={token}
              endpoint={endpoint}
              onChange={(rules) => {
                setError("");
                setDraft((current) => {
                  const next = { ...current };
                  if (rules.length) next.output = { mode: current.output?.mode ?? "buffered_full", rules };
                  else delete next.output;
                  return next;
                });
              }}
            />
          </section>

          <section id="detectors" className="space-y-3 border-t pt-5" aria-labelledby="guardrail-detectors-title">
            <div>
              <h3 id="guardrail-detectors-title" className="text-sm font-semibold">{uiT("External input checks")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{uiT("Review processing conditions and require a configured detector.")}</p>
            </div>
            {open && (
              <ExternalDetectors
                key={`${token}:${endpoint}`}
                inlineConsent
                token={token}
                endpoint={endpoint}
                bindings={draft.input_detectors ?? []}
                disabled={!canWrite || saving || conflicted}
                onChange={(bindings) => {
                  setError("");
                  setDraft((current) => {
                    const next = { ...current };
                    if (bindings.length) next.input_detectors = bindings;
                    else delete next.input_detectors;
                    return next;
                  });
                }}
              />
            )}
          </section>

          {invalidRules && (
            <Alert variant="destructive">
              <AlertDescription>{uiT(invalidRules)}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{uiT(error)}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-1">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            {uiT("Cancel")}
          </Button>
          {conflicted ? (
            <Button
              type="button"
              disabled={waitingReload}
              onClick={() => {
                setWaitingReload(true);
                onReload();
              }}
            >
              {waitingReload ? uiT("Loading…") : uiT("Reload")}
            </Button>
          ) : (
            <Button type="button" disabled={disabledSave} onClick={() => void save()}>
              {saving ? uiT("Saving…") : head ? uiT("Save policy") : uiT("Create policy")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
