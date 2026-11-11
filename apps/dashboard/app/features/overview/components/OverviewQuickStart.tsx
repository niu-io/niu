import { IconArrowUpRight, IconRoute } from '@tabler/icons-react';
import { Link } from 'react-router';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import AgentConnection from '@/shell/AgentConnection';
import { useDashboardContext } from '@/shell/dashboard-context';
import { useLocale } from '@/shell/ui-locale';

type Step = { to: string; label: string; detail: string };

/**
 * First-use guidance for an empty workspace. It replaces the compact recent-requests
 * preview only after the workspace request summary has loaded with zero requests.
 */
export default function OverviewQuickStart({ workspaceRoot, modelsHref, canWrite, canManagePlatform, hasModels }: {
  workspaceRoot: string;
  modelsHref: string;
  canWrite: boolean;
  canManagePlatform: boolean;
  hasModels: boolean;
}) {
  const { t: uiT } = useLocale();
  const context = useDashboardContext();
  const firstStep: Step = hasModels
    ? canWrite
      ? { to: `${workspaceRoot}/keys`, label: uiT("Create an API key"), detail: uiT("Choose the models this workspace may call.") }
      : { to: `${workspaceRoot}/keys`, label: uiT("API keys"), detail: uiT("Ask a workspace administrator to create or share a key.") }
    : canManagePlatform
      ? { to: '/admin/providers', label: uiT("Connect provider"), detail: uiT("Connect a Provider and import its models.") }
      : { to: modelsHref, label: uiT("Browse models"), detail: uiT("Ask a platform administrator to make a model available.") };
  const steps: Step[] = [
    firstStep,
    { to: '/docs/guides/api-quickstart/', label: uiT("Read the API quickstart"), detail: uiT("Use HTTP or SDK examples with your workspace key.") },
    { to: `${workspaceRoot}/executions`, label: uiT("View requests"), detail: uiT("Inspect each request after your first call.") },
  ];
  const title = uiT("Connect your agent", "连接你的 Agent");
  const description = hasModels
    ? uiT("Let your coding agent manage model access within your authority. Its requests and results appear here.", "让编码 Agent 在授权范围内管理模型访问，在此查看请求与结果。")
    : uiT("A platform administrator must connect a Provider and publish models before this workspace can send requests.");
  return <Empty className="gateway-task-empty gateway-first-use border-0 bg-transparent">
    <EmptyHeader>
      <EmptyMedia variant="icon"><IconRoute aria-hidden="true" /></EmptyMedia>
      <EmptyTitle role="heading" aria-level={3}>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
    <AgentConnection context={context} />
    <div className="gateway-first-use-steps">
      {steps.map((step, index) => <Link key={step.to} to={step.to} reloadDocument={step.to.startsWith('/docs/')} aria-label={step.label}>
        <span aria-hidden="true">{index + 1}</span>
        <strong>{step.label}</strong>
        <small>{step.detail}</small>
        <IconArrowUpRight size={15} aria-hidden="true" />
      </Link>)}
    </div>
  </Empty>;
}
