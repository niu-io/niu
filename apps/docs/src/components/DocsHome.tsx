import { useEffect, useState, type ReactNode } from 'react';
import { IconArrowRight, IconCheck, IconCopy } from '@tabler/icons-react';
import { Button } from '../../../dashboard/app/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../dashboard/app/components/ui/table';
import type { Locale } from '../../../dashboard/app/shell/locale';

interface ContractRow {
  key: string;
  docCell: ReactNode;
  sourceCell: ReactNode;
  scope: string;
}

function DocsHomeContent({ locale }: { locale: Locale }) {
  const t = (english: string, chinese: string) =>
    locale === 'zh-CN' ? chinese : english;
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [deployment, setDeployment] = useState<string | null>(null);

  useEffect(() => {
    setDeployment(window.location.origin);
  }, []);

  const origin = deployment ?? '{ORIGIN}';
  const setupPrompt =
    locale === 'zh-CN'
      ? `请先阅读 ${origin}/llms.txt 并按照 ${origin}/docs/install.md 通过 ${origin}/connect 完成设备授权连接，随后检查 /v1/key 与 /v1/models 确认实际授权范围与可用模型后再执行操作。`
      : `Read ${origin}/llms.txt and follow ${origin}/docs/install.md to connect to Niu via ${origin}/connect, then inspect /v1/key and /v1/models to confirm granted permissions before acting.`;

  const contracts: ContractRow[] = [
    {
      key: 'index',
      docCell: <a href="/docs/agents/">{t('Discovery index', '全局机器索引')}</a>,
      sourceCell: <a href="/llms.txt">/llms.txt</a>,
      scope: t(
        'Deployment rules, connection tracks, and contract map',
        '部署规则、双轨连接方式与全局契约地图',
      ),
    },
    {
      key: 'install',
      docCell: <a href="/docs/agents/install/">{t('Install & connect', '安装与连接')}</a>,
      sourceCell: <a href="/docs/install.md">/docs/install.md</a>,
      scope: t(
        'Universal /connect device-auth, host bundles, and MCP setup',
        '通用 /connect 设备授权、原生宿主扩展包与 MCP 配置',
      ),
    },
    {
      key: 'capabilities',
      docCell: <a href="/docs/agents/capabilities/">{t('Capabilities & grants', '能力与授权')}</a>,
      sourceCell: <a href="/docs/agents.md">/docs/agents.md</a>,
      scope: t(
        '/v1/key scope check, model access boundaries, and recovery',
        '/v1/key 权限核验、模型访问边界与错误恢复',
      ),
    },
    {
      key: 'inference',
      docCell: <a href="/docs/agents/inference/">{t('Model inference', '模型推理')}</a>,
      sourceCell: <a href="/docs/inference.md">/docs/inference.md</a>,
      scope: t(
        'Chat, Responses, Messages, Gemini, Embeddings, Decisions, Video',
        '多协议推理调用与业务应用 SDK 接入',
      ),
    },
    {
      key: 'routing',
      docCell: <a href="/docs/agents/pools/">{t('Workspace routing', '工作空间路由')}</a>,
      sourceCell: <a href="/docs/routing.md">/docs/routing.md</a>,
      scope: t(
        'pool/<slug> policies, dry-run preview, revisions, and diagnostics',
        'pool/<slug> 路由策略、预演校验、乐观锁与选路诊断',
      ),
    },
    {
      key: 'evaluations',
      docCell: <a href="/docs/agents/evaluations/">{t('Evaluations', '任务评估')}</a>,
      sourceCell: <a href="/docs/evaluations.md">/docs/evaluations.md</a>,
      scope: t(
        'Request fingerprints, attributed runs, and matched comparisons',
        '请求指纹计算、归因评测记录与匹配样本对比',
      ),
    },
    {
      key: 'events',
      docCell: <a href="/docs/agents/events/">{t('Resource events', '资源事件')}</a>,
      sourceCell: <a href="/docs/events.md">/docs/events.md</a>,
      scope: t(
        'Pull event log, HMAC-SHA256 webhooks, and incident reconciliation',
        '拉取事件流、HMAC 签名 Webhook 与故障对账',
      ),
    },
    {
      key: 'rest',
      docCell: <a href="/docs/api/rest/">REST API</a>,
      sourceCell: <a href="/docs/openapi/public.json">/docs/openapi/public.json</a>,
      scope: t(
        'Generated OpenAPI request, response, and authorization schemas',
        '自动生成的 OpenAPI 请求、响应与权限契约',
      ),
    },
    {
      key: 'sdk-mcp',
      docCell: (
        <>
          <a href="/docs/api/sdk/">SDK</a>
          <span className="text-muted-foreground"> · </span>
          <a href="/docs/guides/mcp/">MCP</a>
        </>
      ),
      sourceCell: <code>@niu-io/sdk · @niu-io/mcp</code>,
      scope: t(
        'Typed TypeScript clients and local stdio MCP tool server',
        '类型化 TypeScript 客户端与本地 stdio MCP 工具服务',
      ),
    },
  ];

  async function handleCopy() {
    setCopyError(false);
    if (!navigator.clipboard) {
      setCopyError(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(setupPrompt);
      setCopied(true);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <div className="docs-home not-content">
      <header className="docs-home-launchpad-header">
        <h1 id="_top">
          {t('The Model Platform for Agents', '面向 Agent 的模型平台')}
        </h1>
        <p className="docs-home-lead">
          {t(
            'Point your coding agent at Niu to connect via browser approval, discover authorized models, configure workspace routing, evaluate outputs, and inspect usage.',
            '将编码 Agent 指向 Niu 牛元，通过浏览器审批完成连接，直接发现授权模型、配置工作空间路由、评估输出并核查用量。',
          )}
        </p>
      </header>

      <section
        className="docs-home-launchpad"
        aria-label={t('Connect your agent', '连接你的 Agent')}
      >
        <div className="docs-home-launchpad-bar">
          <div className="docs-home-launchpad-meta">
            <strong>{t('Paste into your coding agent', '粘贴给你的编码 Agent')}</strong>
            <span className="docs-home-launchpad-hosts">
              Claude Code · Codex · Cursor · Windsurf · Zed · DeepSeek Harness · MCP
            </span>
          </div>
          <div className="docs-home-launchpad-actions">
            <Button asChild variant="ghost" size="sm">
              <a href="/llms.txt">/llms.txt</a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href="/docs/agents/install/">
                {t('Install spec', '安装契约')}
              </a>
            </Button>
            <Button
              type="button"
              size="sm"
              className="docs-home-primary-cta"
              onClick={() => void handleCopy()}
            >
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              <span aria-live="polite">
                {copied ? t('Copied', '已复制') : t('Copy prompt', '复制提示词')}
              </span>
            </Button>
          </div>
        </div>
        <pre className="docs-home-setup-prompt">
          <code>{setupPrompt}</code>
        </pre>
        {copyError && (
          <p role="status">
            {t(
              'Select the prompt above to copy it manually.',
              '请选择上方提示词手动复制。',
            )}
          </p>
        )}
      </section>

      <section className="docs-home-index" aria-labelledby="contracts-heading">
        <div className="docs-home-index-head">
          <h2 id="contracts-heading">
            {t('Contracts & references', '核心契约与接口参考')}
          </h2>
          <a href="/docs/getting-started/" className="docs-home-manual-link">
            {t('Manual API key quickstart', '手动 API 密钥快速入门')}
            <IconArrowRight size={14} />
          </a>
        </div>
        <div className="docs-home-table-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-3.5">{t('Contract', '契约与参考')}</TableHead>
                <TableHead className="px-3.5">{t('Machine source', '机器可读源')}</TableHead>
                <TableHead className="px-3.5">{t('Scope', '覆盖能力')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="px-3.5 py-2.5 align-top font-medium">
                    {row.docCell}
                  </TableCell>
                  <TableCell className="px-3.5 py-2.5 align-top font-mono text-xs">
                    {row.sourceCell}
                  </TableCell>
                  <TableCell className="px-3.5 py-2.5 align-top whitespace-normal text-muted-foreground">
                    {row.scope}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
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
