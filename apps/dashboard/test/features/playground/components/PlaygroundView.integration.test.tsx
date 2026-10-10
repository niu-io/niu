import { SidebarProvider } from '@/components/ui/sidebar';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useParams, useLocation } from 'react-router';
import PlaygroundView from '../../../../src/features/playground/components/PlaygroundView';

vi.mock('../../../../src/app/dashboard-context', () => ({ useDashboardContext: () => ({
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
  await user.type(screen.getByLabelText('Key secret'), key);
  await user.click(screen.getByRole('button', { name: 'Done' }));
}

function renderPlayground(models = ['fast', 'strong', 'balanced', 'unused', 'spare']) {
  return render(<SidebarProvider><MemoryRouter initialEntries={['/workspaces/workspace-a/playground']}>
    <Routes><Route path="/workspaces/:workspace/playground" element={<PlaygroundView token="admin-session" models={models} initialScope={scope} />} /><Route path="/generations" element={<PlaygroundView token="admin-session" models={models} initialScope={scope} />} /></Routes>
  </MemoryRouter></SidebarProvider>);
}

const serverChats = new Map<string, unknown>();
const serverDrafts = new Map<string,{payload:unknown;revision:number}>();
function stubChatFetch(fallback: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch',vi.fn((input:RequestInfo|URL,init?:RequestInit)=>{
    if(String(input).endsWith('/chat-draft')) {
      const prior=serverDrafts.get(String(input))??{payload:null,revision:0};
      if(init?.method==='PUT') {const body=JSON.parse(String(init.body));if(body.expected_revision!==prior.revision)return Promise.resolve(new Response(null,{status:409}));const saved={payload:body.payload,revision:prior.revision+1};serverDrafts.set(String(input),saved);return Promise.resolve(jsonResponse({data:saved}));}
      return Promise.resolve(jsonResponse({data:prior}));
    }
    return fallback(input,init);
  }));
}

function stubFetch(fallback: ReturnType<typeof vi.fn>) {
  stubChatFetch( vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/chat-sessions')) {
      if (init?.method === 'DELETE') { serverChats.delete(url); return Promise.resolve(new Response(null, { status: 204 })); }
      if (init?.method === 'PUT') { serverChats.set(url, JSON.parse(String(init.body))); return Promise.resolve(jsonResponse({ saved: true })); }
      return Promise.resolve(jsonResponse({ data: [...serverChats.entries()].filter(([key]) => key.startsWith(url + '/')).map(([, value]) => value) }));
    }
    return fallback(input, init);
  }));
}

beforeEach(() => { localStorage.clear(); serverChats.clear(); serverDrafts.clear(); vi.stubGlobal('crypto', webcrypto); });

