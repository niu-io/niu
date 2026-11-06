import { useLocation, type LoaderFunctionArgs } from 'react-router';
import EvaluationsPage, {
  clientLoader as evaluationsLoader,
  shouldRevalidate as evaluationsShouldRevalidate,
} from '@/features/evaluations/page';
import EventSubscriptionsPage, {
  clientLoader as eventSubscriptionsLoader,
} from '@/features/event-subscriptions/page';
import RoutingPage, {
  clientLoader as routingLoader,
} from '@/features/routing/page';

export type ReviewKind = 'routing' | 'evaluations' | 'events';

export function reviewKindFromPath(pathname: string): ReviewKind {
  return (
    (pathname.match(/\/(routing|evaluations|events)(?:\/|$)/)?.[1] as
      | ReviewKind
      | undefined) ?? 'routing'
  );
}

/**
 * Compatibility entry point for the existing workspace route table.
 *
 * Routing, Evaluations and Event subscriptions are independent feature modules.
 * Keep this dispatcher while routes.ts still maps all three sections to one
 * route module; each feature page exports the same loader and default
 * component contract so the route table can point at them directly without
 * further changes.
 */
export function clientLoader(args: LoaderFunctionArgs) {
  const kind = reviewKindFromPath(new URL(args.request.url).pathname);
  if (kind === 'evaluations') return evaluationsLoader(args);
  if (kind === 'events') return eventSubscriptionsLoader(args);
  return routingLoader(args);
}

export const shouldRevalidate = evaluationsShouldRevalidate;

export default function AgentReviewPage() {
  const location = useLocation();
  const kind = reviewKindFromPath(location.pathname);
  if (kind === 'evaluations') return <EvaluationsPage />;
  if (kind === 'events') return <EventSubscriptionsPage />;
  return <RoutingPage />;
}
