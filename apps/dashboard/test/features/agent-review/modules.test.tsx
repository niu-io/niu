import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import EventSubscriptionsPage from '@/features/event-subscriptions/page';
import EvaluationsPage from '@/features/evaluations/page';
import RoutingPage from '@/features/routing/page';
import { reviewKindFromPath } from '@/features/agent-review/page';
import { navigation } from '@/shell/navigation';
import { clearSessionCache } from '@/lib/query-cache';

const { context } = vi.hoisted(() => ({
  context: {
    token: 'member-fixture',
    workspace: { id: '11111111-1111-4111-8111-111111111111' },
  },
}));
vi.mock('@/shell/dashboard-context', () => ({
  useDashboardContext: () => context,
}));

afterEach(() => {
  cleanup();
  clearSessionCache();
  vi.unstubAllGlobals();
});

function renderAt(
  element: React.ReactElement,
  path: string,
  routePath: string,
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

test('routing, evaluations and event subscriptions are separate workspace destinations', () => {
  const workspaceItems = navigation.filter(
    (item) => item.destination === 'Workspace',
  );
  const routing = workspaceItems.find((item) => item.to === 'routing');
  const evaluations = workspaceItems.find((item) => item.to === 'evaluations');
  const events = workspaceItems.find((item) => item.to === 'events');
  expect(routing?.label).toBe('Routing');
  expect(evaluations?.label).toBe('Evaluations');
  expect(events?.label).toBe('Event subscriptions');
  expect(new Set([routing?.to, evaluations?.to, events?.to]).size).toBe(3);
  expect([routing?.hidden, evaluations?.hidden, events?.hidden]).toEqual([
    undefined,
    undefined,
    undefined,
  ]);
});

test('the legacy review route module dispatches each section to its feature', () => {
  expect(reviewKindFromPath('/workspaces/demo/routing')).toBe('routing');
  expect(reviewKindFromPath('/workspaces/demo/routing/assistant')).toBe(
    'routing',
  );
  expect(reviewKindFromPath('/workspaces/demo/evaluations')).toBe(
    'evaluations',
  );
  expect(
    reviewKindFromPath('/workspaces/demo/evaluations/notes/runs/candidate'),
  ).toBe('evaluations');
  expect(reviewKindFromPath('/workspaces/demo/events')).toBe('events');
  expect(reviewKindFromPath('/workspaces/demo/events/ops')).toBe('events');
});

test('event subscriptions are a dedicated module with configuration and delivery evidence', async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = String(url);
      calls.push(path);
      if (
        path.endsWith(
          '/api/v1/workspaces/11111111-1111-4111-8111-111111111111/events/ops/deliveries',
        )
      ) {
        return Response.json({
          data: [
            {
              id: 'internal-delivery-id',
              updated_at: '2026-11-01T00:00:00Z',
              state: 'delivered',
              attempts: 1,
              response_status: 204,
            },
          ],
        });
      }
      if (
        path.endsWith(
          '/api/v1/workspaces/11111111-1111-4111-8111-111111111111/events/ops',
        )
      ) {
        return Response.json({
          data: {
            slug: 'ops',
            name: 'Operations webhook',
            revision: 2,
            endpoint: 'https://example.test/hooks/niu',
            event_types: ['incident.opened'],
            enabled: true,
          },
          processed_cursor: '0',
          authorization_active: true,
        });
      }
      return Response.json({
        data: [
          {
            slug: 'ops',
            name: 'Operations webhook',
            revision: 2,
            endpoint: 'https://example.test/hooks/niu',
            event_types: ['incident.opened'],
            enabled: true,
          },
        ],
        next_after: null,
      });
    }),
  );

  const list = renderAt(
    <EventSubscriptionsPage />,
    '/workspaces/demo/events',
    '/workspaces/:workspace/events',
  );
  expect(
    await screen.findByRole('link', { name: 'Operations webhook' }),
  ).toBeTruthy();
  expect(screen.getByText('Incident opened')).toBeTruthy();
  list.unmount();
  cleanup();

  renderAt(
    <EventSubscriptionsPage />,
    '/workspaces/demo/events/ops?tab=deliveries',
    '/workspaces/:workspace/events/:slug',
  );
  expect(
    await screen.findByText(/Acknowledged/),
  ).toBeTruthy();
  expect(screen.getByText('204')).toBeTruthy();
  expect(document.body.textContent).not.toContain('internal-delivery-id');
  expect(
    calls.some((path) => path.endsWith('/workspaces/11111111-1111-4111-8111-111111111111/events/ops/deliveries')),
  ).toBe(true);
});

test('evaluations are a dedicated module listing definitions and task evidence', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        data: [
          {
            slug: 'notes',
            name: 'Notes evaluation',
            task: 'Summarize decisions',
            protocol: 'check',
            revision: 1,
          },
        ],
        next_after: null,
      }),
    ),
  );
  renderAt(
    <EvaluationsPage />,
    '/workspaces/demo/evaluations',
    '/workspaces/:workspace/evaluations',
  );
  expect(
    await screen.findByRole('link', { name: 'Notes evaluation' }),
  ).toBeTruthy();
  expect(screen.getByText('Summarize decisions')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Create custom model' }),
  ).toBeNull();
});

test('routing module remains focused on custom model pools', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).includes('/routing')
        ? Response.json({
            data: [
              {
                slug: 'fast-coding',
                name: 'Fast coding',
                revision: 1,
                enabled: true,
                candidates: [
                  { alias: 'gpt-4.1-mini', enabled: true, priority: 100, weight: 1 },
                ],
                rules: [],
              },
            ],
            next_after: null,
          })
        : Response.json({ data: [], next_after: null }),
    ),
  );
  renderAt(
    <RoutingPage />,
    '/workspaces/demo/routing',
    '/workspaces/:workspace/routing',
  );
  expect(
    await screen.findByRole('link', { name: 'Fast coding' }),
  ).toBeTruthy();
  expect(screen.getByText('gpt-4.1-mini')).toBeTruthy();
  expect(
    screen.queryByRole('link', { name: 'Operations webhook' }),
  ).toBeNull();
});