describe('Global Chat', () => {
  it('consumes new-generation intent and restores an unsent server draft after remount', async () => {
    stubFetch(vi.fn(async () => jsonResponse({data:[]})));
    function LocationProbe() { const location=useLocation(); return <output data-testid="draft-location">{location.pathname+location.search}</output>; }
    function mount(url:string) { return render(<SidebarProvider><MemoryRouter initialEntries={[url]}><LocationProbe/><PlaygroundView token="admin-session" models={['fast']} initialScope={scope}/></MemoryRouter></SidebarProvider>); }
    const first=mount('/generations?new=1&workspace=workspace-a');
    await waitFor(()=>expect(screen.getByTestId('draft-location').textContent).toBe('/generations?workspace=workspace-a'));
    await userEvent.type(screen.getByLabelText('Prompt for all selected models'),'Keep my unsent work');
    await waitFor(()=>expect([...serverDrafts.values()].some(draft=>(draft.payload as {prompt:string})?.prompt==='Keep my unsent work')).toBe(true));
    first.unmount();
    mount('/generations?workspace=workspace-a');
    await waitFor(()=>expect((screen.getByLabelText('Prompt for all selected models') as HTMLTextAreaElement).value).toBe('Keep my unsent work'));
    expect(vi.mocked(fetch).mock.calls.some(([path])=>String(path).includes('/v1/chat/completions'))).toBe(false);
  });
  it('opens Video from the task category without offering it as a single example task', async () => {
    stubFetch(vi.fn(async () => jsonResponse({data:[]})));
    render(<SidebarProvider><MemoryRouter initialEntries={['/generations?new=1']}>
      <PlaygroundView token="admin-session" models={['fast']} initialScope={scope}/>
    </MemoryRouter></SidebarProvider>);
    await screen.findByRole('tab', {name:'Video'});
    expect(screen.queryByRole('button', {name:/Video generation/})).toBeNull();
    await userEvent.click(screen.getByRole('tab', {name:'Video'}));
    // The router carries the generation type, not a text example prompt.
    expect((screen.getByLabelText('Prompt for all selected models') as HTMLTextAreaElement).value).toBe('');
    expect(vi.mocked(fetch).mock.calls.some(([path])=>String(path).includes('/v1/chat/completions'))).toBe(false);
  });
  it.each(['older', 'missing'])('opens only the explicitly requested saved session: %s', async requested => {
    for (const [id, prompt, createdAt] of [['latest', 'Latest conversation', 2], ['older', 'Requested conversation', 1]] as const) {
      serverChats.set(`/admin/v1/organizations/org-a/projects/workspace-a/chat-sessions/${id}`, {
        id, prompt, createdAt, results: [],
      });
    }
    stubFetch(vi.fn(async () => jsonResponse({data:[]})));
    render(<SidebarProvider><MemoryRouter initialEntries={[`/generations?session=${requested}`]}>
      <PlaygroundView token="admin-session" models={['fast']} initialScope={scope}/>
    </MemoryRouter></SidebarProvider>);
    if (requested === 'older') {
      await screen.findByRole('heading', {name:'Requested conversation', level:1});
    } else {
      await screen.findByText('This session is unavailable or you no longer have access.');
      expect(screen.queryByRole('heading', {name:'Requested conversation', level:1})).toBeNull();
    }
    expect(screen.queryByRole('heading', {name:'Latest conversation', level:1})).toBeNull();
  });
  it('does not reset comparison models when opening global Settings',async()=>{
    stubFetch(vi.fn(async()=>jsonResponse({data:[]})));
    const user=userEvent.setup();
    render(<SidebarProvider><MemoryRouter initialEntries={['/chat?model=fast&new=1']}>
      <Link to="/chat?model=fast&new=1&settings=appearance">Open global Settings</Link>
      <PlaygroundView token="admin-session" models={['fast','other']} initialScope={scope}/>
    </MemoryRouter></SidebarProvider>);
    await screen.findByRole('button',{name:'Edit comparison models (1 selected)'});
    await user.click(screen.getByRole('button',{name:'Choose models',exact:true}));
    await user.click(screen.getByRole('button',{name:'other',exact:true}));
    await user.click(screen.getByRole('button',{name:'Close dialog',exact:true}));
    expect(screen.getByRole('button',{name:'Edit comparison models (2 selected)'})).toBeTruthy();
    await user.click(screen.getByRole('link',{name:'Open global Settings'}));
    expect(screen.getByRole('button',{name:'Edit comparison models (2 selected)'})).toBeTruthy();
  });
  it('caps comparison selection at four while allowing replacement of a selected model', async () => {
    stubFetch(vi.fn(async () => jsonResponse({data:[]})));
    const user = userEvent.setup();
    renderPlayground();
    await screen.findByRole('button', {name:'Edit comparison models (2 selected)'});
    await user.click(screen.getByRole('button', {name:'Choose models',exact:true}));
    await user.click(screen.getByRole('button', {name:'balanced',exact:true}));
    await user.click(screen.getByRole('button', {name:'unused',exact:true}));
    expect((screen.getByRole('button', {name:'spare',exact:true}) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', {name:'strong',exact:true}));
    expect((screen.getByRole('button', {name:'spare',exact:true}) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', {name:'spare',exact:true}));
    await user.click(screen.getByRole('button', {name:'Close dialog',exact:true}));
    expect(screen.getByRole('button', {name:'Edit comparison models (4 selected)'})).toBeTruthy();
  });
  it('returns focus to the archive button after archived chats closes', async () => {
    stubFetch(vi.fn(async () => jsonResponse({ data: [] })));
    const user = userEvent.setup();
    renderPlayground();
    await user.click(screen.getByRole('button', { name: 'Archived chats', exact: true }));
    const dialog = screen.getByRole('dialog', { name: 'Archived chats' });
    await user.click(within(dialog).getByRole('button', { name: 'Close', exact: true }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Archived chats', exact: true })));
    expect(screen.queryByRole('dialog', { name: 'Archived chats' })).toBeNull();
  });

  it('lets settings close after a draft conflict without discarding local edits',async()=>{
    stubFetch(vi.fn(async()=>jsonResponse({data:[]})));
    const user=userEvent.setup();renderPlayground(['fast','other']);
    await waitFor(()=>expect((screen.getByLabelText('Prompt for all selected models') as HTMLTextAreaElement).disabled).toBe(false));
    serverDrafts.set('/admin/v1/organizations/org-a/projects/workspace-a/chat-draft',{revision:1,payload:{sessionId:null,prompt:'Other tab',models:['fast'],attachments:[],settings:{systemPrompt:'Remote instructions',maxTokens:512,temperature:0.7,logPayloads:true}}});
    await user.type(screen.getByLabelText('Prompt for all selected models'),'My local draft');
    await user.click(screen.getByRole('button',{name:'Chat settings',exact:true}));
    await user.type(screen.getByLabelText('System instructions'),'My local instructions');
    await screen.findByText('This draft changed in another tab. Load the saved draft before continuing.');
    await user.click(screen.getByRole('button',{name:'Close chat settings'}));
    expect(screen.queryByRole('dialog',{name:'Chat settings'})).toBeNull();
    expect((screen.getByLabelText('Prompt for all selected models') as HTMLTextAreaElement).value).toBe('My local draft');
    expect(screen.getByRole('button',{name:'Load saved draft'})).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Chat settings',exact:true}));
    expect((screen.getByLabelText('System instructions') as HTMLTextAreaElement).value).toBe('My local instructions');
  });
  it('restores an unsent composer and settings without creating a conversation',async()=>{
    stubFetch(vi.fn(async()=>jsonResponse({data:[]})));
    const user=userEvent.setup();const first=renderPlayground(['fast','other']);
    await waitFor(()=>expect((screen.getByLabelText('Prompt for all selected models') as HTMLTextAreaElement).disabled).toBe(false));
    await user.type(screen.getByLabelText('Prompt for all selected models'),'Unsent question');
    await user.click(screen.getByRole('button',{name:'Chat settings',exact:true}));
    await user.type(screen.getByLabelText('System instructions'),'Be concise');
    await user.click(screen.getByRole('button',{name:'Close chat settings'}));
    await waitFor(()=>expect(serverDrafts.values().next().value?.payload).toMatchObject({prompt:'Unsent question',settings:{systemPrompt:'Be concise'}}));
    expect(serverChats.size).toBe(0);first.unmount();
    renderPlayground(['fast','other']);
    await waitFor(()=>expect((screen.getByLabelText('Prompt for all selected models') as HTMLTextAreaElement).value).toBe('Unsent question'));
    await user.click(screen.getByRole('button',{name:'Chat settings',exact:true}));
    expect((screen.getByLabelText('System instructions') as HTMLTextAreaElement).value).toBe('Be concise');
    expect(serverChats.size).toBe(0);
  });
  it('discards a file read that finishes after starting a new chat', async () => {
    stubFetch(vi.fn(async () => jsonResponse({data:[]})));
    renderPlayground();
    const user=userEvent.setup();
    await screen.findByText('No sessions yet');
    let finish!: (content:string)=>void;
    const file=new File(['private content'],'pending.md',{type:'text/plain'});
    const read=vi.fn(()=>new Promise<string>(resolve=>{finish=resolve;}));
    Object.defineProperty(file,'text',{value:read});
    await user.upload(screen.getByLabelText('Upload chat attachments'),file);
    expect(read).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button',{name:'New generation',exact:true}));
    await act(async()=>{finish('private content');});
    expect(screen.queryByRole('button',{name:'Remove pending.md'})).toBeNull();
    const next=new File(['next content'],'next.md',{type:'text/plain'});
    Object.defineProperty(next,'text',{value:async()=>'next content'});
    await user.upload(screen.getByLabelText('Upload chat attachments'),next);
    expect(await screen.findByRole('button',{name:'Remove next.md'})).toBeTruthy();
  });
  it('retries failed history without reporting an empty chat list', async () => {
    let historyReads=0;
    stubChatFetch(vi.fn(async (input:RequestInfo | URL) => {
      if (String(input).endsWith('/chat-sessions')) {
        historyReads++;
        return historyReads===1 ? new Response('{}',{status:503}) : jsonResponse({data:[{id:'saved',prompt:'Recovered conversation',createdAt:1,results:[]}]});
      }
      return jsonResponse({data:[]});
    }));
    renderPlayground();
    const user=userEvent.setup();
    expect(await screen.findByText('Could not load chat history.')).toBeTruthy();
    expect(screen.queryByText('No sessions yet')).toBeNull();
    await user.click(screen.getByRole('button',{name:'Retry chat history'}));
    await screen.findByRole('heading',{name:'Recovered conversation',level:1});
    expect(historyReads).toBe(2);
    expect(screen.queryByText('Could not load chat history.')).toBeNull();
  });

  it('preserves a saved model selection while the account catalog reloads', async () => {
    serverChats.set('/admin/v1/organizations/org-a/projects/workspace-a/chat-sessions/saved', {
      id: 'saved', prompt: 'Saved selection', createdAt: 1,
      results: [{ model: 'fast', content: 'Saved answer', phase: 'complete', elapsedMs: 10,
        promptTokens: 1, completionTokens: 1, totalTokens: 2, attemptId: null, error: null }],
    });
    stubFetch(vi.fn(async () => jsonResponse({ data: [] })));
    const view = (models: string[], modelsLoading: boolean, modelsError = '') => <SidebarProvider><MemoryRouter>
      <PlaygroundView token="admin-session" models={models} modelsLoading={modelsLoading} modelsError={modelsError} initialScope={scope} />
    </MemoryRouter></SidebarProvider>;
    const user = userEvent.setup();
    const rendered = render(view(['fast', 'strong'], false));
    await screen.findByRole('heading', { name: 'Saved selection', level: 1 });
    await screen.findByRole('button', { name: 'Edit comparison models (1 selected)' });
    rendered.rerender(view([], true));
    expect(screen.getByText('Saved answer')).toBeTruthy();
    rendered.rerender(view([], false, 'Could not load the model catalog.'));
    expect(screen.getByText('Saved answer')).toBeTruthy();
    expect(screen.queryByRole('link', {name:'Connect supplier'})).toBeNull();
    rendered.rerender(view(['fast', 'strong'], false));
    await user.click(await screen.findByRole('button', { name: 'Choose models', exact: true }));
    const dialog = screen.getByRole('dialog', { name: 'Choose models' });
    expect(within(dialog).getByRole('button', { name: 'fast', exact: true }).getAttribute('aria-pressed')).toBe('true');
    expect(within(dialog).getByRole('button', { name: 'strong', exact: true }).getAttribute('aria-pressed')).toBe('false');
  });

  it('exports the saved backend conversation instead of browser history', async () => {
    const item = { id: 'saved', prompt: 'Saved diagnosis', createdAt: 1, results: [] };
    const exported = { format: 'niu-chat', version: 1, turns: [{ prompt: 'Authoritative saved content', results: [] }] };
    const fetch = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/export')
      ? jsonResponse(exported) : jsonResponse({ data: [item] }));
    stubChatFetch( fetch);
    let blob: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(value => { blob = value as Blob; return 'blob:test-export'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = userEvent.setup(); renderPlayground();
    await user.click(await screen.findByRole('button', { name: 'Actions for Saved diagnosis' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export', exact: true }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(click.mock.instances[0].download).toBe('niu-chat.json');
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob!);
    });
    expect(JSON.parse(content)).toEqual(exported);
    const call = fetch.mock.calls.find(([input]) => String(input).endsWith('/export'));
    expect(String(call?.[0])).toBe('/admin/v1/organizations/org-a/projects/workspace-a/chat-sessions/saved/export');
  });
  it('keeps history and reports failed export without downloading', async () => {
    const item = { id: 'saved', prompt: 'Saved diagnosis', createdAt: 1, results: [] };
    stubChatFetch( vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/export')
      ? new Response(null, { status: 503 }) : jsonResponse({ data: [item] })));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = userEvent.setup(); renderPlayground();
    await user.click(await screen.findByRole('button', { name: 'Actions for Saved diagnosis' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export', exact: true }));
    await screen.findByText('Could not export this chat. Try again from its history menu.');
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Actions for Saved diagnosis' })).toBeTruthy();
  });
  it('restores customer charge states without displaying legacy Supplier accounting', async () => {
    serverChats.set('/admin/v1/organizations/org-a/projects/workspace-a/chat-sessions/accounting', {
      id: 'accounting', prompt: 'Customer accounting', createdAt: 1,
      results: ['charged', 'pending', 'unpriced', 'not_charged', 'owner_funded'].map((status, index) => ({
        model: ['fast', 'strong', 'balanced', 'unused', 'personal'][index], content: 'Fixture response', phase: 'complete', elapsedMs: 10,
        promptTokens: 1, completionTokens: 1, totalTokens: 2, attemptId: null, error: null,
        customerChargeStatus: status, customerChargeNanos: status === 'charged' ? '4300' : null, customerChargeCurrency: status === 'charged' ? 'USD' : null,
        cashNanos: '999999999999', apiEquivalentNanos: '999999999999', currency: 'EUR',
      })),
    });
    stubFetch(vi.fn(async () => jsonResponse({ data: [] })));
    renderPlayground();
    expect(await screen.findAllByText('USD 0.0000043')).toHaveLength(2);
    expect(screen.getAllByText('Unresolved')).toHaveLength(2);
    expect(screen.getAllByText('No rate')).toHaveLength(2);
    expect(screen.getAllByText('Not charged')).toHaveLength(2);
    expect(screen.getAllByText('Own API key')).toHaveLength(2);
    expect(screen.queryByText(/EUR /)).toBeNull();
    expect(screen.queryByText('API-equivalent cost')).toBeNull();
  });
  it('persists follow-up turns and sends only each model’s completed branch after reload', async () => {
    const sent: Array<{ model: string; messages: unknown[] }> = [];
    stubFetch(vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/v1/chat/completions') {
        const body = JSON.parse(String(init?.body));
        sent.push(body);
        return streamResponse(body.model, 2, 'attempt-' + body.model);
      }
      return jsonResponse({ data: [] });
    }));
    const user = userEvent.setup();
    const view = renderPlayground(['fast', 'strong']);
    await setWorkspaceKey(user);
    await user.click(screen.getByLabelText('Prompt for all selected models'));
    await user.paste('First turn');
    await user.click(screen.getByRole('button', { name: 'Send to 2 models' }));
    await waitFor(() => expect(screen.getAllByText('Complete')).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop generating' })).toBeNull());
    view.unmount();
    localStorage.clear();
    renderPlayground(['fast', 'strong']);
    await screen.findByRole('heading', { name: 'First turn', exact: true });
    await setWorkspaceKey(user);
    await user.click(screen.getByLabelText('Prompt for all selected models'));
    await user.paste('Follow-up');
    await user.click(screen.getByRole('button', { name: 'Send to 2 models' }));
    await waitFor(() => expect(screen.getAllByText('Complete')).toHaveLength(4));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop generating' })).toBeNull());
    expect(serverChats.size).toBe(1);
    expect((Array.from(serverChats.values())[0] as { turns: unknown[] }).turns).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'First turn', exact: true })).toBeTruthy();
    for (const body of sent.slice(2)) expect(body.messages).toEqual([
      { role: 'user', content: 'First turn' },
      { role: 'assistant', content: `**${body.model}** response` },
      { role: 'user', content: 'Follow-up' },
    ]);
  });
  it('confirms server deletion and clears the active conversation after success', async () => {
    const url = '/admin/v1/organizations/org-a/projects/workspace-a/chat-sessions/saved';
    serverChats.set(url, { id: 'saved', prompt: 'Saved diagnosis', createdAt: 1, results: [] });
    stubFetch(vi.fn(async () => jsonResponse({ data: [] })));
    const user = userEvent.setup();
    const view = renderPlayground();
    await screen.findByRole('heading', { name: 'Saved diagnosis', level: 1 });
    await user.click(await screen.findByRole('button', { name: 'Actions for Saved diagnosis' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(serverChats.has(url)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Delete chat', exact: true }));
    await waitFor(() => expect(serverChats.has(url)).toBe(false));
    await screen.findByRole('heading', { name: 'New generation', level: 1 });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Actions for Saved diagnosis' })).toBeNull());
    view.unmount();
    renderPlayground();
    await screen.findByText('No sessions yet');
  });

  it('keeps saved history on rejected deletion and cancels without a request', async () => {
    const item = { id: 'saved', prompt: 'Saved diagnosis', createdAt: 1, results: [] };
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === 'DELETE'
      ? new Response(null, { status: 409 }) : jsonResponse({ data: [item] }));
    stubChatFetch( fetch);
    const user = userEvent.setup();
    renderPlayground();
    await user.click(await screen.findByRole('button', { name: 'Actions for Saved diagnosis' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Actions for Saved diagnosis' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete chat', exact: true }));
    await screen.findByText('Could not delete this chat. Try again.');
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(screen.getByRole('button', { name: 'Actions for Saved diagnosis' })).toBeTruthy();
  });
  it('opens a catalog model in a fresh draft while preserving earlier conversations', async () => {
    serverChats.set('/admin/v1/organizations/org-a/projects/workspace-a/chat-sessions/older', {
      id:'older', prompt:'Earlier task', createdAt:1,
      results:[{model:'other',content:'Earlier response',phase:'complete',elapsedMs:10,promptTokens:null,completionTokens:null,totalTokens:null,attemptId:null,error:null}],
    });
    stubFetch(vi.fn(async () => jsonResponse({data:[]})));
    render(<SidebarProvider><MemoryRouter initialEntries={['/chat?model=fast&new=1']}><PlaygroundView token="admin-session" models={['fast','other']} initialScope={scope}/></MemoryRouter></SidebarProvider>);
    await screen.findByRole('button',{name:'Earlier task',exact:true});
    expect(screen.getByRole('heading',{name:'New generation',level:1})).toBeTruthy();
    expect(screen.queryByText('Earlier response')).toBeNull();
    expect(screen.getByRole('button',{name:'Edit comparison models (1 selected)'})).toBeTruthy();
    expect(serverChats.size).toBe(1);
  });
  it('starts a fresh single-model draft from key setup without replacing saved history', async () => {
    serverChats.set('/admin/v1/organizations/org-a/projects/workspace-a/chat-sessions/older', {
      id: 'older', prompt: 'Earlier task', createdAt: 1,
      results: [{ model: 'other', content: 'Earlier response', phase: 'complete', elapsedMs: 10,
        promptTokens: null, completionTokens: null, totalTokens: null, attemptId: null,
        error: null, cashNanos: null, apiEquivalentNanos: null, currency: null }],
    });
    stubFetch(vi.fn(async () => jsonResponse({ data: [{ id: 'one-key', name: 'One model', allowed_models: ['fast'], revoked: false, expired: false }] })));
    const user = userEvent.setup();
    render(<SidebarProvider><MemoryRouter initialEntries={['/chat?key=one-key&new=1']}>
      <PlaygroundView token="admin-session" models={['fast', 'other']} initialScope={scope} />
    </MemoryRouter></SidebarProvider>);
    await screen.findByRole('button', { name: 'Earlier task', exact: true });
    await screen.findByRole('button', { name: 'API key: One model' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit comparison models (1 selected)' })).toBeTruthy());
    expect(screen.queryByText('Earlier response')).toBeNull();
    await user.type(screen.getByLabelText('Prompt for all selected models'), 'New task');
    expect((screen.getByRole('button', { name: 'Send to 1 model' }) as HTMLButtonElement).disabled).toBe(false);
    expect(serverChats.size).toBe(1);
  });

  it('aborts pending charge reads on leaving while retaining completed responses',async()=>{
    let finish!: (response:Response)=>void;
    let chargeSignal:AbortSignal|undefined;
    stubFetch(vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input);
      if(url.endsWith('/chat/completions'))return streamResponse(JSON.parse(String(init?.body)).model,3,'attempt-fixture');
      if(url.includes('/requests?')){chargeSignal=init?.signal??undefined;return new Promise<Response>(resolve=>{finish=resolve;});}
      if(url.endsWith('/keys'))return jsonResponse({data:[{id:'key-a',name:'Default',allowed_models:['*'],revoked:false,expired:false}]});
      return jsonResponse({data:[]});
    }));
    const user=userEvent.setup();const view=renderPlayground(['fast']);
    await screen.findByText('No sessions yet');
    await user.click(screen.getByRole('button',{name:/Car wash/i}));
    await waitFor(()=>expect(finish).toBeTypeOf('function'));
    expect(chargeSignal?.aborted).toBe(false);
    view.unmount();expect(chargeSignal?.aborted).toBe(true);
    await act(async()=>{finish(jsonResponse({data:[]}));});
    const saved=Array.from(serverChats.values())[0] as {results:Array<{phase:string;content:string}>};
    expect(saved.results[0].phase).toBe('complete');
    expect(saved.results[0].content).toContain('response');
  });

  it('does not start inference after leaving while conversation creation is pending',async()=>{
    const calls:string[]=[];
    let finish!: (response:Response)=>void;
    stubChatFetch(vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input);calls.push(url);
      if(init?.method==='PUT' && url.includes('/chat-sessions/'))return new Promise<Response>(resolve=>{finish=resolve;});
      if(url.endsWith('/keys'))return jsonResponse({data:[{id:'key-a',name:'Default',allowed_models:['*'],revoked:false,expired:false}]});
      return jsonResponse({data:[]});
    }));
    const user=userEvent.setup();const view=renderPlayground(['fast','strong']);
    await screen.findByText('No sessions yet');
    await user.click(screen.getByRole('button',{name:/Car wash/i}));
    await waitFor(()=>expect(finish).toBeTypeOf('function'));
    view.unmount();
    await act(async()=>{finish(jsonResponse({saved:true}));});
    expect(calls.some(url=>url.endsWith('/chat/completions'))).toBe(false);
  });

  it('does not send inference when durable session creation fails', async () => {
    const calls: string[] = [];
    stubChatFetch( vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push(url);
      if (init?.method === 'PUT') return new Response('{}', { status: 503 });
      if (url.endsWith('/keys')) return jsonResponse({ data: [{ id: 'key-a', name: 'Default', allowed_models: ['*'], revoked: false, expired: false }] });
      return jsonResponse({ data: [] });
    }));
    const user = userEvent.setup();
    renderPlayground(['fast', 'strong']);
    await screen.findByText('No sessions yet');
    await user.click(screen.getByRole('button', { name: /Car wash/i }));
    await screen.findByText('Could not save this chat. Check your connection and try again.');
    expect(calls.some(url => url.endsWith('/chat/completions'))).toBe(false);
  });

  it('keeps the selected key visible while the picker refreshes', async () => {
    let calls = 0;
    stubFetch(vi.fn(async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ data: [{ id: 'key-a', name: 'Default', allowed_models: ['*'], revoked: false, expired: false }] });
      return new Promise<Response>(() => {});
    }));
    const user = userEvent.setup();
    renderPlayground(['fast', 'strong']);
    await user.click(await screen.findByRole('button', { name: 'API key: Default' }));
    await waitFor(() => expect(calls).toBe(2));
    expect(screen.getByRole('button', { name: 'API key', exact: true }).textContent).toContain('Default');
    expect(screen.queryByLabelText('Key secret')).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'API key: Default' })).toBeTruthy();
  });

  it('runs Chat with one available model and a managed workspace key', async () => {
    const requests: string[] = [];
    stubFetch(vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/keys')) return jsonResponse({ data: [{id:'key-a',name:'Default',allowed_models:['fast'],revoked:false,expired:false}] });
      if (url.endsWith('/chat/completions')) {
        expect(new Headers(init?.headers).get('x-niu-log-payloads')).toBe('true');
        requests.push(JSON.parse(String(init?.body)).model);
        return streamResponse('fast',4,'attempt-single');
      }
      return jsonResponse({data:[]});
    }));
    const user = userEvent.setup();
    renderPlayground(['fast']);
    await screen.findByRole('button',{name:'API key: Default'});
    await waitFor(()=>expect((screen.getByLabelText('Prompt for all selected models') as HTMLTextAreaElement).disabled).toBe(false));
    await user.type(screen.getByRole('textbox',{name:'Prompt for all selected models'}),'Hello');
    await user.click(screen.getByRole('button',{name:'Send to 1 model'}));
    await waitFor(()=>expect(requests).toEqual(['fast']));
    expect(await screen.findByText('Complete')).toBeTruthy();
  });

  it.each([
    ['data: {"error":{"message":"Upstream stream failed"}}\n\ndata: [DONE]\n\n', 'Upstream stream failed'],
    ['event: error\ndata: {}\n\n', 'Niu reported an error during generation.'],
    ['data: {"choices":[{"delta":{"content":"Partial"},"finish_reason":"stop"}]}\n\n', 'The response stream ended before completion. Inspect the request before trying again.'],
  ])('does not mark an unsuccessful HTTP 200 stream complete', async (events, expectedError) => {
    stubFetch(vi.fn(async (url: string) => {
      if (url.endsWith('/keys')) return jsonResponse({data:[{id:'key-a',name:'Default',allowed_models:['fast'],revoked:false,expired:false}]});
      if (url.endsWith('/chat/completions')) return new Response(events,{headers:{'content-type':'text/event-stream','x-niu-attempt-id':'attempt-error'}});
      return jsonResponse({data:[]});
    }));
    const user=userEvent.setup();
    renderPlayground(['fast']);
    await screen.findByRole('button',{name:'API key: Default'});
    await waitFor(()=>expect((screen.getByLabelText('Prompt for all selected models') as HTMLTextAreaElement).disabled).toBe(false));
    await user.type(screen.getByRole('textbox',{name:'Prompt for all selected models'}),'Hello');
    await user.click(screen.getByRole('button',{name:'Send to 1 model'}));
    expect(await screen.findByText(expectedError)).toBeTruthy();
    expect(screen.queryByText('Complete')).toBeNull();
    await waitFor(()=>expect([...serverChats.values()].some(value => JSON.stringify(value).includes(expectedError))).toBe(true));
  });

  it('cancels and unlocks an open response stream after a terminal error without retrying', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('event: error\ndata: {"error":{"message":"Stream rejected"}}\n\n')); },
      cancel,
    });
    let dispatches = 0;
    stubFetch(vi.fn(async (url: string) => {
      if (url.endsWith('/keys')) return jsonResponse({data:[{id:'key-a',name:'Default',allowed_models:['fast'],revoked:false,expired:false}]});
      if (url.endsWith('/chat/completions')) {
        dispatches++;
        return new Response(body, {headers:{'content-type':'text/event-stream'}});
      }
      return jsonResponse({data:[]});
    }));
    const user = userEvent.setup();
    renderPlayground(['fast']);
    await screen.findByRole('button', {name:'API key: Default'});
    await waitFor(() => expect((screen.getByLabelText('Prompt for all selected models') as HTMLTextAreaElement).disabled).toBe(false));
    await user.type(screen.getByRole('textbox', {name:'Prompt for all selected models'}), 'Hello');
    await user.click(screen.getByRole('button', {name:'Send to 1 model'}));
    expect(await screen.findByText('Stream rejected')).toBeTruthy();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
    expect(dispatches).toBe(1);
  });

  it('runs an example with the selected managed key without requesting its secret', async () => {
    const requests: string[] = [];
    stubFetch(vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/keys')) return jsonResponse({ data: [{ id: 'key-a', name: 'Default', allowed_models: ['*'], revoked: false, expired: false }] });
      if (url.endsWith('/chat/completions')) {
        requests.push(url);
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer admin-session');
        const body = JSON.parse(String(init?.body));
        expect(body.messages[0].content).toContain('car');
        return streamResponse(body.model, 4, 'attempt-example');
      }
      return jsonResponse({ data: [] });
    }));
    const user = userEvent.setup();
    const view = renderPlayground(['fast', 'strong']);
    await screen.findByRole('button', { name: 'API key: Default' });
    await user.click(screen.getByRole('button', { name: /Car wash/i }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests.every(url => url === '/admin/v1/organizations/org-a/projects/workspace-a/keys/key-a/chat/completions')).toBe(true);
    expect(screen.queryByLabelText('Key secret')).toBeNull();
    await screen.findAllByText('Complete');
    await waitFor(() => expect([...serverChats.values()].some(item => (item as {results: {phase: string}[]}).results.every(result => result.phase === 'complete'))).toBe(true));
    localStorage.clear();
    view.unmount();
    renderPlayground(['fast', 'strong']);
    await screen.findAllByText('Complete');
    expect(screen.getByRole('textbox', { name: 'Prompt for all selected models' })).toHaveProperty('value', '');
    expect(requests).toHaveLength(2);
    expect(JSON.stringify(localStorage)).not.toContain('admin-session');
  });

  it('returns to the complete task gallery when starting a new comparison', async () => {
    stubFetch(vi.fn(async()=>jsonResponse({data:[]})));
    const user = userEvent.setup();
    renderPlayground(['fast', 'strong']);

    await user.click(screen.getByRole('tab', { name: 'Reasoning' }));
    expect(screen.getByRole('button', { name: /Car wash/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Snake game/i })).toBeNull();

    await waitFor(()=>expect((screen.getByRole('button',{name:'New generation'}) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole('button', { name: 'New generation' }));
    expect(screen.getByRole('tab', { name: 'All tasks' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: /Snake game/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Backend engineer job post/i })).toBeTruthy();
  });

  it('starts with the task, keeps key/model setup in the header, and compares identical requests with measured evidence', async () => {
    const requests: Array<{ url: string; headers: Headers; body?: string }> = [];
    const pendingInference: Array<{ model: string; resolve: (response: Response) => void }> = [];
    let allInferenceStarted!: () => void;
    const inferenceStarted = new Promise<void>(resolve => { allInferenceStarted = resolve; });
    stubFetch(vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
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
          { attempt_id: 'attempt-fast', customer_charge_status: 'charged', customer_charge_nanos: '1000000', customer_charge_currency: 'USD', cash_nanos: '999999999999', api_equivalent_nanos: '999999999999', currency: 'EUR' },
          { attempt_id: 'attempt-strong', customer_charge_status: 'charged', customer_charge_nanos: '2000000', customer_charge_currency: 'USD', cash_nanos: '999999999999', currency: 'EUR' },
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
    expect(screen.getByRole('heading', { name: 'Generations' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Workspace billed for these requests' })).toBeNull();
    expect(screen.getByRole('button', { name: /API key: Choose API key/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chat settings' })).toBeTruthy();
    expect(screen.queryByText('Parameters')).toBeNull();
    await user.hover(screen.getByRole('button', {name:'Edit comparison models (2 selected)'}));
    expect(await screen.findByText('fast')).toBeTruthy();
    expect(screen.getByText('strong')).toBeTruthy();
    await user.unhover(screen.getByRole('button', {name:'Edit comparison models (2 selected)'}));
    expect(screen.getByRole('button', { name: /Car wash/i })).toBeTruthy();
    expect(within(screen.getByRole('tablist',{name:'Task category'})).getAllByRole('tab')).toHaveLength(5);
    expect(screen.queryByRole('tablist',{name:'Generation type'})).toBeNull();
    await user.click(screen.getByRole('tab',{name:'All tasks'}));
    expect(screen.getByRole('tab',{name:'Video'})).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Choose models' }));
    await user.click(screen.getByRole('button', { name: 'balanced' }));
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    await setWorkspaceKey(user);
    await user.click(screen.getByLabelText('Prompt for all selected models'));
    await user.paste('Compare this request across providers.');
    await user.click(screen.getByRole('button', { name: 'Chat settings' }));
    expect(screen.getByRole('heading', { name: 'Chat settings' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Save payloads in Logs' }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('checkbox', { name: 'Save payloads in Logs' }));
    await user.click(screen.getByLabelText('System instructions'));
    await user.paste('Reply with one concise line.');
    await user.clear(screen.getByLabelText('Max output tokens'));
    expect(screen.getByRole('button', { name: 'Send to 3 models' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('positive whole number');
    await user.type(screen.getByLabelText('Max output tokens'), '8192');
    await user.clear(screen.getByLabelText('Temperature'));
    await user.type(screen.getByLabelText('Temperature'), '0.4');
    await user.click(screen.getByRole('button', { name: 'Close chat settings' }));
    await user.click(screen.getByRole('button', { name: 'Send to 3 models' }));

    await inferenceStarted;
    const inference = requests.filter(request => request.url === '/v1/chat/completions');
    expect(inference).toHaveLength(3);
    expect(inference.every(request => request.headers.get('x-niu-log-payloads') === 'false')).toBe(true);
    expect(pendingInference.map(call => call.model)).toEqual(['fast', 'strong', 'balanced']);
    expect(inference.map(request => request.headers.get('authorization'))).toEqual(Array(3).fill('Bearer workspace-key-secret'));
    expect(inference.every(request => JSON.parse(request.body ?? '{}').stream === true)).toBe(true);
    expect(inference.map(request => JSON.parse(request.body ?? '{}')).map(({ model, messages, max_completion_tokens, temperature }: { model: string; messages: unknown; max_completion_tokens: number; temperature: number }) => ({ model, messages, max_completion_tokens, temperature }))).toEqual(Array.from(['fast', 'strong', 'balanced'], model => ({
      model,
      messages: [
        { role: 'system', content: 'Reply with one concise line.' },
        { role: 'user', content: 'Compare this request across providers.' },
      ],
      max_completion_tokens: 8192,
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
    expect(screen.getByRole('button', { name: /Send to 3 models/i })).toBeTruthy();
    expect(screen.getAllByText('Compare this request across providers.').length).toBeGreaterThan(1);
    expect(requests.some(request => request.headers.get('authorization') === 'Bearer admin-session' && request.url === '/v1/chat/completions')).toBe(false);
    expect(screen.getAllByRole('link', { name: 'Inspect request' })[0].getAttribute('href')).toContain('/executions?modelAlias=fast#gateway-attempt-attempt-fast');

    await user.click(screen.getByText('Compare measured usage'));
    const metrics = screen.getByRole('table');
    expect(within(metrics).getByRole('columnheader', { name: /Baseline.*fast/ })).toBeTruthy();
    expect(within(metrics).getByRole('columnheader', { name: 'strong' })).toBeTruthy();
    expect(within(metrics).getByText('USD 0.001')).toBeTruthy();
    expect(within(metrics).getAllByText('USD 0.002')).toHaveLength(1);
    expect(screen.queryByText('API-equivalent cost')).toBeNull();
    expect(screen.queryByText(/EUR /)).toBeNull();
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
    stubFetch(vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, signal: init?.signal as AbortSignal | undefined });
      if (url === '/v1/chat/completions') return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    }));
    const user = userEvent.setup();
    renderPlayground(['fast', 'strong']);
    await waitFor(()=>expect((screen.getByLabelText('Prompt for all selected models') as HTMLTextAreaElement).disabled).toBe(false));
    await user.type(screen.getByLabelText('Prompt for all selected models'), 'Stop this comparison.');
    await user.click(screen.getByRole('button', { name: 'Send to 2 models' }));
    expect(await screen.findByRole('heading', { name: 'API key' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Manage keys' }).getAttribute('href')).toBe('/workspaces/workspace-a/keys');
    expect(screen.getByLabelText('Key secret')).toBeTruthy();
    expect(screen.queryByText('Choose a workspace API key before sending this prompt.')).toBeNull();
    expect(screen.queryByText('Select a workspace API key to send requests')).toBeNull();
    expect(screen.queryByText(/Create a key on the API keys page/)).toBeNull();
    expect(requests.filter(request => request.url === '/v1/chat/completions')).toHaveLength(0);
      await user.type(screen.getByLabelText('Key secret'), 'workspace-key-secret');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: 'Send to 2 models' }));
    await waitFor(() => expect(requests.filter(request => request.url === '/v1/chat/completions')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Stop generating' }));
    await waitFor(() => expect(screen.getAllByText('Cancelled')).toHaveLength(2));
    expect(requests.filter(request => request.url === '/v1/chat/completions').every(request => request.signal?.aborted)).toBe(true);
  });

  it('keeps per-model failures independent across follow-up turns', async () => {
    let strongCalls = 0;
    stubFetch(vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
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
    await user.click(screen.getByLabelText('Prompt for all selected models'));
    await user.paste('Test independent routes.');
    await user.click(screen.getByRole('button', { name: 'Send to 2 models' }));
    await waitFor(() => expect(container.querySelector('.playground-result-card .playground-response')?.textContent).toContain('fast response'));
    expect(await screen.findByText('This model is temporarily unavailable.')).toBeTruthy();
    expect(screen.getAllByText('Complete')).toHaveLength(1);
    expect(screen.getAllByText('Failed')).toHaveLength(1);
    expect(screen.getByLabelText('Prompt for all selected models')).toHaveProperty('value', '');
    await user.click(screen.getByLabelText('Prompt for all selected models'));
    await user.paste('Test independent routes.');
    await user.click(screen.getByRole('button', { name: 'Send to 2 models' }));
    await waitFor(() => expect(container.querySelectorAll('.playground-result-card .playground-response')[2]?.textContent).toContain('strong response'));
    expect(screen.getByText('This model is temporarily unavailable.')).toBeTruthy();
    expect(screen.getAllByText('Complete')).toHaveLength(3);
    expect(screen.getAllByText('Failed')).toHaveLength(1);
  });

  it('resets the prompt and aborts requests when changing workspace', async () => {
    const requests: Array<{ url: string; signal?: AbortSignal }> = [];
    stubFetch(vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
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
    render(<SidebarProvider><MemoryRouter initialEntries={['/workspaces/workspace-a/playground']}>
      <Link to="/workspaces/workspace-b/playground">Switch workspace</Link>
      <Routes><Route path="/workspaces/:workspace/playground" element={<WorkspacePlayground />} /></Routes>
    </MemoryRouter></SidebarProvider>);
    await setWorkspaceKey(user);
    await user.click(screen.getByLabelText('Prompt for all selected models'));
    await user.paste('Only for workspace A.');
    await user.click(screen.getByRole('button', { name: 'Send to 2 models' }));
    await waitFor(() => expect(requests.filter(request => request.url === '/v1/chat/completions')).toHaveLength(2));
    const calls = requests.filter(request => request.url === '/v1/chat/completions');
    await user.click(screen.getByRole('link', { name: 'Switch workspace' }));
    expect((screen.getByLabelText('Prompt for all selected models') as HTMLTextAreaElement).value).toBe('');
    expect(calls.every(request => request.signal?.aborted)).toBe(true);
  });
});

it('archives and restores backend history without deleting conversation content', async () => {
  const item = {id:'saved',prompt:'Saved diagnosis',createdAt:1,results:[]};
  let archived = false; const mutations: boolean[] = [];
  stubChatFetch(vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    if(url.endsWith('/saved/archive')) { archived=JSON.parse(String(init?.body)).archived; mutations.push(archived); return new Response(null,{status:204}); }
    if(url.includes('/chat-sessions')) return jsonResponse({data: archived===url.endsWith('?archived=true') ? [item] : []});
    return jsonResponse({data:[]});
  }));
  const user=userEvent.setup(); renderPlayground();
  await user.click(await screen.findByRole('button',{name:'Actions for Saved diagnosis'}));
  await user.click(screen.getByRole('menuitem',{name:'Archive',exact:true}));
  await screen.findByText('Chat archived.');
  expect(screen.queryByRole('button',{name:'Actions for Saved diagnosis'})).toBeNull();
  await user.click(screen.getByRole('button',{name:'Archived chats',exact:true}));
  const dialog=screen.getByRole('dialog',{name:'Archived chats'});
  await user.click(await within(dialog).findByRole('button',{name:'Restore Saved diagnosis'}));
  await within(dialog).findByText('No archived chats');
  await user.click(within(dialog).getByRole('button',{name:'Close',exact:true}));
  expect(screen.getByRole('button',{name:'Actions for Saved diagnosis'})).toBeTruthy();
  expect(mutations).toEqual([true,false]);
});

it('keeps active history when archive is rejected', async () => {
  const item={id:'saved',prompt:'Retained diagnosis',createdAt:1,results:[]};
  stubChatFetch(vi.fn(async(input:RequestInfo|URL)=>String(input).endsWith('/archive') ? new Response(null,{status:403}) : jsonResponse({data:[item]})));
  const user=userEvent.setup(); renderPlayground();
  await user.click(await screen.findByRole('button',{name:'Actions for Retained diagnosis'}));
  await user.click(screen.getByRole('menuitem',{name:'Archive',exact:true}));
  await screen.findByText('Could not archive this chat. Try again from its history menu.');
  expect(screen.getByRole('button',{name:'Actions for Retained diagnosis'})).toBeTruthy();
});

it('keeps archived content when restore fails and distinguishes archive read errors', async () => {
  const item={id:'saved',prompt:'Archived diagnosis',createdAt:1,results:[]};
  let readFails=true;
  stubChatFetch(vi.fn(async(input:RequestInfo|URL)=>{
    const url=String(input);
    if(url.endsWith('/archive')) return new Response(null,{status:503});
    if(url.endsWith('?archived=true')) return readFails ? new Response(null,{status:503}) : jsonResponse({data:[item]});
    return jsonResponse({data:[]});
  }));
  const user=userEvent.setup();renderPlayground();
  await screen.findByText('No sessions yet');
  await user.click(screen.getByRole('button',{name:'Archived chats',exact:true}));
  let dialog=screen.getByRole('dialog',{name:'Archived chats'});
  await within(dialog).findByText('Could not load archived chats.');
  expect(within(dialog).queryByText('No archived chats')).toBeNull();
  readFails=false;
  await user.click(within(dialog).getByRole('button',{name:'Retry',exact:true}));
  expect(screen.getByRole('dialog',{name:'Archived chats'})).toBe(dialog);
  await user.click(await within(dialog).findByRole('button',{name:'Restore Archived diagnosis'}));
  await within(dialog).findByText('Could not restore this chat. Try again.');
  expect(within(dialog).getByText('Archived diagnosis')).toBeTruthy();
  expect(within(dialog).getByRole('button',{name:'Restore Archived diagnosis'})).toBeTruthy();
});

it('persists existing chat settings on panel dismissal without sending another message', async () => {
 serverChats.clear();
 const url='/admin/v1/organizations/org-a/projects/workspace-a/chat-sessions/settings-only';
 const originalResponse={model:'fast',content:'Original answer',phase:'complete',elapsedMs:10,promptTokens:1,completionTokens:1,totalTokens:2,attemptId:null,error:null};
 serverChats.set(url,{id:'settings-only',prompt:'Saved conversation',createdAt:1,results:[originalResponse],settings:{systemPrompt:'',maxTokens:512,temperature:0.7,logPayloads:true}});
 stubFetch(vi.fn(async ()=>jsonResponse({data:[]})));
 const successfulFetch=fetch;let failSave=true;
 stubChatFetch(vi.fn((input:RequestInfo | URL,init?:RequestInit)=>{
  if (init?.method==='PUT' && failSave) {failSave=false;return Promise.resolve(new Response('{}',{status:503}));}
  return successfulFetch(input,init);
 }));
 const view=renderPlayground();const user=userEvent.setup();
 await screen.findByRole('button',{name:'Saved conversation'});
 await user.click(screen.getByRole('button',{name:'Chat settings'}));
 await user.clear(screen.getByLabelText('Max output tokens'));
 await user.type(screen.getByLabelText('Max output tokens'),'2048');
 await user.click(screen.getByRole('checkbox',{name:'Save payloads in Logs'}));
 await user.click(screen.getByRole('button',{name:'Close chat settings'}));
 await screen.findByText('Could not save chat settings. Your changes are still here.');
 expect((screen.getByLabelText('Max output tokens') as HTMLInputElement).value).toBe('2048');
 await user.click(screen.getByRole('button',{name:'Retry saving settings'}));
 await waitFor(()=>expect((serverChats.get(url) as {settings:{maxTokens:number}}).settings.maxTokens).toBe(2048));
 expect(serverChats.get(url)).toMatchObject({prompt:'Saved conversation',results:[originalResponse],settings:{logPayloads:false}});
 view.unmount();renderPlayground();
 await screen.findByRole('button',{name:'Saved conversation'});
 expect(screen.getByText('Original answer')).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Chat settings'}));
 expect((screen.getByLabelText('Max output tokens') as HTMLInputElement).value).toBe('2048');
 expect(screen.getByRole('checkbox',{name:'Save payloads in Logs'}).getAttribute('aria-checked')).toBe('false');
});

it('does not create an empty history entry when changing settings in an unsent draft', async () => {
 serverChats.clear();
 const reads=vi.fn(async ()=>jsonResponse({data:[]}));
 stubFetch(reads);
 renderPlayground();const user=userEvent.setup();
 await screen.findByText('No sessions yet');
 await user.click(screen.getByRole('button',{name:'Chat settings'}));
 await user.clear(screen.getByLabelText('Max output tokens'));
 await user.type(screen.getByLabelText('Max output tokens'),'2048');
 await user.click(screen.getByRole('button',{name:'Close chat settings'}));
 expect(serverChats.size).toBe(0);
 expect(screen.getByText('No sessions yet')).toBeTruthy();
 expect(screen.queryByRole('dialog',{name:'Chat settings'})).toBeNull();
 await user.click(screen.getByRole('button',{name:'Chat settings'}));
 expect((screen.getByLabelText('Max output tokens') as HTMLInputElement).value).toBe('2048');
});

it('offers catalog retry without misleading supplier setup on catalog failure', async () => {
 serverChats.clear();stubFetch(vi.fn(async()=>jsonResponse({data:[]})));
 const retry=vi.fn(async()=>{});
 render(<SidebarProvider><MemoryRouter><PlaygroundView token="test" models={[]} modelsError="Could not load the model catalog." onRetryModels={retry} initialScope={scope}/></MemoryRouter></SidebarProvider>);
 const user=userEvent.setup();
 expect(screen.getByRole('alert').textContent).toContain('Could not load the model catalog.');
 expect(screen.queryByRole('link',{name:'Connect supplier'})).toBeNull();
 expect(screen.queryByRole('heading',{name:'Connect a supplier to start'})).toBeNull();
 await user.click(screen.getByRole('button',{name:'Retry model catalog'}));
 expect(retry).toHaveBeenCalledTimes(1);
});

it('does not mistake a loading catalog for an empty installation', async () => {
 serverChats.clear();stubFetch(vi.fn(async()=>jsonResponse({data:[]})));
 render(<SidebarProvider><MemoryRouter><PlaygroundView token="test" models={[]} modelsLoading initialScope={scope}/></MemoryRouter></SidebarProvider>);
 expect(screen.getByText('Loading model catalog…')).toBeTruthy();
 expect(screen.queryByRole('link',{name:'Connect supplier'})).toBeNull();
});


it('keeps a cleared temperature invalid until the user enters a value', async () => {
 serverChats.clear();stubFetch(vi.fn(async()=>jsonResponse({data:[]})));
 renderPlayground();const user=userEvent.setup();
 await screen.findByText('No sessions yet');
 await user.click(screen.getByRole('button',{name:'Chat settings',exact:true}));
 const field=screen.getByLabelText('Temperature') as HTMLInputElement;
 await user.clear(field);
 expect(field.value).toBe('');
 expect(field.getAttribute('aria-invalid')).toBe('true');
 expect(screen.getByRole('alert').textContent).toContain('Enter a temperature from 0 to 2.');
 await user.click(screen.getByRole('button',{name:'Close chat settings'}));
 expect(screen.getByRole('heading',{name:'Chat settings'})).toBeTruthy();
 await user.type(field,'0.4');
 await user.click(screen.getByRole('button',{name:'Close chat settings'}));
 await waitFor(()=>expect(screen.queryByRole('heading',{name:'Chat settings'})).toBeNull());
 await user.click(screen.getByRole('button',{name:'Chat settings',exact:true}));
 expect((screen.getByLabelText('Temperature') as HTMLInputElement).value).toBe('0.4');
});

 it('keeps empty Chat setup guidance within customer permissions', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({data: []})));
  renderPlayground([]);
  expect(await screen.findByRole('heading', {name: 'What would you like to create?'})).toBeTruthy();
  expect(screen.getByText('No text models are available. Ask a platform administrator to add a model route to the catalog.')).toBeTruthy();
  expect(screen.getByRole('tab',{name:'Video'})).toBeTruthy();
  expect(screen.queryByRole('link', {name: 'Connect supplier'})).toBeNull();
 });
