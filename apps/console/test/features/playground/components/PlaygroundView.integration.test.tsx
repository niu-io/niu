import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router';
import PlaygroundView from '../../../../src/features/playground/components/PlaygroundView';

const scope = { organizationId: 'org-a', projectId: 'project-a' };

function jsonResponse(body: unknown, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...Object.fromEntries(new Headers(headers)) },
  });
}

function streamResponse(model: string, completion: number, attemptId: string) {
  const encoder = new TextEncoder();
  const chunks = [
    { choices: [{ delta: { content: `${model} ` } }] },
    { choices: [{ delta: { content: 'response' } }] },
    { choices: [], usage: { prompt_tokens: 40, completion_tokens: completion, total_tokens: 40 + completion } },
  ];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream', 'x-niu-attempt-id': attemptId } });
}

describe('Playground model comparison', () => {
  it('sends one shared request to three selected models in parallel, compares measurements, and revokes its scoped key', async () => {
    const requests: Array<{ url: string; method: string; headers: Headers; body?: string }> = [];
    const pendingInference: Array<{ model: string; resolve: (response: Response) => void }> = [];
    let allInferenceStarted!: () => void;
    const inferenceStarted = new Promise<void>(resolve => { allInferenceStarted = resolve; });

    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === 'string' ? init.body : undefined;
      requests.push({ url, method, headers, body });

      if (url === `/admin/v1/organizations/${scope.organizationId}/projects/${scope.projectId}/keys` && method === 'POST') {
        return Promise.resolve(jsonResponse({ data: { id: 'temporary-key-id', token: 'temporary-project-key' } }, { 'cache-control': 'no-store' }));
      }
      if (url === '/v1/chat/completions' && method === 'POST') {
        const payload = JSON.parse(body ?? '{}') as { model: string };
        return new Promise<Response>(resolve => {
          pendingInference.push({ model: payload.model, resolve });
          if (pendingInference.length === 3) allInferenceStarted();
        });
      }
      if (url === `/admin/v1/organizations/${scope.organizationId}/projects/${scope.projectId}/requests?limit=100`) {
        return Promise.resolve(jsonResponse({ data: [
          { attempt_id: 'attempt-fast', cash_nanos: '1000000', api_equivalent_nanos: '2000000', currency: 'USD' },
          { attempt_id: 'attempt-strong', cash_nanos: '2000000', api_equivalent_nanos: '4000000', currency: 'USD' },
        ], next_cursor: null }, { 'cache-control': 'no-store' }));
      }
      if (url === `/admin/v1/organizations/${scope.organizationId}/projects/${scope.projectId}/keys/temporary-key-id` && method === 'DELETE') {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    }));

    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/workspaces/project-a/playground']}>
      <Routes><Route path="/workspaces/:workspace/playground" element={<PlaygroundView
        token="admin-session"
        models={['fast', 'strong', 'balanced', 'unused', 'spare']}
        canCreateKeys
        initialScope={scope}
      />} /></Routes>
    </MemoryRouter>);

    expect(screen.getByText('2 selected · up to 4')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^fast/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^strong/i }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: /^strong/i }));
    expect(screen.getByText('Select one more model to compare.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Compare 1 model' }).hasAttribute('disabled')).toBe(true);
    await user.click(screen.getByRole('button', { name: /^strong/i }));
    await user.click(screen.getByRole('button', { name: /^balanced/i }));
    expect(screen.getByText('3 selected · up to 4')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^unused/i }));
    expect(screen.getByText('4 selected · up to 4')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^spare/i }).hasAttribute('disabled')).toBe(true);
    await user.click(screen.getByRole('button', { name: /^unused/i }));
    expect(screen.getByText('3 selected · up to 4')).toBeTruthy();

    await user.click(screen.getByText('System instructions'));
    await user.type(screen.getByLabelText('Instructions'), 'Reply with one concise line.');
    await user.type(screen.getByLabelText('Prompt'), 'Compare this request across providers.');
    await user.selectOptions(screen.getByLabelText('Maximum output tokens'), '1024');
    await user.clear(screen.getByLabelText('Temperature'));
    await user.type(screen.getByLabelText('Temperature'), '0.4');
    await user.click(screen.getByRole('button', { name: 'Compare 3 models' }));

    await inferenceStarted;
    const inference = requests.filter(request => request.url === '/v1/chat/completions');
    expect(inference).toHaveLength(3);
    expect(pendingInference.map(call => call.model)).toEqual(['fast', 'strong', 'balanced']);
    expect(inference.map(request => request.headers.get('authorization'))).toEqual([
      'Bearer temporary-project-key',
      'Bearer temporary-project-key',
      'Bearer temporary-project-key',
    ]);
    const sentBodies = inference.map(request => JSON.parse(request.body ?? '{}')) as Array<{
      model: string;
      messages: Array<{ role: string; content: string }>;
      max_completion_tokens: number;
      temperature: number;
      stream: boolean;
    }>;
    expect(sentBodies.map(body => body.model)).toEqual(['fast', 'strong', 'balanced']);
    expect(sentBodies.every(body => body.stream)).toBe(true);
    expect(sentBodies.map(({ messages, max_completion_tokens, temperature }) => ({ messages, max_completion_tokens, temperature }))).toEqual([
      {
        messages: [
          { role: 'system', content: 'Reply with one concise line.' },
          { role: 'user', content: 'Compare this request across providers.' },
        ],
        max_completion_tokens: 1024,
        temperature: 0.4,
      },
      {
        messages: [
          { role: 'system', content: 'Reply with one concise line.' },
          { role: 'user', content: 'Compare this request across providers.' },
        ],
        max_completion_tokens: 1024,
        temperature: 0.4,
      },
      {
        messages: [
          { role: 'system', content: 'Reply with one concise line.' },
          { role: 'user', content: 'Compare this request across providers.' },
        ],
        max_completion_tokens: 1024,
        temperature: 0.4,
      },
    ]);

    const resultByModel = {
      fast: { completion: 12, attemptId: 'attempt-fast' },
      strong: { completion: 19, attemptId: 'attempt-strong' },
      balanced: { completion: 15, attemptId: 'attempt-balanced' },
    };
    const fastCall = pendingInference.find(call => call.model === 'fast')!;
    fastCall.resolve(streamResponse('fast', resultByModel.fast.completion, resultByModel.fast.attemptId));
    expect(await screen.findByText('fast response')).toBeTruthy();
    expect(screen.getAllByText('Waiting for a response…')).toHaveLength(2);

    for (const call of pendingInference.filter(call => call.model !== 'fast')) {
      const result = resultByModel[call.model as keyof typeof resultByModel];
      call.resolve(streamResponse(call.model, result.completion, result.attemptId));
    }

    expect(await screen.findByRole('heading', { name: 'Comparison' })).toBeTruthy();
    await waitFor(() => expect(requests.some(request => request.method === 'DELETE')).toBe(true));

    const keyIssue = requests.find(request => request.method === 'POST' && request.url.endsWith('/keys'));
    expect(JSON.parse(keyIssue?.body ?? '{}')).toMatchObject({
      name: 'Niu Playground comparison',
      allowed_models: ['fast', 'strong', 'balanced'],
      ttl_seconds: 900,
    });
    expect(requests.some(request => request.url.endsWith('/keys/temporary-key-id') && request.method === 'DELETE')).toBe(true);
    const persistedBrowserState = [window.location.href, ...Object.values(localStorage), ...Object.values(sessionStorage)].join('\n');
    expect(persistedBrowserState).not.toContain('temporary-project-key');
    expect(inference.every(request => request.headers.get('authorization') !== 'Bearer admin-session')).toBe(true);

    const metrics = screen.getByRole('table');
    expect(within(metrics).getByRole('columnheader', { name: /Baseline.*fast/ })).toBeTruthy();
    expect(within(metrics).getByRole('columnheader', { name: 'strong' })).toBeTruthy();
    expect(within(metrics).getByRole('columnheader', { name: 'balanced' })).toBeTruthy();
    expect(within(metrics).getByRole('columnheader', { name: 'Difference for strong versus baseline' })).toBeTruthy();
    expect(within(metrics).getByRole('columnheader', { name: 'Difference for balanced versus baseline' })).toBeTruthy();
    expect(within(metrics).getAllByText('40')).toHaveLength(3);
    expect(within(metrics).getByText('52')).toBeTruthy();
    expect(within(metrics).getByText('59')).toBeTruthy();
    expect(within(metrics).getByText('55')).toBeTruthy();
    expect(within(metrics).getByText('USD 0.001')).toBeTruthy();
    expect(within(metrics).getAllByText('USD 0.002')).toHaveLength(2);
    expect(within(metrics).getByText('USD 0.004')).toBeTruthy();
    expect(within(metrics).getByText('+USD 0.001')).toBeTruthy();
    expect(within(metrics).getByText('+USD 0.002')).toBeTruthy();
    expect(within(metrics).getAllByText('Unknown')).toHaveLength(4);
    expect(screen.getByText('fast response')).toBeTruthy();
    expect(screen.getByText('strong response')).toBeTruthy();
    expect(screen.getByText('balanced response')).toBeTruthy();
    const activityLinks = screen.getAllByRole('link', { name: 'Use this model in Niu' });
    expect(activityLinks.map(link => link.getAttribute('href'))).toEqual([
      '/workspaces/project-a/executions?modelAlias=fast#gateway-attempt-attempt-fast',
      '/workspaces/project-a/executions?modelAlias=strong#gateway-attempt-attempt-strong',
      '/workspaces/project-a/executions?modelAlias=balanced#gateway-attempt-attempt-balanced',
    ]);
    expect(screen.getByText(/does not measure task acceptance/i)).toBeTruthy();
  });

  it('cancels all in-flight model requests and keeps the per-model cancelled state', async () => {
    const requests: Array<{ url: string; method: string; signal?: AbortSignal }> = [];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push({ url, method, signal: init?.signal as AbortSignal | undefined });
      if (url === `/admin/v1/organizations/${scope.organizationId}/projects/${scope.projectId}/keys` && method === 'POST') {
        return Promise.resolve(jsonResponse({ data: { id: 'temporary-key-id', token: 'temporary-project-key' } }));
      }
      if (url === '/v1/chat/completions' && method === 'POST') {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      }
      if (url === `/admin/v1/organizations/${scope.organizationId}/projects/${scope.projectId}/keys/temporary-key-id` && method === 'DELETE') {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    }));

    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/workspaces/project-a/playground']}>
      <Routes><Route path="/workspaces/:workspace/playground" element={<PlaygroundView
        token="admin-session"
        models={['fast', 'strong']}
        canCreateKeys
        initialScope={scope}
      />} /></Routes>
    </MemoryRouter>);

    await user.type(screen.getByLabelText('Prompt'), 'Stop this comparison.');
    await user.click(screen.getByRole('button', { name: 'Compare 2 models' }));
    await waitFor(() => expect(requests.filter(request => request.url === '/v1/chat/completions')).toHaveLength(2));
    expect(screen.getByRole('button', { name: 'Cancel comparison' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel comparison' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Compare 2 models' })).toBeTruthy());
    expect(screen.getAllByText('Cancelled')).toHaveLength(2);
    expect(requests.filter(request => request.url === '/v1/chat/completions').every(request => request.signal?.aborted)).toBe(true);
    expect(requests.some(request => request.method === 'DELETE' && request.url.endsWith('/keys/temporary-key-id'))).toBe(true);
  });

  it('keeps model errors independent and allows a clean rerun', async () => {
    const requests: Array<{ url: string; method: string }> = [];
    let issuedKeys = 0;
    let inferenceCount = 0;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push({ url, method });
      if (url === `/admin/v1/organizations/${scope.organizationId}/projects/${scope.projectId}/keys` && method === 'POST') {
        issuedKeys += 1;
        return Promise.resolve(jsonResponse({ data: { id: `temporary-key-${issuedKeys}`, token: `temporary-project-key-${issuedKeys}` } }));
      }
      if (url === '/v1/chat/completions' && method === 'POST') {
        inferenceCount += 1;
        if (inferenceCount === 2) return Promise.resolve(new Response(JSON.stringify({ error: { message: 'This model is temporarily unavailable.' } }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }));
        const model = JSON.parse(String(init?.body)).model as string;
        return Promise.resolve(streamResponse(model, 12, `attempt-${inferenceCount}`));
      }
      if (url === `/admin/v1/organizations/${scope.organizationId}/projects/${scope.projectId}/requests?limit=100`) {
        return Promise.resolve(jsonResponse({ data: [], next_cursor: null }, { 'cache-control': 'no-store' }));
      }
      if (url.startsWith(`/admin/v1/organizations/${scope.organizationId}/projects/${scope.projectId}/keys/`) && method === 'DELETE') {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    }));

    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/workspaces/project-a/playground']}>
      <Routes><Route path="/workspaces/:workspace/playground" element={<PlaygroundView
        token="admin-session"
        models={['fast', 'strong']}
        canCreateKeys
        initialScope={scope}
      />} /></Routes>
    </MemoryRouter>);

    await user.type(screen.getByLabelText('Prompt'), 'Test independent routes.');
    await user.click(screen.getByRole('button', { name: 'Compare 2 models' }));
    expect(await screen.findByText('fast response')).toBeTruthy();
    expect(await screen.findByText('This model is temporarily unavailable.')).toBeTruthy();
    expect(screen.getAllByText('Response received')).toHaveLength(1);
    expect(screen.getAllByText('Request failed')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Compare 2 models' }));
    expect(await screen.findByText('strong response')).toBeTruthy();
    expect(screen.queryByText('This model is temporarily unavailable.')).toBeNull();
    expect(screen.getAllByText('Response received')).toHaveLength(2);
    expect(inferenceCount).toBe(4);
    expect(issuedKeys).toBe(2);
    expect(requests.filter(request => request.method === 'DELETE')).toHaveLength(2);
  });

  it('clears comparison data and revokes the old workspace key when the route changes', async () => {
    const requests: Array<{ url: string; method: string; signal?: AbortSignal }> = [];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push({ url, method, signal: init?.signal as AbortSignal | undefined });
      if (url.endsWith('/keys') && method === 'POST') {
        const workspace = url.includes('/projects/project-a/') ? 'a' : 'b';
        return Promise.resolve(jsonResponse({ data: { id: `temporary-key-${workspace}`, token: `temporary-project-key-${workspace}` } }));
      }
      if (url === '/v1/chat/completions' && method === 'POST') {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      }
      if (url.includes('/keys/temporary-key-') && method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    }));

    function WorkspacePlayground() {
      const { workspace = '' } = useParams();
      const organizationId = workspace === 'project-a' ? 'org-a' : 'org-b';
      return <PlaygroundView
        key={workspace}
        token="admin-session"
        models={['fast', 'strong']}
        canCreateKeys
        initialScope={{ organizationId, projectId: workspace }}
      />;
    }

    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/workspaces/project-a/playground']}>
      <Link to="/workspaces/project-b/playground">Switch workspace</Link>
      <Routes><Route path="/workspaces/:workspace/playground" element={<WorkspacePlayground />} /></Routes>
    </MemoryRouter>);

    await user.type(screen.getByLabelText('Prompt'), 'This comparison belongs only to project A.');
    await user.click(screen.getByRole('button', { name: 'Compare 2 models' }));
    await waitFor(() => expect(requests.filter(request => request.url === '/v1/chat/completions')).toHaveLength(2));
    const inFlight = requests.filter(request => request.url === '/v1/chat/completions');
    expect(inFlight.every(request => request.signal?.aborted === false)).toBe(true);

    await user.click(screen.getByRole('link', { name: 'Switch workspace' }));
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByRole('heading', { name: 'Comparison' })).toBeNull();
    await waitFor(() => expect(requests.some(request => request.method === 'DELETE' && request.url.includes('/projects/project-a/keys/temporary-key-a'))).toBe(true));
    expect(inFlight.every(request => request.signal?.aborted === true)).toBe(true);
    expect(requests.some(request => request.method === 'POST' && request.url.includes('/projects/project-b/keys'))).toBe(false);
  });
});
