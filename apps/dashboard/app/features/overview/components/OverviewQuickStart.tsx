import { IconChevronRight, IconRoute } from '@tabler/icons-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import AgentConnection from '@/shell/AgentConnection';
import { useLocale } from '@/shell/ui-locale';

type Step = { to: string; label: string; detail: string };

/**
 * First-use guidance for an empty workspace. It replaces the compact recent-requests
 * preview only after the workspace request summary has loaded with zero requests.
 */
export default function OverviewQuickStart({ workspaceRoot, modelsHref, canWrite, canManagePlatform, hasModels, needsApiKey = false, onCreateKey }: {
  workspaceRoot: string;
  modelsHref: string;
  canWrite: boolean;
  canManagePlatform: boolean;
  hasModels: boolean;
  needsApiKey?: boolean;
  onCreateKey?: () => void;
}) {
  const { t: uiT } = useLocale();
  const firstStep: Step & { onClick?: () => void } = hasModels
    ? canWrite
      ? { to: `${workspaceRoot}/keys`, label: uiT("Create an API key"), detail: needsApiKey ? uiT("Auto-create a Playground key or configure custom access.", "一键创建试用密钥或自定义模型权限。") : uiT("Choose the models this workspace may call."), onClick: onCreateKey }
      : { to: `${workspaceRoot}/keys`, label: uiT("Keys"), detail: uiT("Ask a workspace administrator to create or share a key.") }
    : canManagePlatform
      ? { to: '/admin', label: uiT("Open Admin setup", "打开管理后台配置"), detail: uiT("Follow the Admin setup checklist to connect Providers and make models ready.", "按管理后台上线清单接入供应商并完成模型配置。") }
      : { to: modelsHref, label: uiT("Browse models"), detail: uiT("Ask a platform administrator to make a model available.") };
  const steps: Array<Step & { onClick?: () => void }> = [
    firstStep,
    { to: '/docs/guides/api-quickstart/', label: uiT("Read the API quickstart"), detail: uiT("Use HTTP or SDK examples with your workspace key.") },
    { to: `${workspaceRoot}/executions`, label: uiT("View requests"), detail: uiT("Inspect each request after your first call.") },
  ];
  const title = uiT("Get started", "快速开始");
  const description = hasModels
    ? uiT("Your first model request will appear here.", "首次调用模型后，可在这里查看请求。")
    : uiT("A platform administrator must connect a Provider and publish models before this workspace can send requests.");
  return <Empty className="gateway-task-empty gateway-first-use border-0 bg-transparent">
    <EmptyHeader>
      <EmptyMedia variant="icon"><IconRoute aria-hidden="true" /></EmptyMedia>
      <EmptyTitle role="heading" aria-level={3}>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
    <AgentConnection />
    <div className="gateway-first-use-steps">
      {steps.map((step, index) => step.onClick ? (
        <Button key={step.to} type="button" variant="ghost" className="h-auto whitespace-normal" onClick={step.onClick} aria-label={step.label}>
          <span aria-hidden="true">{index + 1}</span>
          <strong>{step.label}</strong>
          <small>{step.detail}</small>
          <IconChevronRight size={15} aria-hidden="true" />
        </Button>
      ) : (
        <Link key={step.to} to={step.to} reloadDocument={step.to.startsWith('/docs/')} aria-label={step.label}>
          <span aria-hidden="true">{index + 1}</span>
          <strong>{step.label}</strong>
          <small>{step.detail}</small>
          <IconChevronRight size={15} aria-hidden="true" />
        </Link>
      ))}
    </div>
  </Empty>;
}
