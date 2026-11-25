import { createContext, useContext, useState, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router';
import VideoSessionComposer from '@/features/generations/VideoSessionComposer';
import type { DashboardContext } from '@/shell/dashboard-context';
import type { VideoGenerationsSession } from '@niu-io/sdk/generations-sessions';
import type { VideoModel } from '@niu-io/sdk';

const RouterChildrenContext = createContext<ReactNode>(null);
function RouterChildrenOutlet() {
  return <>{useContext(RouterChildrenContext)}</>;
}
function DataRouter({ initialEntries = ['/generations/video-1001'], children }: { initialEntries?: string[]; children: ReactNode }) {
  const [router] = useState(() => createMemoryRouter([{ path: '*', Component: RouterChildrenOutlet }], { initialEntries }));
  return (
    <RouterChildrenContext.Provider value={children}>
      <RouterProvider router={router} />
    </RouterChildrenContext.Provider>
  );
}

const workspace = {
  id: '22222222-2222-4222-8222-222222222222',
  organization_id: '33333333-3333-4333-8333-333333333333',
  slug: 'review',
  name: 'Review',
};
const keyId = '99999999-9999-4999-8999-999999999999';
const session: VideoGenerationsSession = {
  id: '11111111-1111-4111-8111-111111111111',
  reference: 'video-1001',
  workspace_id: workspace.id,
  owner: 'fixture',
  category: 'video',
  title: 'Saved Video',
  revision: '1',
  archived: false,
  created_at: '2026-10-22T00:00:00Z',
  updated_at: '2026-10-22T00:00:00Z',
  turns: [],
};
const videoModel: VideoModel = {
  object: 'video.model',
  id: 'fastrouter/seedance-2.0-mini',
  mode: 'customer',
  input_types: ['text'],
  text: { maximum_items: 1, maximum_bytes: 1024 },
  maximum_body_bytes: 2048,
  maximum_content_items: 1,
  controls: {
    resolution: { kind: 'choice', values: ['720p'], default: '720p' },
    ratio: { kind: 'choice', values: ['16:9'], default: '16:9' },
    duration: { kind: 'integer', minimum: 1, maximum: 10, default: 5 },
    frames_per_second: { kind: 'integer', minimum: 24, maximum: 60, default: 24 },
  },
  required_controls: [],
  exclusive_controls: [],
  output: {
    specifications: [{ resolution: '720p', ratio: '16:9', width: 1280, height: 720 }],
    meter: 'video_tokens',
    estimator: 'SeedancePixelsV1',
  },
};
const context = {
  token: 'member',
  workspace,
  workspaces: [workspace],
  session: { kind: 'operator', operator: { id: 'op-1' }, permissions: { read: true, write: true } },
} as unknown as DashboardContext;
const available = {
  keys: [{ id: keyId, name: 'Review key', allowed_models: ['*'], revoked: false, expired: false, workspace }],
  loading: false,
  error: '',
  reload: vi.fn(),
} as unknown as Parameters<typeof VideoSessionComposer>[0]['available'];

function MidFlightHarness({ onSubmitted }: { onSubmitted: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="route">{location.pathname + location.search}</output>
      <button type="button" onClick={() => navigate('/workspaces/review')}>Leave route</button>
      {location.pathname.startsWith('/generations') && (
        <VideoSessionComposer
          context={context}
          session={session}
          onSubmitted={onSubmitted}
          available={available}
          keyId={keyId}
          onRestoreKey={vi.fn()}
          keyEditRevision={0}
          onKeySelectionReadyChange={vi.fn()}
        />
      )}
    </>
  );
}

afterEach(() => vi.unstubAllGlobals());

it('does not call onSubmitted when pre-dispatch /v1/video/estimate fails', async () => {
  const onSubmitted = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith('/video/draft')) {
        if (init?.method === 'PUT') {
          const body = JSON.parse(String(init.body));
          return Response.json({ data: { revision: body.expected_revision + 1, content_state: 'retained', expires_at_ms: '1800000000000', payload: body.payload } });
        }
        return Response.json({ data: { revision: 0, content_state: 'empty', expires_at_ms: null, payload: null } });
      }
      if (path === '/v1/video/models') return Response.json({ object: 'list', data: [videoModel] });
      if (path === '/v1/video/estimate') return Response.json({ error: { message: 'Estimate denied for test' } }, { status: 400 });
      return Response.json({ data: [] });
    }),
  );

  const user = userEvent.setup();
  render(
    <DataRouter>
      <VideoSessionComposer
        context={context}
        session={session}
        onSubmitted={onSubmitted}
        available={available}
        keyId={keyId}
        onRestoreKey={vi.fn()}
        keyEditRevision={0}
        onKeySelectionReadyChange={vi.fn()}
      />
    </DataRouter>,
  );

  const prompt = await screen.findByLabelText('Prompt');
  await waitFor(() => expect((prompt as HTMLTextAreaElement).disabled).toBe(false));
  await user.type(prompt, 'Failing estimate prompt');
  await user.click(screen.getByRole('button', { name: 'Generate video' }));

  expect((await screen.findByRole('alert')).textContent).toContain('Estimate denied for test');
  expect(onSubmitted).not.toHaveBeenCalled();
});

