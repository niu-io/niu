import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import {
  NiuAdminClient,
  type EventDelivery,
  type EventSubscription,
} from '@niu-io/sdk';
import ConnectGate from '@/shell/ConnectGate';
import { Badge } from '@/components/ui/badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useDashboardContext } from '@/shell/dashboard-context';
import { useLocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { fetchQuery, peekQuery } from '@/lib/query-cache';
import {
  loadCriticalRouteEndpoint,
  routeShouldRevalidate,
  useOptionalRouteLoaderData,
} from '@/lib/route-data';
import {
  agentHandoffPrompt,
  ReviewEmptyState,
  ReviewPageShell,
  safeText,
  stamp,
} from '../agent-review/shared';

const eventLabel = (value: string) =>
  value === 'pool.changed'
    ? 'Model pool changed'
    : value === 'evaluation.recorded'
      ? 'Evaluation recorded'
      : value === 'incident.opened'
        ? 'Incident opened'
        : value === 'incident.resolved'
          ? 'Incident resolved'
          : 'Unknown event';
const deliveryLabel: Record<string, string> = {
  pending: 'Pending',
  sending: 'Sending',
  delivered: 'Acknowledged',
  failed: 'Failed',
  cancelled: 'Cancelled',
};
const failureLabel: Record<string, string> = {
  http: 'HTTP error',
  transport: 'Connection failed',
  destination: 'Destination rejected',
  signature: 'Signing failed',
  authority: 'Authority unavailable',
  superseded: 'Configuration changed',
  exhausted: 'Retries exhausted',
};

export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ workspace, url, params }) => {
    if (!workspace || params.slug) {
      return { endpoint: null };
    }
    return {
      endpoint: `/api/v1/workspaces/${encodeURIComponent(workspace.id)}/events`,
      fetcher: async (signal, snapshot) => {
        const client = new NiuAdminClient({
          adminToken: snapshot.token,
          baseURL: new URL('/api/v1', url.origin).href,
        });
        const subscriptions = await client.listWorkspaceReviewSubscriptions(
          workspace.id,
          { signal },
        );
        return { data: subscriptions.data, next_after: null };
      },
    };
  });
}

export const shouldRevalidate = routeShouldRevalidate;

export default function EventSubscriptionsPage() {
  const { t: uiT } = useUILocale();
  useOptionalRouteLoaderData();
  const context = useDashboardContext();
  const params = useParams();
  return (
    <ConnectGate>
      {() =>
        context.workspace ? (
          <EventSubscriptionsView
            key={[context.token, context.workspace.id, params.slug].join(':')}
            token={context.token}
            workspace={context.workspace.id}
            routeWorkspace={params.workspace ?? 'default'}
            slug={params.slug}
          />
        ) : (
          <p role="status">
            {uiT('Choose a workspace to review its model management.')}
          </p>
        )
      }
    </ConnectGate>
  );
}

type SubscriptionDetail = {
  data: EventSubscription;
  processed_cursor: string;
  authorization_active: boolean;
};
type Detail = {
  subscription?: SubscriptionDetail;
  deliveries?: EventDelivery[];
};
type CachedListPage = {
  data: EventSubscription[];
  next_after?: string | null;
};
type CachedDetailBundle = {
  detail: Detail;
  next: string | null;
};

