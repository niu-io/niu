import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState } from "react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { request } from "@/features/providers/api";

import { presets, actions, contentRulesError, type ContentRule } from "./rules";

type Protocol = "chat" | "responses" | "embeddings";
type Result = {
  outcome: "allowed" | "blocked" | "indeterminate" | "clear" | "matched";
  reason: string;
  redacted: boolean;
  synthetic: true;
  enforcement: false;
  mode?: string;
  coverage?: string;
  matches?: Array<{index:number;action:"block"|"redact";pattern?:string|null;preset?:string|null}>;
};

export default function ContentRules({
  stage,
  outputMode = "buffered_full",
  rules,
  onChange,
  disabled,
  token,
  endpoint,
  showHeading = true,
}: {
  stage: "input" | "output";
  outputMode?: "buffered_full" | "observe_only";
  rules: ContentRule[];
  onChange: (rules: ContentRule[]) => void;
  disabled: boolean;
  token: string;
  endpoint: string;
  showHeading?: boolean;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const [sample, setSample] = useState("");
  const [protocol, setProtocol] = useState<Protocol>("chat");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const newPatternFocus = useRef<number | null>(null);
  const addPatternButton = useRef<HTMLButtonElement>(null);
  const restoreAddPatternFocus = useRef(false);
  useEffect(() => {
    if (restoreAddPatternFocus.current) {
      restoreAddPatternFocus.current = false;
      addPatternButton.current?.focus();
    }
  }, [rules]);
  const identity = JSON.stringify([stage, outputMode, rules, sample, protocol]);
  const latest = useRef(identity);
  latest.current = identity;
  useEffect(() => {
    pending.current?.abort();
    pending.current = null;
    setTesting(false);
    setResult(null);
    setError("");
    return () => {
      pending.current?.abort();
    };
  }, [identity]);
  const invalid = contentRulesError(rules);
  const custom = rules
    .map((rule, index) => ({ rule, index }))
    .filter((item) => item.rule.pattern !== undefined);
  function setAction(index: number, action: string) {
    onChange(
      rules.map((rule, current) =>
        current === index
          ? { ...rule, action: action as ContentRule["action"] }
          : rule,
      ),
    );
  }
  async function test() {
    if (
      testing ||
      pending.current ||
      invalid ||
      !rules.length ||
      !sample.trim()
    )
      return;
    const controller = new AbortController();
    pending.current = controller;
    const started = identity;
    setTesting(true);
    setError("");
    setResult(null);
    const body =
      stage === "input"
        ? protocol === "chat"
          ? { messages: [{ role: "user", content: sample }] }
          : { input: sample }
        : protocol === "chat"
          ? { choices: [{ message: { role: "assistant", content: sample } }] }
          : {
              output: [
                {
                  type: "message",
                  role: "assistant",
                  content: [
                    { type: "output_text", text: sample, annotations: [] },
                  ],
                },
              ],
            };
    try {
      const outcome = await request<Result>(
        token,
        `${endpoint}/${stage}-preview`,
        "POST",
        { protocol, rules, ...(stage === "output" ? { mode: outputMode } : {}), [stage === "input" ? "request" : "response"]: body },
        controller.signal,
      );
      if (
        !outcome ||
        !(stage === "output" && outputMode === "observe_only" ? ["clear", "matched", "indeterminate"] : ["allowed", "blocked", "indeterminate"]).includes(outcome.outcome) ||
        typeof outcome.redacted !== "boolean" ||
        typeof outcome.reason !== "string" ||
        outcome.synthetic !== true ||
        outcome.enforcement !== false ||
        (stage === "output" &&
          (outcome.mode !== outputMode ||
            (outputMode === "observe_only" && outcome.redacted !== false) ||
            outcome.coverage !== "local_text"))
      ) {
        throw new Error("Invalid synthetic test response.");
      }
      if (!controller.signal.aborted && latest.current === started)
        setResult(outcome);
    } catch (cause) {
      if (!controller.signal.aborted && latest.current === started)
        setError(
          cause instanceof Error ? cause.message : "Could not test the sample.",
        );
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setTesting(false);
      }
    }
  }
  const inspectionReason =
    result?.reason === "resource_limit"
      ? uiT("inspection limit exceeded")
      : result?.reason === "unsupported_content"
        ? uiT("unsupported content")
        : result?.reason === "invalid_pattern"
          ? uiT("invalid pattern")
          : uiT("inspection incomplete");
  return (
    <>
      {showHeading && (
        <h2 className="guardrails-history-title">
          {stage === "input" ? uiT("Input rules") : uiT("Output rules")}
        </h2>
      )}
      <p className="guardrails-muted">
        {stage === "input"
          ? uiT("Rules inspect supported text before sending it upstream. Requests with unsupported tools, images or opaque content are blocked.")
          : outputMode === "observe_only"
            ? uiT("Observe-only checks record matches without changing the response. Mandatory enforcement still applies. Streaming, tools, structured output and Embeddings are unsupported.")
            : uiT("Buffered full-text inspection holds the response until checks finish. Streaming, tools, structured output and Embeddings are blocked when output rules are active.")}
      </p>
      <section className="guardrails-section guardrails-content-section">
        <h3>{uiT("Patterns")}</h3>
        <p className="guardrails-muted">
          {uiT("Versioned syntax patterns. These do not detect every secret or personal detail.")}</p>
        {presets.map((preset) => {
          const matching = rules.filter((rule) => rule.preset === preset.value);
          const action = matching.some((rule) => rule.action === "block")
            ? "block"
            : "redact";
          return (
            <div key={preset.value} className="guardrails-pattern-row">
              <div className="guardrails-pattern-label">
                <Checkbox
                  id={`${stage}-${preset.value}`}
                  checked={matching.length > 0}
                  disabled={
                    disabled || (!matching.length && rules.length >= 32)
                  }
                  onCheckedChange={(checked) =>
                    onChange(
                      checked
                        ? [...rules, { preset: preset.value, action: "redact" }]
                        : rules.filter((rule) => rule.preset !== preset.value),
                    )
                  }
                />
                <Label htmlFor={`${stage}-${preset.value}`}>
                  {uiT(preset.label)}
                </Label>
              </div>
              {matching.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={disabled || (stage === "output" && outputMode === "observe_only")}
                      aria-label={uiF("{0} action", [uiT(preset.label)])}
                    >
                      {stage === "output" && outputMode === "observe_only" ? uiT("Observe") : uiT(actions[action])}
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuRadioGroup
                      value={action}
                      onValueChange={(value) =>
                        onChange(
                          rules.map((rule) =>
                            rule.preset === preset.value
                              ? {
                                  ...rule,
                                  action: value as ContentRule["action"],
                                }
                              : rule,
                          ),
                        )
                      }
                    >
                      {Object.entries(actions).map(([value, label]) => (
                        <DropdownMenuRadioItem key={value} value={value}>
                          {uiT(label)}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </section>
      <section className="guardrails-section guardrails-content-section">
        <div className="guardrails-section-heading">
          <h3>{uiT("Custom patterns")}</h3>
          <Button
            ref={addPatternButton}
            variant="outline"
            disabled={disabled || rules.length >= 32}
            onClick={() => {
              newPatternFocus.current = rules.length;
              onChange([...rules, { pattern: "", action: "redact" }]);
            }}
          >
            {uiT("Add pattern")}</Button>
        </div>
        <p className="guardrails-muted">
          {uiT("Up to 4096 UTF-8 bytes per pattern. Look-around and backreferences are unsupported.")}</p>
        {rules.length >= 32 && (
          <p className="guardrails-muted">
            {uiT("The 32-rule limit has been reached.")}</p>
        )}
        {!custom.length && (
          <p className="guardrails-muted rounded-lg border border-dashed border-border/70 bg-muted/20 px-3.5 py-2.5">{uiT("No custom patterns.")}</p>
        )}
        {custom.map(({ rule, index }, number) => (
          <div key={index} className="guardrails-custom-pattern">
            <Input
              ref={element => {
                if (element && newPatternFocus.current === index) {
                  newPatternFocus.current = null;
                  element.focus();
                }
              }}
              aria-label={uiF("Pattern {0} regex", [number + 1])}
              placeholder={uiT("Enter regex pattern")}
              maxLength={4096}
              value={rule.pattern}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  rules.map((current, currentIndex) =>
                    currentIndex === index
                      ? { ...current, pattern: event.target.value }
                      : current,
                  ),
                )
              }
            />
            <div className="guardrails-pattern-actions">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={disabled || (stage === "output" && outputMode === "observe_only")}
                    aria-label={uiF("Pattern {0} action", [number + 1])}
                  >
                    {stage === "output" && outputMode === "observe_only" ? uiT("Observe") : uiT(actions[rule.action])}
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup
                    value={rule.action}
                    onValueChange={(value) => setAction(index, value)}
                  >
                    {Object.entries(actions).map(([value, label]) => (
                      <DropdownMenuRadioItem key={value} value={value}>
                        {uiT(label)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                disabled={disabled}
                aria-label={uiF("Remove pattern {0}", [number + 1])}
                onClick={() => {
                  restoreAddPatternFocus.current = true;
                  onChange(rules.filter((_, current) => current !== index));
                }}
              >
                {uiT("Remove")}</Button>
            </div>
          </div>
        ))}
        {invalid && <p role="alert">{uiT(invalid)}</p>}
      </section>
      <section className="guardrails-section guardrails-content-section">
        <h3>{uiT("Test your patterns")}</h3>
        <p className="guardrails-muted">
          {uiT("Tests only the rules shown here. Use synthetic text; nothing is saved or sent to a model.")}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" aria-label={uiT("Test protocol")}>
              {protocol === "chat"
                ? "Chat"
                : protocol === "responses"
                  ? uiT("Responses")
                  : uiT("Embeddings")}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={protocol}
              onValueChange={(value) => setProtocol(value as Protocol)}
            >
              <DropdownMenuRadioItem value="chat">Chat</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="responses">
                {uiT("Responses")}</DropdownMenuRadioItem>
              {stage === "input" && (
                <DropdownMenuRadioItem value="embeddings">
                  {uiT("Embeddings")}</DropdownMenuRadioItem>
              )}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Label htmlFor={`${stage}-sample`}>{uiT("Sample text")}</Label>
        <Textarea
          className="guardrails-sample"
          id={`${stage}-sample`}
          value={sample}
          maxLength={32000}
          placeholder={uiT("Enter synthetic sample text")}
          onChange={(event) => setSample(event.target.value)}
        />
        <Button
          variant="outline"
          disabled={
            testing || Boolean(invalid) || !rules.length || !sample.trim()
          }
          onClick={() => void test()}
        >
          {testing ? uiT("Testing…") : uiT("Test patterns")}
        </Button>
        {!rules.length && <p className="guardrails-muted">{uiT("Select a pattern above to enable testing.")}</p>}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{uiT(error)}</AlertDescription>
          </Alert>
        )}
        {result && (
          <div role="status">
            <p>
              {result.outcome === "matched" ? uiT("Match observed · response unchanged") : result.outcome === "clear" ? uiT("No match observed · response unchanged") : result.outcome === "blocked"
                ? uiT("Blocked")
                : result.outcome === "indeterminate"
                  ? uiF("Not fully inspectable ({0})", [inspectionReason])
                  : result.redacted
                    ? uiT("Allowed after redaction")
                    : uiT("Allowed without redaction")}
            </p>
            {Boolean(result.matches?.length) && <div><p>{uiT("Matched rules")}</p><ul>{result.matches!.map(match => <li key={match.index}>{uiF("Rule {0} · {1}", [match.index, match.action === "block" ? uiT("Block") : uiT("Redact")])}{match.pattern ? uiF(" · pattern {0}", [match.pattern]) : match.preset ? uiF(" · preset {0}", [match.preset]) : ""}</li>)}</ul></div>}
          </div>
        )}
      </section>
    </>
  );
}
