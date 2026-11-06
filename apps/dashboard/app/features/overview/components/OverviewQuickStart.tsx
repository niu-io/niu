import { IconArrowUpRight, IconRoute } from '@tabler/icons-react';
import { Link } from 'react-router';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
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
  const firstStep: Step = hasModels
    ? canWrite
      ? { to: `${workspaceRoot}/keys`, label: uiT("Create an API key"), detail: uiT("Choose the models this workspace may call.") }
      : { to: `${workspaceRoot}/keys`, label: uiT("API keys"), detail: uiT("Ask a workspace administrator to create or share a key.") }
    : canManagePlatform
      ? { to: '/admin/providers', label: uiT("Connect provider"), detail: uiT("Connect a Provider and import its models.") }
      : { to: modelsHref, label: uiT("Browse models"), detail: uiT("Ask a platform administrator to make a model available.") };
  const steps: Step[] = [
    firstStep,
    { to: '/help/guides/api-quickstart/', label: uiT("Read the API quickstart"), detail: uiT("Use HTTP or SDK examples with your workspace key.") },
    { to: `${workspaceRoot}/executions`, label: uiT("View requests"), detail: uiT("Inspect each request after your first call.") },
  ];
  const title = hasModels ? uiT("Send your first request") : uiT("Make a model available");
  const description = hasModels
    ? uiT("Calls sent through Chat or your application appear here.")
    : uiT("A platform administrator must connect a Provider and publish models before this workspace can send requests.");
  return <Empty className="gateway-task-empty gateway-first-use">
    <EmptyHeader>
      <EmptyMedia variant="icon"><IconRoute aria-hidden="true" /></EmptyMedia>
      <EmptyTitle role="heading" aria-level={3}>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
    <div className="gateway-first-use-steps">
      {steps.map((step, index) => <Link key={step.to} to={step.to} aria-label={step.label}>
        <span aria-hidden="true">{index + 1}</span>
        <strong>{step.label}</strong>
        <small>{step.detail}</small>
        <IconArrowUpRight size={15} aria-hidden="true" />
      </Link>)}
    </div>
  </Empty>;
}