function EventSubscriptionsView({
  token,
  workspace,
  routeWorkspace,
  slug,
}: {
  token: string;
  workspace: string;
  routeWorkspace: string;
  slug?: string;
}) {
  const { t } = useLocale();
  const { t: uiT, format: uiF } = useUILocale();
  const client = useMemo(
    () =>
      new NiuAdminClient({
        adminToken: token,
        baseURL: new URL('/api/v1', window.location.origin).href,
      }),
    [token],
  );
  const base = `/workspaces/${encodeURIComponent(routeWorkspace)}/events`;
  const [query, setQuery] = useSearchParams();
  const after = query.get('after') ?? undefined;
  const cacheScope = token || 'public';
  const listCacheKey = `/api/v1/workspaces/${encodeURIComponent(workspace)}/events`;
  const detailCacheKey = `review:detail:${workspace}:events:${
    slug ?? ''
  }::${after ?? ''}:`;
  const initialListCached = !slug
    ? peekQuery<CachedListPage>(cacheScope, listCacheKey)
    : undefined;
  const initialDetailCached = slug
    ? peekQuery<CachedDetailBundle>(cacheScope, detailCacheKey)
    : undefined;
  const [rows, setRows] = useState<EventSubscription[]>(
    () => initialListCached?.data ?? [],
  );
  const [detail, setDetail] = useState<Detail>(
    () => initialDetailCached?.detail ?? {},
  );
  const [loading, setLoading] = useState(() =>
    slug ? !initialDetailCached : !initialListCached,
  );
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const lastRefresh = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const force = lastRefresh.current !== refresh;
    lastRefresh.current = refresh;
    setError('');
    async function load() {
      if (!slug) {
        const cached = !force
          ? peekQuery<CachedListPage>(cacheScope, listCacheKey)
          : undefined;
        if (cached && Array.isArray(cached.data)) {
          setRows(cached.data);
          setLoading(false);
        } else {
          if (!cached) setRows([]);
          setLoading(true);
        }
        const page = await fetchQuery<CachedListPage>(
          cacheScope,
          listCacheKey,
          async (signal) => {
            const subscriptions =
              await client.listWorkspaceReviewSubscriptions(workspace, {
                signal,
              });
            return { data: subscriptions.data, next_after: null };
          },
          { signal: controller.signal, force, awaitRevalidate: true },
        );
        if (!controller.signal.aborted) {
          setRows(page.data);
        }
        return;
      }

      const cachedDetail = !force
        ? peekQuery<CachedDetailBundle>(cacheScope, detailCacheKey)
        : undefined;
      if (cachedDetail) {
        setDetail(cachedDetail.detail);
        setLoading(false);
      } else {
        setDetail({});
        setLoading(true);
      }

      const bundle = await fetchQuery<CachedDetailBundle>(
        cacheScope,
        detailCacheKey,
        async (signal) => {
          const reqOpts = { signal };
          const [subscription, deliveries] = await Promise.all([
            client.getWorkspaceReviewSubscription(workspace, slug, reqOpts),
            client.getWorkspaceReviewDeliveries(workspace, slug, reqOpts),
          ]);
          return {
            detail: { subscription, deliveries: deliveries.data },
            next: null,
          };
        },
        { signal: controller.signal, force, awaitRevalidate: true },
      );
      if (!controller.signal.aborted) {
        setDetail(bundle.detail);
      }
    }
    void load()
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason?.status === 403
              ? 'Your current membership cannot read this workspace.'
              : reason?.status === 404
                ? 'This resource is unavailable in the current workspace.'
                : 'Could not load workspace evidence. Check your connection and retry.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [cacheScope, client, detailCacheKey, listCacheKey, workspace, slug, refresh]);

  const title = t('Event subscriptions', '事件订阅');
  const name = detail.subscription?.data.name;
  const revision = detail.subscription?.data.revision;
  const allowedTabs = ['configuration', 'deliveries'];
  const requestedTab = query.get('tab');
  const tab =
    requestedTab && allowedTabs.includes(requestedTab)
      ? requestedTab
      : allowedTabs[0];

  const description = error
    ? uiT('Return to the list or retry loading this resource.')
    : loading
      ? uiT('Retrieving workspace evidence…')
      : slug
        ? uiF(
            'Saved workspace configuration{0}. Your agent can make changes within its delegated authority.',
            [revision ? uiF(' · revision {0}', [revision]) : ''],
          )
        : uiT(
            'Review where workspace notifications go and whether receivers acknowledge them.',
          );

  return (
    <ReviewPageShell
      title={title}
      back={slug ? { to: base, label: title } : undefined}
      heading={slug ? (name ? safeText(name) : t('Review', '审阅')) : undefined}
      description={description}
      error={error}
      loading={loading}
      onRefresh={() => setRefresh((value) => value + 1)}
      onRetry={() => setRefresh((value) => value + 1)}
    >
      {!slug &&
        (rows.length ? (
          <Table className="block sm:table">
            <TableHeader className="hidden sm:table-header-group">
              <TableRow>
                <TableHead>{uiT('Name')}</TableHead>
                <TableHead>{uiT('State')}</TableHead>
                <TableHead>{uiT('Events')}</TableHead>
                <TableHead>{uiT('Revision')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="block sm:table-row-group">
              {rows.map((row) => (
                <TableRow
                  key={row.slug}
                  className="block py-3 sm:table-row sm:py-0"
                >
                  <TableCell className="block sm:table-cell">
                    <Link
                      className="font-medium underline-offset-4 hover:underline"
                      to={`${base}/${encodeURIComponent(row.slug)}`}
                    >
                      {safeText(row.name)}
                    </Link>
                  </TableCell>
                  <TableCell className="block whitespace-normal sm:table-cell">
                    <Badge variant={row.enabled ? 'secondary' : 'outline'}>
                      {row.enabled ? uiT('Enabled') : uiT('Disabled')}
                    </Badge>
                  </TableCell>
                  <TableCell className="block whitespace-normal break-words sm:table-cell">
                    {row.event_types
                      .map((value) => uiT(eventLabel(value)))
                      .join(', ')}
                  </TableCell>
                  <TableCell className="block sm:table-cell">
                    <span className="sm:hidden">{uiT('Revision')}: </span>
                    {row.revision}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <ReviewEmptyState
            title={uiF('No {0} yet', [title.toLowerCase()])}
            description={`${uiT('Ask your coding agent to')} ${uiT('configure an authorized notification receiver')}.`}
            prompt={agentHandoffPrompt(
              routeWorkspace,
              'configure workspace event notifications to a receiver I authorize',
            )}
            onError={setError}
          />
        ))}
      {slug && detail.subscription && (
        <Tabs
          value={tab}
          onValueChange={(value) =>
            setQuery((previous) => {
              const nextQuery = new URLSearchParams(previous);
              nextQuery.set('tab', value);
              return nextQuery;
            })
          }
        >
          <TabsList variant="line">
            <TabsTrigger value="configuration">
              {uiT('Configuration')}
            </TabsTrigger>
            <TabsTrigger value="deliveries">{uiT('Deliveries')}</TabsTrigger>
          </TabsList>
          <TabsContent value="configuration">
            <dl className="grid gap-5 py-5 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-muted-foreground">
                  {uiT('Destination')}
                </dt>
                <dd className="mt-1 break-all">
                  {safeText(detail.subscription.data.endpoint)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  {uiT('Selected events')}
                </dt>
                <dd className="mt-1">
                  {detail.subscription.data.event_types
                    .map((value) => uiT(eventLabel(value)))
                    .join(', ')}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  {uiT('Configuration')}
                </dt>
                <dd className="mt-1">
                  {detail.subscription.data.enabled
                    ? uiT('Enabled')
                    : uiT('Disabled')}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  {uiT('Current delivery authority')}
                </dt>
                <dd className="mt-1">
                  {detail.subscription.authorization_active
                    ? uiT('Active')
                    : uiT(
                        'Missing or expired — ask your agent to reconnect and explicitly update this subscription.',
                      )}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">
              {uiT(
                'Signing credentials stay private. Enabled configuration is not proof of receiver acknowledgement or an active coding-agent session.',
              )}
            </p>
          </TabsContent>
          <TabsContent value="deliveries">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{uiT('Updated')}</TableHead>
                  <TableHead>{uiT('Delivery')}</TableHead>
                  <TableHead>{uiT('Attempts')}</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>{uiT('Next action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.deliveries?.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell>{stamp(delivery.updated_at)}</TableCell>
                    <TableCell>
                      {uiT(deliveryLabel[delivery.state])}
                      {delivery.failure_kind
                        ? ` · ${uiT(failureLabel[delivery.failure_kind] ?? 'Unavailable')}`
                        : ''}
                    </TableCell>
                    <TableCell>{delivery.attempts}</TableCell>
                    <TableCell>
                      {delivery.response_status ?? uiT('Unavailable')}
                    </TableCell>
                    <TableCell>
                      {delivery.next_attempt_at
                        ? uiF('Retry {0}', [stamp(delivery.next_attempt_at)])
                        : delivery.lease_expired
                          ? uiT('Awaiting lease recovery')
                          : delivery.state === 'failed'
                            ? uiT('Ask your agent to reconcile the event log')
                            : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!detail.deliveries?.length && (
              <Empty className="min-h-60">
                <EmptyHeader>
                  <EmptyDescription>
                    {uiT(
                      'No delivery evidence yet. Ask your agent to queue a targeted subscription test.',
                    )}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            <p className="mt-3 text-sm text-muted-foreground">
              {uiT(
                'Failed deliveries require your agent to reconcile the event log and check the receiver. Latest 100 deliveries. A receiver’s 2xx acknowledges receipt, not processing or task success.',
              )}
            </p>
          </TabsContent>
        </Tabs>
      )}
    </ReviewPageShell>
  );
}
