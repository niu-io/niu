import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router';
import PlaygroundView from '../../../../src/features/playground/components/PlaygroundView';

vi.mock('../../../../src/app/console-context', () => ({ useConsoleContext: () => ({
  chatKeys: [],
  workspace: { id: 'workspace-a', name: 'Workspace A', organization_id: 'org-a', organization_name: 'Org A' },
  workspaces: [
    { id: 'workspace-a', name: 'Workspace A', organization_id: 'org-a', organization_name: 'Org A' },
    { id: 'workspace-b', name: 'Workspace B', organization_id: 'org-a', organization_name: 'Org A' },
  ],
}) }));

const scope = { organizationId: 'org-a', workspaceId: 'workspace-a', workspaceName: 'Workspace A' };

function jsonResponse(body: unknown, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...Object.fromEntries(new Headers(headers)) } });
}

function streamResponse(model: string, completion: number, attemptId: string) {
  const encoder = new TextEncoder();
  const chunks = [
    { choices: [{ delta: { content: `**${model}** ` } }] },
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

async function setWorkspaceKey(user: ReturnType<typeof userEvent.setup>, key = 'workspace-key-secret') {
  await user.click(screen.getByRole('button', { name: /API key:/i }));
  await user.click(screen.getByText('Already have a Niu API key?'));
  await user.type(screen.getByLabelText('API key', { selector: 'input' }), key);
  await user.click(screen.getByRole('button', { name: 'Done' }));
}

function renderPlayground(models = ['fast', 'strong', 'balanced', 'unused', 'spare']) {
  return render(<MemoryRouter initialEntries={['/workspaces/workspace-a/playground']}>
    <Routes><Route path="/workspaces/:workspace/playground" element={<PlaygroundView token="admin-session" models={models} initialScope={scope} />} /></Routes>
  </MemoryRouter>);
}

describe('Global Chat', () => {
  it('returns to the complete task gallery when starting a new comparison', async () => {
    const user = userEvent.setup();
    renderPlayground(['fast', 'strong']);

    await user.click(screen.getByRole('tab', { name: 'Reasoning' }));
    expect(screen.getByRole('button', { name: /Car wash/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Snake game/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'New' }));
    expect(screen.getByRole('tab', { name: 'All tasks' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: /Snake game/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Backend engineer job post/i })).toBeTruthy();
  });

  it('starts with the task, keeps key/model setup in the header, and compares identical requests with measured evidence', async () => {
    const requests: Array<{ url: string; headers: Headers; body?: string }> = [];
    const pendingInference: Array<{ model: string; resolve: (response: Response) => void }> = [];
    let allInferenceStarted!: () => void;
    const inferenceStarted = new Promise<void>(resolve => { allInferenceStarted = resolve; });
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === 'string' ? init.body : undefined;
      requests.push({ url, headers, body });
      if (url === '/v1/chat/completions') {
        const payload = JSON.parse(body ?? '{}') as { model: string };
        return new Promise<Response>(resolve => {
          pendingInference.push({ model: payload.model, resolve });
          if (pendingInference.length === 3) allInferenceStarted();
        });
      }
      if (url === `/admin/v1/organizations/${scope.organizationId}/projects/${scope.workspaceId}/requests?limit=100`) {
        return Promise.resolve(jsonResponse({ data: [
          { attempt_id: 'attempt-fast', cash_nanos: '1000000', api_equivalent_nanos: '2000000', currency: 'USD' },
          { attempt_id: 'attempt-strong', cash_nanos: '2000000', api_equivalent_nanos: '4000000', currency: 'USD' },
        ], next_cursor: null }));
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    }));

    const user = userEvent.setup();
    const { container } = renderPlayground();
    expect(screen.queryByRole('heading', { name: 'One prompt. Multiple answers.' })).toBeNull();
    const starters = container.querySelector('.playground-first-run .playground-starters');
    expect(starters).toBeTruthy();
    expect(starters?.closest('.playground-transcript')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Recent' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Workspace billed for these requests' })).toBeNull();
    expect(screen.getByRole('button', { name: /API key: Choose API key/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chat settings' })).toBeTruthy();
    expect(screen.queryByText('Parameters')).toBeNull();
    expect(screen.getByText('fast')).toBeTruthy();
    expect(screen.getByText('strong')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Car wash/i })).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Choose models' }));
    await user.click(screen.getByRole('button', { name: 'balanced' }));
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    await setWorkspaceKey(user);
    await user.type(screen.getByLabelText('Prompt for all selected models'), 'Compare this request across providers.');
    await user.click(screen.getByRole('button', { name: 'Chat settings' }));
    expect(screen.getByRole('heading', { name: 'Chat settings' })).toBeTruthy();
    await user.type(screen.getByLabelText('System instructions'), 'Reply with one concise line.');
    await user.click(screen.getByRole('button', { name: 'Max output' }));
    await user.click(screen.getByRole('menuitemradio', { name: '1,024 tokens' }));
    await user.clear(screen.getByLabelText('Temperature'));
    await user.type(screen.getByLabelText('Temperature'), '0.4');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: 'Compare 3 models' }));

    await inferenceStarted;
    const inference = requests.filter(request => request.url === '/v1/chat/completions');
    expect(inference).toHaveLength(3);
    expect(pendingInference.map(call => call.model)).toEqual(['fast', 'strong', 'balanced']);
    expect(inference.map(request => request.headers.get('authorization'))).toEqual(Array(3).fill('Bearer workspace-key-secret'));
    expect(inference.every(request => JSON.parse(request.body ?? '{}').stream === true)).toBe(true);
    expect(inference.map(request => JSON.parse(request.body ?? '{}')).map(({ model, messages, max_completion_tokens, temperature }: { model: string; messages: unknown; max_completion_tokens: number; temperature: number }) => ({ model, messages, max_completion_tokens, temperature }))).toEqual(Array.from(['fast', 'strong', 'balanced'], model => ({
      model,
      messages: [
        { role: 'system', content: 'Reply with one concise line.' },
        { role: 'user', content: 'Compare this request across providers.' },
      ],
      max_completion_tokens: 1024,
      temperature: 0.4,
    })));

    pendingInference.find(call => call.model === 'fast')!.resolve(streamResponse('fast', 12, 'attempt-fast'));
    await waitFor(() => expect(container.querySelector('.playground-result-card .playground-response')?.textContent).toContain('fast response'));
    expect(await screen.findAllByText('Waiting for a response…')).toHaveLength(2);
    for (const call of pendingInference.filter(call => call.model !== 'fast')) call.resolve(streamResponse(call.model, 19, 'attempt-' + call.model));

    expect(await screen.findByRole('heading', { name: 'Responses' })).toBeTruthy();
    await waitFor(() => expect(container.querySelector('.playground-result-card .playground-response')?.textContent).toContain('fast response'));
    expect(container.querySelector('.playground-response strong')?.textContent).toBe('fast');
    expect(container.querySelector('.playground-result-footer')).toBeTruthy();
    expect(container.querySelector('.playground-result-grid')?.getAttribute('data-model-count')).toBe('3');
    expect(screen.getByRole('button', { name: 'Copy fast response' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Compare 3 models/i })).toBeTruthy();
    expect(screen.getAllByText('Compare this request across providers.').length).toBeGreaterThan(1);
    expect(requests.some(request => request.headers.get('authorization') === 'Bearer admin-session' && request.url === '/v1/chat/completions')).toBe(false);
    expect(screen.getAllByRole('link', { name: 'Inspect request' })[0].getAttribute('href')).toContain('/executions?modelAlias=fast#gateway-attempt-attempt-fast');

    await user.click(screen.getByText('Compare measured usage'));
    const metrics = screen.getByRole('table');
    expect(within(metrics).getByRole('columnheader', { name: /Baseline.*fast/ })).toBeTruthy();
    expect(within(metrics).getByRole('columnheader', { name: 'strong' })).toBeTruthy();
    expect(within(metrics).getByText('USD 0.001')).toBeTruthy();
    expect(within(metrics).getAllByText('USD 0.002')).toHaveLength(2);
    expect(screen.getByText('Compare measured usage')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Inspect request' })).toHaveLength(3);
  });

  it('uses the current workspace context without adding a second workspace choice to Chat', () => {
    renderPlayground(['fast', 'strong']);
    expect(screen.queryByRole('button', { name: 'Workspace billed for these requests' })).toBeNull();
    expect(screen.getByRole('button', { name: /API key: Choose API key/i })).toBeTruthy();
  });

  it('requires a workspace API key and lets the user stop in-flight requests', async () => {
    const requests: Array<{ url: string; signal?: AbortSignal }> = [];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, signal: init?.signal as AbortSignal | undefined });
      if (url === '/v1/chat/completions') return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    }));
    const user = userEvent.setup();
    renderPlayground(['fast', 'strong']);
    await user.type(screen.getByLabelText('Prompt for all selected models'), 'Stop this comparison.');
    await user.click(screen.getByRole('button', { name: 'Compare 2 models' }));
    expect(await screen.findByRole('heading', { name: 'API key' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create key' }).getAttribute('href')).toBe('/workspaces/workspace-a/keys');
    expect(screen.getByText('Already have a Niu API key?').closest('details')?.open).toBe(false);
    expect(screen.queryByText('Choose a workspace API key before sending this prompt.')).toBeNull();
    expect(screen.queryByText('Select a workspace API key to send requests')).toBeNull();
    expect(screen.queryByText(/Create a key on the API keys page/)).toBeNull();
    expect(requests.filter(request => request.url === '/v1/chat/completions')).toHaveLength(0);
    await user.click(screen.getByText('Already have a Niu API key?'));
    await user.type(screen.getByLabelText('API key', { selector: 'input' }), 'workspace-key-secret');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: 'Compare 2 models' }));
    await waitFor(() => expect(requests.filter(request => request.url === '/v1/chat/completions')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(screen.getAllByText('Cancelled')).toHaveLength(2));
    expect(requests.filter(request => request.url === '/v1/chat/completions').every(request => request.signal?.aborted)).toBe(true);
  });

  it('keeps per-model failures independent and permits a clean rerun', async () => {
    let strongCalls = 0;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/v1/chat/completions') {
        const model = (JSON.parse(String(init?.body)) as { model: string }).model;
        if (model === 'strong' && ++strongCalls === 1) return Promise.resolve(new Response(JSON.stringify({ error: { message: 'This model is temporarily unavailable.' } }), { status: 503, headers: { 'content-type': 'application/json' } }));
        return Promise.resolve(streamResponse(model, 12, 'attempt-' + model));
      }
      if (url.endsWith('/requests?limit=100')) return Promise.resolve(jsonResponse({ data: [], next_cursor: null }));
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    }));
    const user = userEvent.setup();
    const { container } = renderPlayground(['fast', 'strong']);
    await setWorkspaceKey(user);
    await user.type(screen.getByLabelText('Prompt for all selected models'), 'Test independent routes.');
    await user.click(screen.getByRole('button', { name: 'Compare 2 models' }));
    await waitFor(() => expect(container.querySelector('.playground-result-card .playground-response')?.textContent).toContain('fast response'));
    expect(await screen.findByText('This model is temporarily unavailable.')).toBeTruthy();
    expect(screen.getAllByText('Complete')).toHaveLength(1);
    expect(screen.getAllByText('Failed')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Compare 2 models' }));
    await waitFor(() => expect(container.querySelectorAll('.playground-result-card .playground-response')[1]?.textContent).toContain('strong response'));
    expect(screen.queryByText('This model is temporarily unavailable.')).toBeNull();
    expect(screen.getAllByText('Complete')).toHaveLength(2);
  });

  it('resets the prompt and aborts requests when changing workspace', async () => {
    const requests: Array<{ url: string; signal?: AbortSignal }> = [];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, signal: init?.signal as AbortSignal | undefined });
      if (url === '/v1/chat/completions') return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    }));
    function WorkspacePlayground() {
      const { workspace = '' } = useParams();
      return <PlaygroundView key={workspace} token="admin-session" models={['fast', 'strong']} initialScope={{ organizationId: workspace, workspaceId: workspace, workspaceName: workspace }} />;
    }
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/workspaces/workspace-a/playground']}>
      <Link to="/workspaces/workspace-b/playground">Switch workspace</Link>
      <Routes><Route path="/workspaces/:workspace/playground" element={<WorkspacePlayground />} /></Routes>
    </MemoryRouter>);
    await setWorkspaceKey(user);
    await user.type(screen.getByLabelText('Prompt for all selected models'), 'Only for workspace A.');
    await user.click(screen.getByRole('button', { name: 'Compare 2 models' }));
    await waitFor(() => expect(requests.filter(request => request.url === '/v1/chat/completions')).toHaveLength(2));
    const calls = requests.filter(request => request.url === '/v1/chat/completions');
    await user.click(screen.getByRole('link', { name: 'Switch workspace' }));
    expect((screen.getByLabelText('Prompt for all selected models') as HTMLTextAreaElement).value).toBe('');
    expect(calls.every(request => request.signal?.aborted)).toBe(true);
  });
});