it('calls onSubmitted when server-side preparation fails after estimate succeeds', async () => {
  const onSubmitted = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith('/video/draft')) {
        if (init?.method === 'PUT') {
          const body = JSON.parse(String(init.body));
          return Response.json({ data: { revision: body.expected_revision + 1, content_state: 'retained', expires_at_ms: '1800000000000', payload: body.payload } });
        }
        return Response.json({ data: { revision: 0, content_state: 'empty', expires_at_ms: null, payload: null } });
      }
      if (path === '/v1/video/models') return Response.json({ object: 'list', data: [videoModel] });
      if (path === '/v1/video/estimate') return Response.json({ object: 'video.estimate' });
      if (path.includes('/sessions/')) return Response.json({ error: { message: 'Preparation failed' } }, { status: 503 });
      return Response.json({ data: [] });
    }),
  );

  const user = userEvent.setup();
  render(
    <DataRouter>
      <VideoSessionComposer
        context={context}
        session={session}
        onSubmitted={onSubmitted}
        available={available}
        keyId={keyId}
        onRestoreKey={vi.fn()}
        keyEditRevision={0}
        onKeySelectionReadyChange={vi.fn()}
      />
    </DataRouter>,
  );

  const prompt = await screen.findByLabelText('Prompt');
  await waitFor(() => expect((prompt as HTMLTextAreaElement).disabled).toBe(false));
  await user.type(prompt, 'Failing prepare prompt');
  await user.click(screen.getByRole('button', { name: 'Generate video' }));

  await screen.findByRole('alert');
  expect(onSubmitted).toHaveBeenCalledTimes(1);
});

it('guards navigation while preparing, aborts estimate on unmount, and never mutates ?pending on a new route', async () => {
  const onSubmitted = vi.fn();
  let estimateSignal: AbortSignal | null | undefined;
  let resolveEstimate!: (res: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith('/video/draft')) {
        if (init?.method === 'PUT') {
          const body = JSON.parse(String(init.body));
          return Response.json({ data: { revision: body.expected_revision + 1, content_state: 'retained', expires_at_ms: '1800000000000', payload: body.payload } });
        }
        return Response.json({ data: { revision: 0, content_state: 'empty', expires_at_ms: null, payload: null } });
      }
      if (path === '/v1/video/models') return Response.json({ object: 'list', data: [videoModel] });
      if (path === '/v1/video/estimate') {
        estimateSignal = init?.signal;
        return new Promise<Response>(resolve => { resolveEstimate = resolve; });
      }
      return Response.json({ data: [] });
    }),
  );

  const user = userEvent.setup();
  render(<DataRouter><MidFlightHarness onSubmitted={onSubmitted} /></DataRouter>);

  const prompt = await screen.findByLabelText('Prompt');
  await waitFor(() => expect((prompt as HTMLTextAreaElement).disabled).toBe(false));
  await user.type(prompt, 'Mid-flight navigation');
  await user.click(screen.getByRole('button', { name: 'Generate video' }));
  await waitFor(() => expect(estimateSignal).toBeDefined());

  // Navigation is blocked while preparing a submission.
  await user.click(screen.getByRole('button', { name: 'Leave route' }));
  await screen.findByRole('dialog', { name: 'Draft not saved' });
  expect(screen.getByTestId('route').textContent).toBe('/generations/video-1001');

  // Explicitly leaving unmounts the composer, aborts the in-flight estimate, and never writes ?pending on the new route.
  await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
  await waitFor(() => expect(screen.getByTestId('route').textContent).toBe('/workspaces/review'));
  expect(estimateSignal?.aborted).toBe(true);

  await act(async () => {
    resolveEstimate(Response.json({ object: 'video.estimate' }));
  });
  expect(screen.getByTestId('route').textContent).toBe('/workspaces/review');
  expect(onSubmitted).not.toHaveBeenCalled();
});
