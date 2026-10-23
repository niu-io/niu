import { useEffect, useRef, useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import {
  NiuClient,
  NiuAPIError,
  type GenerationView,
  type Model,
} from "../../../../../sdks/javascript/src/index";
import { Button } from "../../../../dashboard/src/components/ui/button";
import { Textarea } from "../../../../dashboard/src/components/ui/textarea";
import { Label } from "../../../../dashboard/src/components/ui/label";
import {
  Alert,
  AlertDescription,
} from "../../../../dashboard/src/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "../../../../dashboard/src/components/ui/dropdown-menu";
import { useLocale } from "../../../../dashboard/src/app/locale";
import WorkspaceKeyConnection, {
  type DocsKeySelection,
} from "./WorkspaceKeyConnection";
import { displayName } from "./session";

// Only known Niu admission reasons are shown; unexpected upstream bodies may
// contain private data and are never rendered as error prose.
const admissionReasons: Record<string, string> = {
  workspace_spending_limit_exceeded: "This request exceeds the workspace spending limit.",
  key_spending_limit_exceeded: "This API key's customer spending limit is exhausted.",
  key_request_rate_disabled: "This API key's request rate is configured as zero.",
  key_request_rate_exceeded: "This API key's rolling request limit is exhausted.",
  key_token_rate_exceeded: "This API key's token budget is exhausted. Wait for known usage to expire or resolve unknown usage.",
  key_token_bound_required: "Token admission requires supported text input with an explicit output limit and bounded prior usage.",
  key_concurrency_exceeded: "This API key has reached its concurrent request limit. Wait for active work to finish or resolve uncertain requests.",
  key_ip_not_allowed: "This API key does not allow the request source address.",
  budget_exceeded: "The selected route could not admit this request under its funding configuration. Contact an administrator.",
  authentication_error: "The session or API key is invalid, expired or revoked. Sign in again or refresh access.",
  permission_denied: "The selected key or session is not permitted to make this request.",
};

const admissionReasonsZh: Record<string, string> = {
  workspace_spending_limit_exceeded: "此请求超出了工作空间的消费限额。",
  key_spending_limit_exceeded: "此 API 密钥的客户消费限额已用尽。",
  key_request_rate_disabled: "此 API 密钥的请求速率配置为零。",
  key_request_rate_exceeded: "此 API 密钥的滚动请求限额已用尽。",
  key_token_rate_exceeded: "此 API 密钥的 Token 额度已用尽。请等待已知用量窗口重置或处理未确认用量。",
  key_token_bound_required: "Token 准入控制要求提供受支持的文本输入、显式输出上限及有界的既往用量。",
  key_concurrency_exceeded: "此 API 密钥已达到并发请求上限。请等待进行中的请求完成或处理状态未明的请求。",
  key_ip_not_allowed: "此 API 密钥不允许来自当前源地址的请求。",
  budget_exceeded: "所选路由在当前预算配置下无法准入此请求，请联系管理员。",
  authentication_error: "会话或 API 密钥无效、已过期或已吊销，请重新登录或刷新权限。",
  permission_denied: "所选密钥或当前会话无权发起此请求。",
};

/** A real SDK call on this origin, using the existing session/key authorization path. */
export default function LiveApiConsole() {
  const { isZh, t } = useLocale();
  const [selection, setSelection] = useState<DocsKeySelection | null>(null);
  const [models, setModels] = useState<Model[]>([]),
    [model, setModel] = useState("");
  const [loading, setLoading] = useState(false),
    [modelError, setModelError] = useState("");
  const [modelRevision, setModelRevision] = useState(0);
  const [prompt, setPrompt] = useState("Say hello in one sentence.");
  const [output, setOutput] = useState(""),
    [error, setError] = useState("");
  const [remedy, setRemedy] = useState<{ href: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [generation, setGeneration] = useState<GenerationView | null>(null);
  const [diagnosticError, setDiagnosticError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const active = useRef<AbortController | null>(null),
    inFlight = useRef(false),
    epoch = useRef(0);
  const receipt = useRef<{ client: NiuClient; attempt: string } | null>(null);
  const keyId = selection?.keyId;
  useEffect(() => {
    const controller = new AbortController();
    epoch.current++;
    active.current?.abort();
    active.current = null;
    inFlight.current = false;
    setBusy(false);
    receipt.current = null;
    setModels([]);
    setModel("");
    setModelError("");
    setOutput("");
    setError("");
    setRemedy(null);
    setStatus("");
    setElapsed(null);
    setGeneration(null);
    setDiagnosticError("");
    setLoading(false);
    if (!keyId) return;
    setLoading(true);
    const client = new NiuClient({
      apiKey: "niu-browser-member-session",
      keyId,
      baseURL: location.origin + "/v1",
    });
    void client.models
      .list({ signal: controller.signal })
      .then((page) => {
        if (!controller.signal.aborted) {
          setModels(page.data);
          if (page.data.length > 0) {
            setModel((current) =>
              page.data.some((item) => item.id === current)
                ? current
                : page.data[0]!.id,
            );
          }
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setModelError(
            t(
              "Could not discover models for this key. Refresh access or try again.",
              "无法加载此密钥可用的模型，请刷新权限或重试。",
            ),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [keyId, modelRevision]);
  useEffect(() => () => active.current?.abort(), []);

  async function diagnostics() {
    const current = receipt.current;
    if (!current) return;
    setRefreshing(true);
    setDiagnosticError("");
    try {
      const value = await current.client.getGeneration(current.attempt);
      if (receipt.current === current) setGeneration(value.data);
    } catch {
      if (receipt.current === current)
        setDiagnosticError(
          t(
            "Saved diagnostics are unavailable. Open workspace Logs or refresh diagnostics.",
            "已保存的诊断信息暂不可用，请打开工作空间请求日志或刷新诊断信息。",
          ),
        );
    } finally {
      if (receipt.current === current) setRefreshing(false);
    }
  }
  async function run() {
    if (inFlight.current || !selection?.canWrite || !model || !prompt.trim())
      return;
    const runEpoch = ++epoch.current;
    inFlight.current = true;
    setBusy(true);
    setOutput("");
    setError("");
    setRemedy(null);
    setStatus(t("Running", "运行中"));
    setGeneration(null);
    setElapsed(null);
    setDiagnosticError("");
    receipt.current = null;
    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 120_000);
    const started = performance.now();
    let attempt: string | null = null,
      size = 0;
    const client = new NiuClient({
      apiKey: "niu-browser-member-session",
      keyId: selection.keyId,
      baseURL: location.origin + "/v1",
      fetch: async (input, init) => {
        const response = await fetch(input, {
          ...init,
          credentials: "same-origin",
          redirect: "error",
          cache: "no-store",
        });
        if (init?.method === "POST")
          attempt = response.headers.get("x-niu-attempt-id");
        return response;
      },
    });
    try {
      for await (const raw of client.chat.stream(
        {
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 64,
          stream_options: { include_usage: true },
        },
        { signal: controller.signal },
      )) {
        const chunk = raw as {
          choices?: {
            delta?: { content?: string; reasoning_content?: string };
          }[];
        };
        const text = chunk.choices?.[0]?.delta?.content;
        if (runEpoch !== epoch.current) return;
        if (typeof text === "string") {
          size += text.length;
          if (size > 65536)
            throw new Error(
              t(
                "Response exceeded the documentation display limit.",
                "响应内容超出了文档展示长度限制。",
              ),
            );
          setOutput((previous) => previous + text);
        }
      }
      if (runEpoch === epoch.current) setStatus(t("Completed", "已完成"));
    } catch (failure) {
      if (runEpoch !== epoch.current) return;
      setStatus(
        controller.signal.aborted
          ? t("Stopped · outcome may be incomplete", "已停止 · 结果可能不完整")
          : t("Failed", "失败"),
      );
      if (failure instanceof NiuAPIError) {
        attempt ??= failure.attemptId ?? null;
        const envelope = failure.responseBody as { error?: { type?: unknown } } | null;
        const type = typeof envelope?.error?.type === "string" ? envelope.error.type : "";
        const reasons = isZh ? admissionReasonsZh : admissionReasons;
        const reason = Object.hasOwn(reasons, type) ? reasons[type] : undefined;
        setError(`${reason ?? t("Request failed.", "请求失败。")} (HTTP ${failure.status}). ${attempt
          ? t("A saved attempt reference was returned. Check saved diagnostics or workspace Logs.", "已返回请求尝试记录引用，请查看已保存的诊断信息或工作空间请求日志。")
          : reason ? t("No saved attempt reference was returned.", "未返回请求尝试记录引用。") : t("No saved attempt reference was returned; the outcome is unconfirmed. Do not automatically retry.", "未返回请求尝试记录引用，结果尚未确认，请勿自动重试。")}`);
        const workspaceRoot = "/workspaces/" + encodeURIComponent(selection.workspace.slug);
        if (reason && type.startsWith("key_")) {
          setRemedy({ href: workspaceRoot + "/keys/" + encodeURIComponent(selection.keyId), label: t("Review API key limits", "查看 API 密钥限额") });
        } else if (type === "workspace_spending_limit_exceeded" || type === "budget_exceeded") {
          setRemedy({ href: workspaceRoot + "/billing", label: type === "workspace_spending_limit_exceeded" ? t("Review workspace spending limit", "查看工作空间消费限额") : t("Review workspace billing", "查看工作空间计费") });
        }
      } else setError(
        controller.signal.aborted
            ? t("Stopped waiting. Upstream work and billing may still continue; do not automatically repeat the request.", "已停止等待。上游推理与计费可能仍在继续，请勿自动重复发送请求。")
            : attempt
              ? t("The stream did not complete. Partial output is provisional; check the saved attempt before submitting again.", "流式响应未完成。部分输出仅供参考，再次提交前请先检查已保存的请求尝试。")
              : t("The request could not be confirmed. No saved attempt reference was returned; do not automatically retry.", "无法确认请求结果且未返回尝试引用，请勿自动重试。"),
      );
    } finally {
      clearTimeout(timeout);
      if (runEpoch !== epoch.current) return;
      setElapsed(Math.round(performance.now() - started));
      inFlight.current = false;
      setBusy(false);
      active.current = null;
      if (attempt) {
        receipt.current = { client, attempt };
        await diagnostics();
      }
    }
  }
  const charge = generation?.customer_charge;
  function chargeLabel() {
    if (!charge) return t("Unknown", "未知");
    if (charge.status === "owner_funded")
      return t("Personal key · billed by your upstream service", "自有密钥 · 由您的上游服务商计费");
    if (
      charge.status === "charged" &&
      charge.amount_nanos !== null &&
      charge.currency
    ) {
      const amount = BigInt(charge.amount_nanos),
        whole = amount / 1_000_000_000n,
        fraction = (amount % 1_000_000_000n)
          .toString()
          .padStart(9, "0")
          .replace(/0+$/, "");
      return charge.currency + " " + whole + (fraction ? "." + fraction : "");
    }
    return (
      (
        {
          pending: t("Pending settlement", "待结算"),
          unpriced: t("Price unavailable", "暂无定价"),
          not_charged: t("Not charged", "未计费"),
        } as Record<string, string>
      )[charge.status] || t("Unknown", "未知")
    );
  }
  return (
    <section
      className="not-content flex flex-col gap-5 rounded-lg bg-muted/30 p-4 sm:p-6"
      aria-label="Live API test"
    >
      <div>
        <h3 className="text-lg font-semibold">{t("Try a real request", "发送真实请求")}</h3>
        <p className="text-sm text-muted-foreground">
          {t(
            "Uses your selected key’s model permissions, limits and billing. A request can incur real charges. No key secret is exposed or stored in this page.",
            "使用所选密钥的模型权限、限额与计费规则。请求可能会产生真实费用，页面不会暴露或存储任何密钥明文。",
          )}
        </p>
      </div>
      <WorkspaceKeyConnection onChange={setSelection} disabled={busy} />
      {selection && (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("Model", "模型")}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="API test model"
                      disabled={busy || loading || !models.length}
                      className="max-w-64 justify-between gap-2 font-normal"
                    >
                      <span className="truncate font-medium">
                        {loading
                          ? t("Loading models…", "正在加载模型…")
                          : displayName(model, t("Choose model", "选择模型"))}
                      </span>
                      <IconChevronDown
                        size={14}
                        className="text-muted-foreground"
                      />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    collisionPadding={8}
                    align="start"
                    className="max-h-72 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto"
                  >
                    <DropdownMenuRadioGroup
                      value={model}
                      onValueChange={setModel}
                    >
                      {models.map((row) => (
                        <DropdownMenuRadioItem key={row.id} value={row.id}>
                          <span className="truncate">
                            {displayName(row.id, t("Model name unavailable", "模型名称不可用"))}
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                disabled={busy || loading}
                onClick={() => setModelRevision((value) => value + 1)}
              >
                {t("Refresh models", "刷新模型")}
              </Button>
              {loading && (
                <span role="status" className="text-xs text-muted-foreground">
                  {t("Loading models…", "正在加载模型…")}
                </span>
              )}
              {!loading && !models.length && !modelError && (
                <span className="text-xs text-muted-foreground">
                  {t("No models are currently available to this key.", "当前密钥暂无可用模型。")}
                </span>
              )}
            </div>
            {modelError && (
              <Alert variant="destructive">
                <AlertDescription>{modelError}</AlertDescription>
              </Alert>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              "Chat Completions · streaming · maximum 64 output tokens. Model discovery does not guarantee Chat or streaming support; unsupported requests return a real API error.",
              "Chat Completions · 流式输出 · 最多 64 个输出 Token。出现在模型列表中并不代表一定支持对话或流式输出；不支持的请求将返回真实 API 错误。",
            )}
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="docs-api-prompt">{t("Prompt", "提示词 (Prompt)")}</Label>
            <Textarea
              id="docs-api-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              maxLength={4000}
              disabled={busy}
              rows={3}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                busy ||
                loading ||
                !selection.canWrite ||
                !model ||
                !prompt.trim()
              }
              onClick={() => void run()}
            >
              {t("Send real request", "发送真实请求")}
            </Button>
            {busy && (
              <Button variant="outline" onClick={() => active.current?.abort()}>
                {t("Stop waiting", "停止等待")}
              </Button>
            )}
            <Button asChild variant="ghost">
              <a
                href={
                  "/workspaces/" +
                  encodeURIComponent(selection.workspace.slug) +
                  "/executions/"
                }
              >
                {t("Open request logs", "打开请求日志")}
              </a>
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
            <code>{`curl "$NIU_ORIGIN/v1/chat/completions" \\\n  -H "Authorization: Bearer $NIU_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ model: model || "your-model-alias", messages: [{ role: "user", content: prompt }], max_tokens: 64, stream: true }).replace(/'/g, "'\\''")}'`}</code>
          </pre>
        </>
      )}
      {status && (
        <div className="flex flex-col gap-3" aria-live="polite">
          <p role="status" className="text-sm font-medium">
            {status}
            {elapsed !== null
              ? isZh
                ? ` · 浏览器耗时 ${elapsed} ms`
                : " · " + elapsed + " ms in browser"
              : ""}
          </p>
          {output && (
            <pre className="whitespace-pre-wrap break-words rounded-md bg-background p-3 text-sm">
              {output}
            </pre>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                <span>{error}</span>
                {remedy && <Button variant="outline" size="sm" asChild><a href={remedy.href}>{remedy.label}</a></Button>}
              </AlertDescription>
            </Alert>
          )}
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt>{t("Input tokens", "输入 Token")}</dt>
              <dd>{generation?.usage.prompt_tokens ?? t("Unknown", "未知")}</dd>
            </div>
            <div>
              <dt>{t("Output tokens", "输出 Token")}</dt>
              <dd>{generation?.usage.completion_tokens ?? t("Unknown", "未知")}</dd>
            </div>
            <div>
              <dt>{t("Customer charge", "客户费用")}</dt>
              <dd>{chargeLabel()}</dd>
            </div>
          </dl>
          {receipt.current && (
            <Button
              variant="outline"
              disabled={busy || refreshing}
              onClick={() => void diagnostics()}
            >
              {t("Refresh saved diagnostics", "刷新已保存的诊断信息")}
            </Button>
          )}
          {diagnosticError && <p role="status">{diagnosticError}</p>}
        </div>
      )}
    </section>
  );
}
