import { useState } from "react";
import {
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconPlugConnected,
  IconRobot,
  IconScale,
} from "@tabler/icons-react";
import { Badge } from "../../../dashboard/app/components/ui/badge";
import { Button } from "../../../dashboard/app/components/ui/button";
import type { Locale } from "../../../dashboard/app/shell/locale";
const setupPrompt =
  "Install and configure Niu by following https://niu.io/docs/install.md.";
function DocsHomeContent({ locale }: { locale: Locale }) {
  const t = (english: string, chinese: string) =>
    locale === "zh-CN" ? chinese : english;
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const references = [
    {
      href: "/docs/agents.md",
      name: t("Capability map", "能力索引"),
      detail: t("Discover authority, operations, evidence and recovery.", "发现授权范围、操作、执行证据和恢复方式。"),
    },
    {
      href: "/docs/pools.md",
      name: t("Model pools", "模型池"),
      detail: t("Preview, publish and inspect workspace model policies.", "预览、发布并审阅工作空间模型策略。"),
    },
    {
      href: "/docs/evaluations.md",
      name: t("Evaluations", "评估"),
      detail: t("Record task judgments and compare verified samples.", "记录任务评判并比较已验证的样本。"),
    },
    {
      href: "/docs/events.md",
      name: t("Resource events", "资源事件"),
      detail: t("Configure signed notifications and reconcile delivery.", "配置签名通知并核对投递结果。"),
    },
    {
      href: "/docs/api/rest/",
      name: t("REST reference", "REST 参考"),
      detail: t("Generated request, response and authorization contracts.", "自动生成的请求、响应和授权契约。"),
    },
    {
      href: "/docs/api/sdk/",
      name: t("SDK reference", "SDK 参考"),
      detail: t("Typed clients and exact interface declarations.", "类型化客户端与准确的接口声明。"),
    },
  ];
  return (
    <div className="docs-home not-content">
      <header className="docs-home-hero">
        <div className="docs-home-intro">
          <Badge variant="secondary" className="docs-home-pillar-badge">
            {t("Connect · Delegate · Review", "连接 · 交办 · 审阅")}
          </Badge>
          <h1 id="_top">
            {t("The Model Platform for Agents", "面向 Agent 的模型平台")}
          </h1>
          <p className="docs-home-lead">
            {t(
              "Tell your agent what you want to accomplish. Niu gives it model information, authorized management and execution evidence. You set the goal, approve access and review important decisions.",
              "告诉 Agent 你想完成什么。牛元提供模型信息、已授权的管理能力和执行证据；你设定目标、审核权限并审阅重要决策。",
            )}
          </p>
          <p className="docs-home-sublead">
            {t(
              "Your agent can consult the references directly. You do not need to carry model lists, JSON or diagnostics between tools.",
              "参考资料由 Agent 直接查阅，你无需在工具之间传递模型列表、JSON 或诊断信息。",
            )}
          </p>
        </div>
        <aside
          className="docs-home-pipeline"
          aria-label={t("Connect your agent", "连接你的 Agent")}
        >
          <div className="docs-home-pipeline-header">
            <strong>{t("Start with one prompt", "从一句提示词开始")}</strong>
            <a href="/docs/agents/install/">
              {t("Setup instructions", "安装说明")}
            </a>
          </div>
          <pre className="docs-home-setup-prompt">
            <code>{setupPrompt}</code>
          </pre>
          <div className="docs-home-actions">
            <Button
              className="docs-home-primary-cta"
              onClick={() => {
                setCopyError(false);
                if (!navigator.clipboard) {
                  setCopyError(true);
                  return;
                }
                void navigator.clipboard
                  .writeText(setupPrompt)
                  .then(() => setCopied(true))
                  .catch(() => setCopyError(true));
              }}
            >
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              <span aria-live="polite">
                {copied
                  ? t("Copied", "已复制")
                  : t("Copy setup prompt", "复制接入提示词")}
              </span>
            </Button>
          </div>
          <p className="docs-home-setup-note">
            {t(
              "Paste into Claude Code, Codex or DeepSeek Harness. The agent configures the integration and opens Niu for sign-in and authorization.",
              "交给 Claude Code、Codex 或 DeepSeek Harness。Agent 配置接入，并打开牛元让你登录和审核权限。",
            )}
          </p>
          {copyError && (
            <p role="status">
              {t(
                "Select the prompt above to copy it manually.",
                "请选择上方提示词手动复制。",
              )}
            </p>
          )}
        </aside>
      </header>
      <section
        className="docs-home-paths-section"
        aria-labelledby="human-entry"
      >
        <div className="docs-home-section-heading">
          <h2 id="human-entry">
            {t("One workflow is enough to start", "掌握一个流程即可开始")}
          </h2>
          <p>
            {t(
              "Niu supplies evidence and controls. Your agent owns task completion and model quality/cost decisions.",
              "牛元提供证据与控制能力。Agent 负责完成任务，并根据你的要求判断模型质量与成本取舍。",
            )}
          </p>
        </div>
        <div className="docs-home-paths">
          <a
            className="docs-home-path-card"
            href="/docs/guides/personal-assistant/"
          >
            <div className="docs-home-path-top">
              <IconPlugConnected />
              <span>{t("For people", "面向用户")}</span>
            </div>
            <h3>{t("Build with Niu", "用牛元开发")}</h3>
            <p>
              {t(
                "Connect your agent, run the source example and review a result at each checkpoint.",
                "连接 Agent，运行源码示例，在每个检查点审阅结果。",
              )}
            </p>
            <span className="docs-home-path-cta">
              {t("Start the workflow", "开始使用")}
              <IconArrowRight size={16} />
            </span>
          </a>
          <a className="docs-home-path-card" href="/docs/agents.md">
            <div className="docs-home-path-top">
              <IconRobot />
              <span>{t("For coding agents", "面向 coding agents")}</span>
            </div>
            <h3>{t("Discover and operate", "发现并操作")}</h3>
            <p>
              {t(
                "Find exact capabilities, current grants and recovery semantics as needed.",
                "按需获取准确的能力、当前授权和恢复语义。",
              )}
            </p>
            <span className="docs-home-path-cta">
              {t("Read the capability map", "读取能力索引")}
              <IconArrowRight size={16} />
            </span>
          </a>
        </div>
      </section>
      <section
        className="docs-home-reference"
        aria-labelledby="agent-references"
      >
        <div className="docs-home-section-heading">
          <h2 id="agent-references">
            {t("References for your agent", "交给 Agent 的参考资料")}
          </h2>
          <p>
            {t(
              "Exact contracts remain available for agents and expert inspection. Model trials, logs and customer-charge review remain in the dashboard.",
              "精确契约可供 Agent 与专业用户查阅。模型试用、日志和客户费用审阅仍在控制台中。",
            )}
          </p>
        </div>
        <div className="docs-home-reference-links">
          {references.map((reference) => (
            <a
              key={reference.href}
              href={reference.href}
              className="docs-home-ref-card"
            >
              <h3>{reference.name}</h3>
              <p>{reference.detail}</p>
              <IconArrowRight size={16} />
            </a>
          ))}
        </div>
      </section>
      <footer className="docs-home-footer">
        <IconScale size={16} />
        <p>
          {t(
            "Use bounded task samples and an approved budget. Unknown charges stay unknown; no platform can guarantee the best model for every task.",
            "用有限的任务样本和已批准的预算进行验证。未知费用保持未知，平台不保证为所有任务找到最优模型。",
          )}
        </p>
      </footer>
    </div>
  );
}
export default function DocsHome() {
  return (
    <>
      <div data-lang="en">
        <DocsHomeContent locale="en" />
      </div>
      <div data-lang="zh">
        <DocsHomeContent locale="zh-CN" />
      </div>
    </>
  );
}
