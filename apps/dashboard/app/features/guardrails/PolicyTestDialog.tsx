import { useEffect, useRef, useState, type RefObject } from "react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { useLocale as useUILocale } from "@/shell/ui-locale";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { request } from "@/features/providers/api";
import type { GuardrailPolicy } from "./PolicyEditorDialog";

type Protocol = "chat" | "responses" | "embeddings";
type PreviewResult = {
  outcome: "allowed" | "blocked" | "indeterminate" | "clear" | "matched";
  reason: string;
  redacted: boolean;
  synthetic: true;
  enforcement: false;
  mode?: string;
  coverage?: string;
  matches?: Array<{ index: number; action: "block" | "redact"; pattern?: string | null; preset?: string | null }>;
};

export function PolicyTestDialog({
  open,
  onOpenChange,
  token,
  endpoint,
  policy,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  endpoint: string;
  policy: GuardrailPolicy;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const hasInput = Boolean(policy.input_rules?.length);
  const hasOutput = Boolean(policy.output?.rules.length);
  const [stage, setStage] = useState<"input" | "output">(hasInput ? "input" : "output");
  const [protocol, setProtocol] = useState<Protocol>("chat");
  const [sample, setSample] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PreviewResult | null>(null);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setStage(hasInput ? "input" : "output");
    setProtocol("chat");
    setSample("");
    setError("");
    setResult(null);
    return () => pending.current?.abort();
  }, [open, hasInput]);

  const activeRules = stage === "input" ? policy.input_rules ?? [] : policy.output?.rules ?? [];
  const outputMode = policy.output?.mode ?? "buffered_full";

  const inspectionReason =
    result?.reason === "resource_limit"
      ? uiT("inspection limit exceeded")
      : result?.reason === "unsupported_content"
        ? uiT("unsupported content")
        : result?.reason === "invalid_pattern"
          ? uiT("invalid pattern")
          : uiT("inspection incomplete");

  async function runTest() {
    if (testing || !activeRules.length || !sample.trim()) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setTesting(true);
    setError("");
    setResult(null);
    const effectiveProtocol: Protocol = stage === "output" && protocol === "embeddings" ? "chat" : protocol;
    const body =
      stage === "input"
        ? effectiveProtocol === "chat"
          ? { messages: [{ role: "user", content: sample }] }
          : { input: sample }
        : effectiveProtocol === "chat"
          ? { choices: [{ message: { role: "assistant", content: sample } }] }
          : { output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: sample, annotations: [] }] }] };
    try {
      const outcome = await request<PreviewResult>(
        token,
        `${endpoint}/${stage}-preview`,
        "POST",
        {
          protocol: effectiveProtocol,
          rules: activeRules,
          ...(stage === "output" ? { mode: outputMode } : {}),
          [stage === "input" ? "request" : "response"]: body,
        },
        controller.signal,
      );
      if (!controller.signal.aborted) setResult(outcome);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Could not test the sample.");
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setTesting(false);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!testing) onOpenChange(value); }}>
      <DialogContent
        className="w-[calc(100vw-2rem)] sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          if (returnFocusRef?.current?.isConnected) {
            event.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{uiT("Test rules", "测试规则")}</DialogTitle>
          <DialogDescription>
            {uiT("Tests only the rules shown here. Use synthetic text; nothing is saved or sent to a model.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {hasInput && hasOutput && (
              <div className="space-y-1.5">
                <Label>{uiT("Stage", "检查阶段")}</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" disabled={testing}>
                      {stage === "input" ? uiT("Input rules") : uiT("Output rules")}
                      <ChevronDown className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuRadioGroup
                      value={stage}
                      onValueChange={(value) => {
                        setStage(value as "input" | "output");
                        setResult(null);
                        setError("");
                      }}
                    >
                      <DropdownMenuRadioItem value="input">{uiT("Input rules")}</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="output">{uiT("Output rules")}</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{uiT("Test protocol")}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" disabled={testing} aria-label={uiT("Test protocol")}>
                    {protocol === "chat" ? uiT("Chat") : protocol === "responses" ? uiT("Responses") : uiT("Embeddings")}
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup value={stage === "output" && protocol === "embeddings" ? "chat" : protocol} onValueChange={(value) => setProtocol(value as Protocol)}>
                    <DropdownMenuRadioItem value="chat">{uiT("Chat")}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="responses">{uiT("Responses")}</DropdownMenuRadioItem>
                    {stage === "input" && <DropdownMenuRadioItem value="embeddings">{uiT("Embeddings")}</DropdownMenuRadioItem>}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="policy-test-sample">{uiT("Sample text")}</Label>
              {!sample.trim() && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setSample("Contact alice@example.com or use key sk-niu-demo-1234567890abcdef.")}
                >
                  {uiT("Fill example")}
                </Button>
              )}
            </div>
            <Textarea
              id="policy-test-sample"
              rows={4}
              maxLength={32000}
              value={sample}
              disabled={testing}
              placeholder={uiT("Enter synthetic sample text")}
              onChange={(event) => {
                setSample(event.target.value);
                setResult(null);
                setError("");
              }}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{uiT(error)}</AlertDescription>
            </Alert>
          )}

          {result && (
            <div role="status" className="rounded-lg bg-muted/50 p-3.5 text-sm space-y-2">
              <p className="font-medium">
                {result.outcome === "matched"
                  ? uiT("Match observed · response unchanged")
                  : result.outcome === "clear"
                    ? uiT("No match observed · response unchanged")
                    : result.outcome === "blocked"
                      ? uiT("Blocked")
                      : result.outcome === "indeterminate"
                        ? uiF("Not fully inspectable ({0})", [inspectionReason])
                        : result.redacted
                          ? uiT("Allowed after redaction")
                          : uiT("Allowed without redaction")}
              </p>
              {Boolean(result.matches?.length) && (
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {result.matches!.map((match) => (
                    <li key={match.index}>
                      {uiF("Rule {0} · {1}", [match.index, match.action === "block" ? uiT("Block") : uiT("Redact")])}
                      {match.pattern ? uiF(" · pattern {0}", [match.pattern]) : match.preset ? uiF(" · preset {0}", [match.preset]) : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={testing} onClick={() => onOpenChange(false)}>
            {uiT("Cancel")}
          </Button>
          <Button type="button" disabled={testing || !activeRules.length || !sample.trim()} onClick={() => void runTest()}>
            {testing ? uiT("Testing…") : uiT("Test patterns")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
