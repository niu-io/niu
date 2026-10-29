import { useEffect, useState } from 'react';
import {
  IconActivityHeartbeat,
  IconArrowRight,
  IconBooks,
  IconBuildingStore,
  IconCheck,
  IconCode,
  IconCoins,
  IconCopy,
  IconGauge,
  IconKey,
  IconListDetails,
  IconLock,
  IconRobot,
  IconRocket,
  IconRoute,
  IconScale,
  IconServer,
  IconShieldCheck,
  IconSparkles,
  IconTerminal2,
  IconVideo,
} from '@tabler/icons-react';
import { Badge } from '../../../dashboard/src/components/ui/badge';
import { Button } from '../../../dashboard/src/components/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../../dashboard/src/components/ui/tabs';
import { useLocale } from '../../../dashboard/src/app/locale';

type SnippetKey = 'curl' | 'sdk' | 'openai' | 'agent';

export default function DocsHome() {
  const { t } = useLocale();
  const [origin, setOrigin] = useState('https://niu.io');
  const [activeTab, setActiveTab] = useState<SnippetKey>('curl');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      setOrigin(window.location.origin);
    }
  }, []);

  const snippets: Record<
    SnippetKey,
    { label: string; meta: string; code: string }
  > = {
    curl: {
      label: 'cURL',
      meta: t(
        'POST /v1/chat/completions · Call a model or published Model Pool slug',
        'POST /v1/chat/completions · 直接调用单模型或已发布的模型池名称',
      ),
      code: `curl ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer $NIU_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "smart-coder",
    "messages": [
      { "role": "user", "content": "Explain Rust zero-copy SSE streaming in two sentences." }
    ]
  }'`,
    },
    sdk: {
      label: 'TypeScript SDK',
      meta: t(
        '@niu-io/sdk · Typed completions, video jobs, and workspace key inspection',
        '@niu-io/sdk · 强类型模型调用、异步视频任务与工作空间额度查询',
      ),
      code: `import { NiuClient } from '@niu-io/sdk';

const niu = new NiuClient({
  baseUrl: '${origin}',
  apiKey: process.env.NIU_API_KEY,
});

const reply = await niu.chat.create({
  model: 'smart-coder',
  messages: [{ role: 'user', content: 'Summarize today’s deployment checklist.' }],
});
console.log(reply.choices[0]?.message.content);`,
    },
    openai: {
      label: 'OpenAI SDK',
      meta: t(
        'Drop-in OpenAI Python / Node compatibility · Change base_url and api_key only',
        '零改造兼容 OpenAI 官方 SDK · 仅需替换 base_url 与工作空间密钥',
      ),
      code: `from openai import OpenAI
import os

client = OpenAI(
    base_url="${origin}/v1",
    api_key=os.environ["NIU_API_KEY"],
)

resp = client.chat.completions.create(
    model="smart-coder",
    messages=[{"role": "user", "content": "Review this SQL query for index usage."}],
)
print(resp.choices[0].message.content)`,
    },
    agent: {
      label: t('Coding Agents (MCP)', '编程智能体 (MCP)'),
      meta: t(
        'Connect Claude Code, Cursor, or MCP hosts to workspace models, video, and logs',
        '将 Claude Code、Cursor 等智能体接入工作空间模型、视频生成与计费日志',
      ),
      code: `{
  "mcpServers": {
    "niu": {
      "command": "npx",
      "args": ["-y", "@niu-io/mcp"],
      "env": {
        "NIU_BASE_URL": "${origin}",
        "NIU_API_KEY": "niu_ws_your_workspace_key"
      }
    }
  }
}`,
    },
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippets[activeTab].code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const pipelineSteps = [
    {
      step: '01',
      title: t('Apps & Coding Agents', '应用与智能体接入'),
      detail: t(
        'OpenAI / Anthropic / Gemini / @niu-io/sdk / MCP',
        '兼容 OpenAI、Anthropic、Gemini、TypeScript SDK 与 MCP',
      ),
      href: '/docs/guides/api-quickstart/',
      icon: IconTerminal2,
    },
    {
      step: '02',
      title: t('Workspace Admission & Hold', '工作空间准入与额度预留'),
      detail: t(
        'Scoped API keys · Rate & concurrency guards · Pre-dispatch budget hold',
        '工作空间密钥鉴权 · 并发与速率限流 · 分发前预算冻结防透支',
      ),
      href: '/docs/concepts/request-lifecycle/',
      icon: IconLock,
    },
    {
      step: '03',
      title: t('Model Pools & Auto Failover', '模型池与智能容灾路由'),
      detail: t(
        'Custom model slug · Context/capability rules · Priority failover',
        '自定义模型名 · 按上下文与能力条件分流 · 故障自动切换',
      ),
      href: '/docs/configuration/models/#model-pools',
      icon: IconRoute,
    },
    {
      step: '04',
      title: t('Dual Billing & Audit Ledger', '双模式计费与全链路审计'),
      detail: t(
        'Pool or candidate tariff · Provider isolation · Request & margin audit',
        '统一池售价或按候选模型计费 · 商业边界隔离 · 请求日志与毛利审计',
      ),
      href: '/docs/concepts/performance-and-cost/',
      icon: IconCoins,
    },
  ];

  const quickPaths = [
    {
      badge: t('Developers', '应用开发者'),
      title: t('5-Minute Quickstart', '5 分钟快速接入'),
      description: t(
        'Get a workspace API key, discover authorized models, and send your first chat or streaming request.',
        '获取工作空间密钥，查询已授权模型目录，发起首个对话或流式推理请求。',
      ),
      href: '/docs/getting-started/',
      icon: IconRocket,
    },
    {
      badge: t('AI Architects', '架构与路由'),
      title: t('Model Pools & Routing', '模型池与路由编排'),
      description: t(
        'Combine multiple Providers under one custom model name with context rules, failover, and strategy audit.',
        '将多模型供应商组合为统一自定义模型名，配置条件分流、主备容灾与策略审计。',
      ),
      href: '/docs/configuration/models/',
      icon: IconRoute,
    },
    {
      badge: t('Platform Operators', '商业化运营'),
      title: t('Workspaces, Pricing & Credits', '多租户定价与充值计费'),
      description: t(
        'Onboard customers, publish customer tariffs, configure Stripe/WeChat Pay or grants, and enforce budgets.',
        '开通客户工作空间，发布客户销售价目表，配置充值授信与严格隔离的商业账单。',
      ),
      href: '/docs/admin/',
      icon: IconCoins,
    },
    {
      badge: t('Self-Hosting', '私有化运维'),
      title: t('Single-Container Deployment', '单容器私有化部署'),
      description: t(
        'Run the Rust gateway, web console, and documentation together on your own infrastructure with PostgreSQL.',
        '一条容器命令启动 Rust 网关、管理控制台与文档站点，数据留存自有基础设施。',
      ),
      href: '/docs/deployment/single-container/',
      icon: IconServer,
    },
  ];

  const groups = [
    {
      title: t('Connect & Build', '接入与构建'),
      subtitle: t('Integrate models, media, and coding agents', '模型推理、多媒体与智能体集成'),
      links: [
        {
          title: t('API tutorial & live console', 'API 教程与在线调试'),
          description: t(
            'Test live workspace requests right inside the browser and inspect headers.',
            '在文档页内直接使用工作空间密钥发起真实请求并查看响应头。',
          ),
          href: '/docs/guides/api-quickstart/',
          icon: IconKey,
        },
        {
          title: t('TypeScript SDK tutorial', 'TypeScript SDK 教程'),
          description: t(
            'Typed chat, streaming SSE, async video polling, and error handling.',
            '强类型对话补全、SSE 流式消费、异步视频轮询与结构化异常处理。',
          ),
          href: '/docs/guides/sdk-quickstart/',
          icon: IconCode,
        },
        {
          title: t('Coding agents (MCP)', '编程智能体 (MCP)'),
          description: t(
            'Expose catalog discovery, multi-model calls, and billing lookup to MCP clients.',
            '为 Claude Code 等智能体暴露模型目录、多模型对比与账单查询工具。',
          ),
          href: '/docs/guides/mcp/',
          icon: IconRobot,
        },
        {
          title: t('Generations & Video jobs', '生成工作台与视频任务'),
          description: t(
            'Saved multimodal chat threads, async video generation, and workspace materials.',
            '持久化多轮对话与异步视频生成会话，统一管理工作空间生成素材。',
          ),
          href: '/docs/reference/generations/',
          icon: IconVideo,
        },
      ],
    },
    {
      title: t('Commercialize & Govern', '商业化与平台治理'),
      subtitle: t('Run Niu as an internal hub or commercial API business', '内部中台治理与对外商业售卖'),
      links: [
        {
          title: t('Providers & supply readiness', '模型供应商与供应准入'),
          description: t(
            'Manage encrypted Provider credentials, route capabilities, and approved offers.',
            '管理加密供应商凭证、路由协议能力声明与可售供应准入状态。',
          ),
          href: '/docs/admin/suppliers/',
          icon: IconBuildingStore,
        },
        {
          title: t('Customer pricing & tariffs', '客户定价与价目表'),
          description: t(
            'Publish workspace selling prices while keeping upstream purchase costs private.',
            '发布不可变客户销售价目表，严格隔离上游采购成本与平台毛利。',
          ),
          href: '/docs/admin/pricing/',
          icon: IconCoins,
        },
        {
          title: t('Guardrails & request capacity', '安全护栏与并发限流'),
          description: t(
            'Configure input/output content policies, RPM/TPM windows, and concurrency caps.',
            '配置输入输出内容合规审查策略、速率窗口及并发容量保护。',
          ),
          href: '/docs/configuration/guardrails/',
          icon: IconShieldCheck,
        },
        {
          title: t('Customers, roles & payments', '客户开通、角色与支付'),
          description: t(
            'Provision organizations, workspace roles, credit grants, and payment gateways.',
            '管理客户组织与工作空间角色权限，配置在线充值渠道与非现金授信。',
          ),
          href: '/docs/admin/customers/',
          icon: IconSparkles,
        },
      ],
    },
    {
      title: t('Observe & Operate', '观测、安全与运维'),
      subtitle: t('Production telemetry, accounting evidence, and benchmarks', '全链路证据、账本核算与高并发运维'),
      links: [
        {
          title: t('Request logs & payload retention', '请求日志与载荷留存'),
          description: t(
            'Inspect per-attempt status, TTFT/latency, token usage, and 24h payload controls.',
            '追踪每次上游尝试的状态码、耗时、Token 用量与可配置的载荷留存。',
          ),
          href: '/docs/concepts/execution-observation/',
          icon: IconListDetails,
        },
        {
          title: t('Usage & billing settlement', '用量核算与账本结算'),
          description: t(
            'Understand pre-dispatch holds, terminal stream evidence, and recovery workers.',
            '深入了解分发前预算冻结、流式终态计量证据与异常恢复结算机制。',
          ),
          href: '/docs/concepts/performance-and-cost/',
          icon: IconActivityHeartbeat,
        },
        {
          title: t('Security & boundary model', '安全架构与数据边界'),
          description: t(
            'AES-256-GCM secret storage, commercial data isolation, and session security.',
            'AES-256-GCM 密钥加密、商业数据序列化隔离与同源会话安全机制。',
          ),
          href: '/docs/security/overview/',
          icon: IconLock,
        },
        {
          title: t('3,239 RPS gateway benchmarks', '3,239 RPS 网关基准测试'),
          description: t(
            'Reproducible throughput, tail latency, SSE streaming, and 18 MB RSS measurements.',
            '可复现的吞吐量、P99 尾延迟、SSE 流式并发与 18 MB 极低内存基准报告。',
          ),
          href: '/docs/guides/gateway-benchmarks/',
          icon: IconGauge,
        },
      ],
    },
  ];

  const references = [
    {
      badge: 'OpenAPI 3.1',
      title: t('REST API Specification', 'REST API 接口规范'),
      description: t(
        '460+ generated operations covering inference, media, Model Pools, billing, and administration.',
        '由契约自动生成的完整端点参考，涵盖模型推理、视频媒体、模型池、计费与平台管理。',
      ),
      href: '/docs/api/rest/',
      icon: IconBooks,
    },
    {
      badge: '@niu-io/sdk',
      title: t('TypeScript SDK Reference', 'TypeScript SDK 类型参考'),
      description: t(
        'Compiler-emitted classes, methods, request options, and inferred TypeScript return types.',
        '由编译器直接导出的 NiuClient、NiuAdminClient 方法签名与完整 TypeScript 类型定义。',
      ),
      href: '/docs/api/sdk/',
      icon: IconCode,
    },
    {
      badge: t('Architecture', '选型对比'),
      title: t('Compare AI Gateways', 'AI 网关选型对比'),
      description: t(
        'Side-by-side comparison of Niu, OpenRouter, New API, and LiteLLM across deployment and governance.',
        '从部署形态、性能开销与商业化治理维度全面对比 Niu 牛元、OpenRouter、New API 与 LiteLLM。',
      ),
      href: '/docs/compare/',
      icon: IconScale,
    },
  ];

  return (
    <div className="docs-home not-content">
      <header className="docs-home-hero">
        <div className="docs-home-intro">
          <div className="docs-home-pillars">
            <Badge variant="secondary" className="docs-home-pillar-badge">
              {t(
                'Full-Stack MIT Open Source · 10x Rust Gateway · Turnkey Commercialization',
                '全栈 MIT 开源 · 10 倍性能 Rust 网关 · 丰富商业化功能',
              )}
            </Badge>
          </div>
          <h1 id="_top">{t('Niu Documentation', 'Niu 牛元文档')}</h1>
          <p className="docs-home-lead">
            {t(
              'Route every model API through one high-throughput gateway, orchestrate smart Model Pools, and run multi-tenant billing out of the box.',
              '一套网关统一调度全球大模型与自定义模型池，内置多租户充值计费、权限隔离与全链路审计。',
            )}
          </p>
          <p className="docs-home-sublead">
            {t(
              'Whether you are connecting an app in five minutes, equipping coding agents via MCP, or self-hosting a commercial AI gateway for your customers, start from a verified guide below.',
              '无论您是希望 5 分钟把应用或编程智能体接入大模型，还是私有化部署一套可直接对外商业化运营的企业级 AI 网关，都可以在这里找到清晰的实操指南与接口契约。',
            )}
          </p>
          <div className="docs-home-actions">
            <Button asChild size="lg" className="docs-home-primary-cta">
              <a href="/docs/getting-started/">
                <IconRocket size={17} />
                {t('Quickstart', '快速开始')}
              </a>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <a href="/docs/deployment/single-container/">
                <IconServer size={17} />
                {t('Deploy Single Container', '单容器私有化部署')}
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="/docs/api/rest/">
                <IconBooks size={17} />
                {t('REST API Spec', 'REST 接口规范')}
              </a>
            </Button>
          </div>
        </div>

        <aside
          className="docs-home-pipeline"
          aria-label={t('Niu request lifecycle', 'Niu 牛元请求处理流水线')}
        >
          <div className="docs-home-pipeline-header">
            <span className="docs-home-pipeline-title">
              {t('How a request flows through Niu', '一次请求在 Niu 牛元中的完整生命周期')}
            </span>
            <a href="/docs/concepts/request-lifecycle/">
              {t('Architecture', '生命周期详解')}
              <IconArrowRight size={14} />
            </a>
          </div>
          <div className="docs-home-pipeline-steps">
            {pipelineSteps.map((item) => (
              <a key={item.step} href={item.href} className="docs-home-pipeline-step">
                <div className="docs-home-pipeline-icon">
                  <item.icon size={18} stroke={1.75} />
                </div>
                <div className="docs-home-pipeline-body">
                  <div className="docs-home-pipeline-row">
                    <span className="docs-home-pipeline-num">{item.step}</span>
                    <h3>{item.title}</h3>
                  </div>
                  <p>{item.detail}</p>
                </div>
              </a>
            ))}
          </div>
        </aside>
      </header>

      <section className="docs-home-paths-section" aria-labelledby="choose-path">
        <div className="docs-home-section-heading">
          <div>
            <h2 id="choose-path">{t('Choose your path', '按角色快速上手')}</h2>
            <p>
              {t(
                'Jump straight to the workflow matching what you are building or operating today.',
                '根据您当前的使用场景，直接进入对应的核心工作流。',
              )}
            </p>
          </div>
        </div>
        <div className="docs-home-paths">
          {quickPaths.map((card) => (
            <a key={card.href} href={card.href} className="docs-home-path-card">
              <div className="docs-home-path-top">
                <span className="docs-home-path-icon">
                  <card.icon size={19} stroke={1.75} />
                </span>
                <span className="docs-home-path-role">{card.badge}</span>
              </div>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
              <span className="docs-home-path-cta">
                {t('Read guide', '查看指南')}
                <IconArrowRight size={14} />
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="docs-home-request" aria-labelledby="first-request">
        <div className="docs-home-section-heading">
          <div>
            <h2 id="first-request">
              {t('Send a real request in seconds', '几秒内发起首个真实请求')}
            </h2>
            <p>
              {t(
                'Call any authorized model route or published Model Pool using your workspace API key.',
                '使用工作空间 API 密钥，零改造调用任意已授权模型路由或自定义模型池。',
              )}
            </p>
          </div>
          <a href="/docs/guides/api-quickstart/" className="docs-home-console-link">
            {t('Open interactive API console', '打开在线 API 调试台')}
            <IconArrowRight size={15} />
          </a>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            setActiveTab(val as SnippetKey);
            setCopied(false);
          }}
          className="docs-home-playground"
        >
          <div className="docs-home-playground-bar">
            <TabsList className="docs-home-tabs-list">
              {(Object.keys(snippets) as SnippetKey[]).map((key) => (
                <TabsTrigger key={key} value={key}>
                  {snippets[key].label}
                </TabsTrigger>
              ))}
            </TabsList>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="docs-home-copy-btn"
              aria-label={t('Copy code snippet', '复制代码片段')}
            >
              {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
              <span>{copied ? t('Copied', '已复制') : t('Copy', '复制代码')}</span>
            </Button>
          </div>
          {(Object.keys(snippets) as SnippetKey[]).map((key) => (
            <TabsContent key={key} value={key} className="docs-home-code-panel">
              <div className="docs-home-code-meta">{snippets[key].meta}</div>
              <pre>
                <code>{snippets[key].code}</code>
              </pre>
            </TabsContent>
          ))}
        </Tabs>
      </section>

      <section className="docs-home-directory" aria-labelledby="explore-guides">
        <div className="docs-home-section-heading">
          <div>
            <h2 id="explore-guides">{t('Explore by capability', '全栈能力指南目录')}</h2>
            <p>
              {t(
                'End-to-end guides covering application integration, commercial operations, and production reliability.',
                '覆盖应用开发集成、多租户商业化运营与生产级高可用运维的完整文档体系。',
              )}
            </p>
          </div>
        </div>
        <div className="docs-home-groups">
          {groups.map((group) => (
            <div key={group.title} className="docs-home-group-col">
              <div className="docs-home-group-head">
                <h3>{group.title}</h3>
                <p>{group.subtitle}</p>
              </div>
              <div className="docs-home-links">
                {group.links.map((link) => (
                  <a key={link.href} href={link.href} className="docs-home-topic-link">
                    <span className="docs-home-topic-icon">
                      <link.icon size={18} stroke={1.75} />
                    </span>
                    <div>
                      <h4>{link.title}</h4>
                      <p>{link.description}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="docs-home-reference" aria-labelledby="reference-contracts">
        <div className="docs-home-section-heading">
          <div>
            <h2 id="reference-contracts">
              {t('Contracts & Reference Specifications', '接口契约与技术参考')}
            </h2>
            <p>
              {t(
                'Generated directly from checked-in OpenAPI contracts and TypeScript SDK declarations.',
                '由代码仓库中的 OpenAPI 契约与 TypeScript SDK 源码自动编译生成，确保与线上实现严格一致。',
              )}
            </p>
          </div>
          <a href="/docs/openapi/public.json" className="docs-home-console-link">
            {t('Download OpenAPI JSON', '下载 OpenAPI JSON')}
            <IconArrowRight size={15} />
          </a>
        </div>
        <div className="docs-home-reference-links">
          {references.map((ref) => (
            <a key={ref.href} href={ref.href} className="docs-home-ref-card">
              <div className="docs-home-ref-top">
                <ref.icon size={20} stroke={1.75} />
                <span className="docs-home-ref-badge">{ref.badge}</span>
              </div>
              <h3>{ref.title}</h3>
              <p>{ref.description}</p>
            </a>
          ))}
        </div>
      </section>

      <footer className="docs-home-footer">
        <a href="/docs/guides/local-development/">{t('Local development', '本地源码开发')}</a>
        <a href="/docs/releases/first-release/">{t('Release qualification', '发布准入标准')}</a>
        <a href="/docs/reference/platform-audit/">{t('Platform audit logs', '平台审计日志')}</a>
        <a href="https://github.com/niu-io/niu" target="_blank" rel="noreferrer">
          GitHub (niu-io/niu)
        </a>
        <p>
          {t(
            'Niu documentation describes verified capabilities and explicit operational boundaries so you can deploy with confidence.',
            'Niu 牛元文档如实记录已验证的产品能力与明确的工程边界，助您稳健落地生产环境。',
          )}
        </p>
      </footer>
    </div>
  );
}
