import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { IconArrowLeft, IconRefresh, IconSparkles } from '@tabler/icons-react';
import PageHeader from '@/components/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import ProviderLogo from '@/components/ProviderLogo';
import { catalogTitle, modelIdentity } from '@/lib/providers';
import { readLocale as readUILocale, useLocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';

export function safeText(value: string) {
  return value.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    '[internal reference]',
  );
}

export function formatModelName(value: string) {
  return catalogTitle(safeText(value));
}

export function formatModelAlias(value: string) {
  const clean = safeText(value);
  const title = catalogTitle(clean);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <ProviderLogo provider={modelIdentity({ id: clean })} size="small" />
      <span>
        {title}
        {title !== clean && <span className="sr-only"> {clean}</span>}
      </span>
    </span>
  );
}

export const stamp = (value: string) =>
  new Date(value).toLocaleString(readUILocale());

/**
 * Builds the agent handoff prompt shared by the workspace review modules.
 * Keep deployment, workspace and authorization wording aligned with the
 * empty states in Routing, Evaluations and Event subscriptions.
 */
export function agentHandoffPrompt(routeWorkspace: string, task: string) {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const origin = `${window.location.origin}${base}`;
  return `Use Niu to ${task}. Use the Niu deployment at ${origin} and workspace ${origin}/workspaces/${encodeURIComponent(routeWorkspace)}. Read ${origin}/docs/agents.md and inspect the selected workspace grants first. Verify the deployment and workspace during authorization.`;
}

export function CopyAgentPrompt({
  prompt,
  onError,
}: {
  prompt: string;
  onError: (message: string) => void;
}) {
  const { t: uiT } = useUILocale();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      onClick={() => {
        void navigator.clipboard
          .writeText(prompt)
          .then(() => setCopied(true))
          .catch(() =>
            onError('Clipboard unavailable. Read the agent workflow in Docs.'),
          );
      }}
    >
      {copied ? uiT('Copied') : uiT('Copy agent prompt')}
    </Button>
  );
}

export function ReviewEmptyState({
  title,
  description,
  icon,
  actions,
  prompt,
  onError,
}: {
  title: string;
  description: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  prompt: string;
  onError: (message: string) => void;
}) {
  const { t: uiT } = useUILocale();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {icon ?? <IconSparkles size={20} aria-hidden="true" />}
        </EmptyMedia>
        <EmptyTitle role="heading" aria-level={2}>
          {title}
        </EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center">
        {actions}
        <CopyAgentPrompt prompt={prompt} onError={onError} />
        <Button variant="outline" asChild>
          <a href={`${import.meta.env.BASE_URL}docs/agents/`} target="_blank" rel="noopener">{uiT('Agent setup guide')}</a>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function ReviewPageShell({
  title,
  actions,
  back,
  heading,
  description,
  error,
  loading,
  onRefresh,
  onRetry,
  children,
}: {
  title: string;
  actions?: ReactNode;
  back?: { to: string; label: string };
  heading?: string;
  description: ReactNode;
  error: string;
  loading: boolean;
  onRefresh: () => void;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const { t: uiT } = useUILocale();
  return (
    <section className="empty-region min-w-0 space-y-5" aria-label={title}>
      <PageHeader
        title={title}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('Refresh', '刷新')}
              disabled={loading}
              onClick={onRefresh}
            >
              <IconRefresh size={16} />
            </Button>
          </div>
        }
      />
      {back && (
        <Button variant="ghost" size="sm" asChild>
          <Link to={back.to}>
            <IconArrowLeft size={16} />
            {back.label}
          </Link>
        </Button>
      )}
      {(heading || description) && (
        <div>
          {heading && (
            <h2 className="text-xl font-semibold break-words">{heading}</h2>
          )}
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {uiT(error)}{' '}
            <Button variant="outline" size="sm" onClick={onRetry}>
              {uiT('Retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {loading ? (
        <p role="status" className="py-8 text-muted-foreground">
          {uiT('Loading workspace evidence…')}
        </p>
      ) : (
        !error && children
      )}
    </section>
  );
}
