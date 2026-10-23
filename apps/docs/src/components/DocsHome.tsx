import { IconBooks, IconCode, IconKey, IconRoute, IconSparkles, IconVideo, IconListDetails, IconShieldCheck, IconServer } from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';
import { useLocale } from '../../../dashboard/src/app/locale';

export default function DocsHome() {
  const { t } = useLocale();
  const groups = [
    { title: t('Connect & build', '接入与构建'), links: [
      { title: t('Models & routing', '模型与路由'), description: t('Connect Providers and choose the models your applications can call.', '接入模型供应商并配置应用可调用的模型路由。'), href: '/docs/configuration/models/', icon: IconRoute },
      { title: t('API quickstart', 'API 快速上手'), description: t('Use a workspace key, discover models and send your first request.', '使用工作空间密钥发现模型并发送首个推理请求。'), href: '/docs/guides/api-quickstart/', icon: IconKey },
      { title: t('SDK quickstart', 'SDK 快速上手'), description: t('Make typed model calls and handle streaming with the JavaScript client.', '使用 JavaScript 客户端发起强类型模型调用与流式响应处理。'), href: '/docs/guides/sdk-quickstart/', icon: IconCode },
    ] },
    { title: t('Use & manage', '使用与管理'), links: [
      { title: t('Generations', '生成工作台'), description: t('Work with saved Chat and Video sessions.', '使用持久化的对话与视频生成会话。'), href: '/docs/reference/generations/', icon: IconSparkles },
      { title: t('Video generation', '视频生成'), description: t('Submit supported video jobs and manage their status and results.', '提交异步视频生成任务并追踪状态与结果。'), href: '/docs/reference/video/', icon: IconVideo },
      { title: t('Request logs', '请求日志'), description: t('Follow responses, timing, reported usage and customer charges.', '追踪每次请求的响应状态、耗时、用量上报与客户计费明细。'), href: '/docs/concepts/execution-observation/', icon: IconListDetails },
      { title: t('Guardrails', '安全护栏'), description: t('Understand supported policies and their enforcement boundaries.', '配置输入输出内容审查策略并了解执行边界。'), href: '/docs/configuration/guardrails/', icon: IconShieldCheck },
    ] },
  ];
  return <div className="docs-home not-content">
    <header className="docs-home-intro"><p className="docs-home-eyebrow">{t('Build with Niu', '基于 Niu 牛元构建')}</p><h1 id="_top">{t('Niu Documentation', 'Niu 牛元文档')}</h1><p className="docs-home-lead">{t('Connect model APIs. Manage text and video generation. Understand your usage and bill.', '统一接入模型 API，管理文本与视频生成，清晰掌握用量与账单。')}</p><p>{t('Everything you need to connect an application, manage workspace access and operate your gateway.', '提供接入应用、管理工作空间访问权限及运维网关所需的全部指南与参考。')}</p><div className="docs-home-actions"><Button asChild><a href="/docs/getting-started/">{t('Quickstart', '快速开始')}</a></Button><Button asChild variant="secondary"><a href="/docs/deployment/single-container/"><IconServer /> {t('Deploy Niu', '部署 Niu 牛元')}</a></Button></div></header>
    <section className="docs-home-request" aria-labelledby="first-request"><div className="docs-home-section-heading"><div><h2 id="first-request">{t('Start with a real request', '从真实请求开始')}</h2><p>{t('List models available to your workspace key on your running gateway.', '列出当前网关上您的工作空间密钥可调用的模型。')}</p></div><a href="/docs/guides/api-quickstart/">{t('Full API tutorial', '完整 API 教程')}</a></div><div className="docs-home-code"><span>{t('Shell · Model discovery', 'Shell · 模型发现')}</span><pre><code>{'curl http://localhost:2555/v1/models \\\n  -H "Authorization: Bearer $NIU_API_KEY"'}</code></pre></div><p className="docs-home-hint">{t('Use your gateway URL and workspace API key. Model and video availability depends on the configured routes.', '请使用您的网关地址与工作空间 API 密钥。模型与视频能力取决于已启用的路由配置。')}</p></section>
    <div className="docs-home-groups">{groups.map(group=><section key={group.title}><h2>{group.title}</h2><div className="docs-home-links">{group.links.map(link=><a key={link.href} href={link.href}><link.icon size={21} stroke={1.6} /><div><h3>{link.title}</h3><p>{link.description}</p></div></a>)}</div></section>)}</div>
    <section className="docs-home-reference"><h2>{t('Reference documentation', '参考文档')}</h2><p>{t('Generated from the API contract and SDK source, with tutorials in the Docs directory.', '由 API 契约与 SDK 源码自动生成，配合文档目录中的实操指南。')}</p><div className="docs-home-reference-links"><a href="/docs/api/rest/"><IconBooks size={22} stroke={1.6} /><div><h3>{t('REST API specification', 'REST API 规范')}</h3><p>{t('Endpoints, authentication, request and response schemas.', '端点路径、认证方式及请求与响应 Schema 定义。')}</p></div></a><a href="/docs/api/sdk/"><IconCode size={22} stroke={1.6} /><div><h3>{t('SDK interfaces & types', 'SDK 接口与类型')}</h3><p>{t('Client methods, parameters and exported TypeScript types.', '客户端方法、调用参数及导出的 TypeScript 类型参考。')}</p></div></a></div></section>
    <footer className="docs-home-footer"><a href="/docs/admin/">{t('Administration', '平台管理')}</a><a href="/docs/security/overview/">{t('Security & access', '安全与访问控制')}</a><a href="/docs/guides/local-development/">{t('Local development', '本地开发')}</a><a href="/compare/">{t('Compare Niu', '网关对比')}</a><p>{t('Niu is in active development. Guides describe supported behavior and current limitations.', 'Niu 牛元正在持续迭代中，文档如实描述当前已支持的行为与已知边界。')}</p></footer>
  </div>;
}
