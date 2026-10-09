import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import GatewayActivity, { taskOutcome } from '../../../../src/features/executions/components/GatewayActivity';

const base = '/admin/v1/organizations/org-1/projects/project-1';

function makeRequest(attemptId: string, taskId: string | null, model: string, taskEvidence = null, customerCharge: { customer_charge_currency: string | null; customer_charge_nanos: string | null; customer_charge_status: string } = { customer_charge_currency: null, customer_charge_nanos: null, customer_charge_status: 'unpriced' }) {
  return {
    attempt_id: attemptId,
    operation_id: `operation-${attemptId}`,
    api_key_id: null,
    key_name: null,
    task_id: taskId,
    task_evidence: taskEvidence,
    model,
    provider_model: 'provider-fast-v2',
    created_at: '2026-09-27T00:05:00.000000Z',
    dispatched_at: '2026-09-27T00:05:00.000000Z',
    completed_at: '2026-09-27T00:05:00.002000Z',
    duration_ms: 2,
    execution: 'confirmed_completed',
    ...customerCharge,
    usage_confidence: 'provider_reported',
    prompt_tokens: '12',
    completion_tokens: '6',
  };
}

const summary = {
  request_count: 2,
  request_histogram: [{start_ms: 1767225600000, end_ms: 1767225601000, request_count: 2}],
  usage_count: 2,
  prompt_tokens: '24',
  completion_tokens: '12',
  timing_count: 2,
  average_duration_ms: 2,
  unresolved_customer_charge_count: 0,
  unpriced_request_count: 1,
  customer_charges: [{ currency: 'USD', amount_nanos: '250000000', charged_requests: 1 }],
  usage_by_model: [{ model_alias: 'fast', request_count: 2, usage_count: 2, prompt_tokens: '24', completion_tokens: '12', unknown_usage_count: 0 }],
  usage_by_key: [{ api_key_id: 'key-1', key_name: 'Build app', request_count: 2, usage_count: 2, prompt_tokens: '24', completion_tokens: '12', unknown_usage_count: 0 }],
};

function RouteHash() { return <output aria-label="Selected request URL">{useLocation().hash}</output>; }
function RouteQuery() { return <output aria-label="Route query">{useLocation().search}</output>; }

it('explains durable failure classifications when request payloads are unavailable', async () => {
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async input => {
    const path=String(input);
    if(path.endsWith('/keys')) return Response.json({data:[]});
    if(path.includes('/payload')) return Response.json({data:null});
    if(path.endsWith('/guardrails')) return Response.json({data:null});
    return Response.json({data:[{...makeRequest('rejected',null,'fast'),execution:'may_have_executed',failure:{kind:'upstream_region_unavailable',upstream_http_status:403},timing:{http_status:502,total_ms:1200,complete:true}}],next_cursor:null,summary});
  }));
  render(<MemoryRouter><GatewayActivity token="test" models={['fast']} initialScope={{organizationId:'org-1',projectId:'project-1'}}/></MemoryRouter>);
  await userEvent.setup().click(await screen.findByRole('button',{name:'fast',exact:true}));
  const dialog=await screen.findByRole('dialog',{name:'Request details'});
  expect(within(dialog).getByText('This model is unavailable in the upstream account’s region.')).toBeTruthy();
  expect(within(dialog).getByText('Upstream HTTP 403')).toBeTruthy();
  expect(within(dialog).getByText('Uncertain')).toBeTruthy();
  expect(await within(dialog).findByText('Request and response bodies were not retained or have expired.')).toBeTruthy();
});

it('requests a short overview preview while preserving totals and access to the full logs', async () => {
  const fetcher = vi.fn<typeof fetch>(async input => {
    const query = new URL(String(input), 'http://localhost').searchParams;
    expect(query.get('limit')).toBe('10');
    return Response.json({data: Array.from({length:10}, (_, index) => makeRequest(`recent-${index}`, null, `model-${index}`)), next_cursor:'older', summary:{...summary, request_count:61}});
  });
  vi.stubGlobal('fetch', fetcher);
  render(<MemoryRouter initialEntries={['/workspaces/demo']}><GatewayActivity compact token="test" models={[]} initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
  await screen.findByRole('button', {name:'model-9'});
  expect(screen.getByText('61')).toBeTruthy();
  expect(screen.getByText('All time · 10 recent shown')).toBeTruthy();
  expect(screen.getByRole('region', {name:'Workspace request totals'})).toBeTruthy();
  expect(within(screen.getByRole('region', {name:'Recent requests'})).getAllByRole('row')).toHaveLength(11);
  expect(screen.getByRole('link', {name:/View all requests/}).getAttribute('href')).toBe('/workspaces/demo/executions');
  expect(screen.queryByRole('button', {name:'Load older requests'})).toBeNull();
});

it('names clickable request rows with human-readable details and supports keyboard inspection', async()=>{
  const id='11111111-1111-4111-8111-111111111111';
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async()=>Response.json({data:[makeRequest(id,null,'openai/fast')],next_cursor:null,summary})));
  render(<MemoryRouter initialEntries={['/workspaces/demo']}><GatewayActivity compact token="test" models={[]} initialScope={{organizationId:'org-1',projectId:'project-1'}}/></MemoryRouter>);
  const row=await screen.findByRole('row',{name:/fast · .* · Completed/});
  expect(row.getAttribute('aria-label')).not.toContain(id);
  row.focus();await userEvent.setup().keyboard('{Enter}');
  const dialog=await screen.findByRole('dialog',{name:'Request details'});
  await waitFor(()=>expect(document.activeElement).toBe(within(dialog).getByRole('heading',{name:'Request details'})));
  await userEvent.setup().keyboard('{Escape}');
  await waitFor(()=>expect(document.activeElement).toBe(row));
});

it('preserves the API key scope when opening full logs from a compact preview', async () => {
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async () => Response.json({data:[],next_cursor:null,summary})));
  render(<MemoryRouter initialEntries={['/workspaces/demo/keys/key-1']}><GatewayActivity compact token="test" models={[]} preferredKeyId="key-1" initialScope={{organizationId:'org-1',projectId:'project-1'}}/></MemoryRouter>);
  await screen.findByRole('link',{name:/View all requests/});
  expect(screen.getByRole('region', {name:'Filtered request totals'})).toBeTruthy();
  expect(screen.queryByRole('region', {name:'Workspace request totals'})).toBeNull();
  expect(screen.getByRole('link',{name:/View all requests/}).getAttribute('href')).toBe('/workspaces/demo/executions?keyId=key-1');
});

it('does not offer to clear the fixed key scope of an empty key preview', async () => {
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async () => Response.json({data:[],next_cursor:null,summary:{...summary,request_count:0}})));
  render(<MemoryRouter initialEntries={['/workspaces/demo/keys/key-1']}><GatewayActivity compact token="test" models={[]} preferredKeyId="key-1" initialScope={{organizationId:'org-1',projectId:'project-1'}}/></MemoryRouter>);
  await screen.findByRole('heading',{name:'No requests yet'});
  expect(screen.queryByRole('button',{name:'Clear filters'})).toBeNull();
  expect(screen.getByRole('link',{name:/View all requests/}).getAttribute('href')).toContain('keyId=key-1');
});

it('shows exact reported token subsets, zero and unknown independently without losing filters', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => Response.json(String(input).endsWith('/keys') ? {data: []} : {data: [], next_cursor: null, summary: {...summary, request_count: 151, token_categories: {cached_input_tokens: '18446744073709551614', cached_input_requests: 2, cached_input_unknown_requests: 149, reasoning_output_tokens: '0', reasoning_output_requests: 1, reasoning_output_unknown_requests: 150}}})));
  render(<MemoryRouter initialEntries={['/workspaces/demo/usage?modelAlias=fast&chargeBy=key&latency=p95']}><RouteQuery /><GatewayActivity token="test" models={['fast']} statisticsOnly initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
  await screen.findByText('24 prompt · 12 output · 2 with reported usage');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', {name: 'Token metric'}));
  await user.click(await screen.findByRole('menuitemradio', {name: 'Cached input'}));
  const card = screen.getByRole('button', {name: 'Token metric'}).closest('article')!;
  expect(within(card).getByText(BigInt('18446744073709551614').toLocaleString())).toBeTruthy();
  expect(within(card).getByText('2 reported · 149 unknown · included in input')).toBeTruthy();
  const query = new URLSearchParams(screen.getByLabelText('Route query').textContent!);
  expect(query.get('tokens')).toBe('cached');
  expect(query.get('modelAlias')).toBe('fast');
  expect(query.get('chargeBy')).toBe('key');
  expect(query.get('latency')).toBe('p95');
  await user.click(screen.getByRole('button', {name: 'Token metric'}));
  await user.click(await screen.findByRole('menuitemradio', {name: 'Reasoning'}));
  expect(within(card).getByText('0')).toBeTruthy();
  expect(within(card).getByText('1 reported · 150 unknown · included in output')).toBeTruthy();
  await user.click(screen.getByRole('button', {name: 'Token metric'}));
  await user.click(await screen.findByRole('menuitemradio', {name: 'Token usage'}));
  expect(within(card).getByText('36')).toBeTruthy();
  expect(new URLSearchParams(screen.getByLabelText('Route query').textContent!).has('tokens')).toBe(false);
});

it.each([null, undefined])('keeps unreported category tokens unknown (%s)', async value => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => Response.json(String(input).endsWith('/keys') ? {data: []} : {data: [], next_cursor: null, summary: {...summary, token_categories: value === undefined ? undefined : {cached_input_tokens: null, cached_input_requests: 0, cached_input_unknown_requests: 2, reasoning_output_tokens: null, reasoning_output_requests: 0, reasoning_output_unknown_requests: 2}}})));
  render(<MemoryRouter initialEntries={['/workspaces/demo/usage?tokens=cached']}><GatewayActivity token="test" models={['fast']} statisticsOnly initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
  await screen.findByText(value === undefined ? 'Category reporting unavailable' : '0 reported · 2 unknown · included in input');
  const card = screen.getByRole('button', {name: 'Token metric'}).closest('article')!;
  expect(within(card).getByText('—')).toBeTruthy();
  expect(within(card).queryByText('0')).toBeNull();
});

it('keeps row selection and adjacent request details in the URL while retaining filters', async () => {
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async input => {
    const path=String(input);
    if (path.endsWith('/keys')) return Response.json({data:[]});
    if (path.includes('/payload')) return new Response('{}',{status:404});
    if (path.endsWith('/guardrails')) return Response.json({data:[]});
    return Response.json({data:[makeRequest('first',null,'fast'),makeRequest('second',null,'slow')],next_cursor:null,summary});
  }));
  render(<MemoryRouter initialEntries={['/workspaces/demo/executions?keyId=key-1']}><GatewayActivity token="test" models={['fast','slow']} initialScope={{organizationId:'org-1',projectId:'project-1'}}/><RouteQuery/><RouteHash/></MemoryRouter>);
  const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'fast',exact:true}));
  expect(screen.getByLabelText('Selected request URL').textContent).toBe('#gateway-attempt-first');
  const dialog=await screen.findByRole('dialog',{name:'Request details'});
  await user.click(within(dialog).getByRole('button',{name:'Next request'}));
  expect(screen.getByLabelText('Selected request URL').textContent).toBe('#gateway-attempt-second');
  expect(screen.getByLabelText('Route query').textContent).toBe('?keyId=key-1');
  await user.click(within(dialog).getByRole('button',{name:'Previous request'}));
  expect(screen.getByLabelText('Selected request URL').textContent).toBe('#gateway-attempt-first');
  await user.click(within(dialog).getByRole('button',{name:'Close',exact:true}));
  expect(screen.getByLabelText('Selected request URL').textContent).toBe('');
});

it('closes request details when navigation removes the request URL fragment', async () => {
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async input => {
    const path=String(input);
    if (path.endsWith('/keys') || path.endsWith('/guardrails')) return Response.json({data:[]});
    if (path.includes('/payload')) return new Response('{}',{status:404});
    return Response.json({data:[makeRequest('linked',null,'fast')],next_cursor:null,summary});
  }));
  let navigate!: ReturnType<typeof useNavigate>;
  function NavigationProbe() { navigate=useNavigate(); return <RouteQuery/>; }
  render(<MemoryRouter initialEntries={['/workspaces/demo/executions?keyId=key-1#gateway-attempt-linked']}><GatewayActivity token="test" models={['fast']} initialScope={{organizationId:'org-1',projectId:'project-1'}}/><NavigationProbe/></MemoryRouter>);
  await screen.findByRole('dialog',{name:'Request details'});
  await act(async()=>{await navigate('/workspaces/demo/executions?keyId=key-1');});
  await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Request details'})).toBeNull());
  expect(screen.getByLabelText('Route query').textContent).toBe('?keyId=key-1');
});

it('keeps a dismissed deep-linked sheet closed after refresh and retains key filters', async () => {
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async input => {
    const path=String(input);
    if (path.endsWith('/keys')) return Response.json({data:[]});
    if (path.includes('/payload')) return new Response('{}',{status:404});
    if (path.endsWith('/guardrails')) return Response.json({data:[]});
    return Response.json({data:[makeRequest('linked',null,'fast')],next_cursor:null,summary});
  }));
  render(<MemoryRouter initialEntries={['/workspaces/demo/executions?keyId=key-1#gateway-attempt-linked']}><GatewayActivity token="test" models={['fast']} initialScope={{organizationId:'org-1',projectId:'project-1'}}/><RouteQuery/></MemoryRouter>);
  const user=userEvent.setup();
  const dialog=await screen.findByRole('dialog',{name:'Request details'});
  await user.click(within(dialog).getByRole('button',{name:'Close',exact:true}));
  await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Request details'})).toBeNull());
  await waitFor(()=>expect(document.activeElement).toBe(document.getElementById('gateway-attempt-linked')));
  expect(screen.getByLabelText('Route query').textContent).toBe('?keyId=key-1');
  await user.click(screen.getByRole('button',{name:'Refresh requests'}));
  await screen.findByRole('button',{name:'fast',exact:true});
  expect(screen.queryByRole('dialog',{name:'Request details'})).toBeNull();
});

it('shows request cache and reasoning subsets without changing totals, preserving zero and unknown', async () => {
  const first = {...makeRequest('first', null, 'fast'), prompt_tokens: '9007199254740993', cached_input_tokens: '9007199254740993', reasoning_output_tokens: '0', finish_reasons: [{index: 0, reason: 'length'}, {index: 1, reason: 'tool_calls'}]};
  const second = {...makeRequest('second', null, 'fast'), cached_input_tokens: null, reasoning_output_tokens: null};
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => {
    const path = String(input);
    if (path.endsWith('/keys')) return Response.json({data: []});
    if (path.includes('/payload')) return Response.json({error: 'not retained'}, {status: 404});
    if (path.endsWith('/guardrails')) return Response.json({data: []});
    return Response.json({data: [first, second], next_cursor: null, summary});
  }));
  render(<MemoryRouter><GatewayActivity token="test" models={['fast']} initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
  const user = userEvent.setup();
  await user.click((await screen.findAllByRole('button', {name: 'fast', exact: true}))[0]);
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(`Cached: ${BigInt('9007199254740993').toLocaleString()}`)).toBeTruthy();
  expect(within(dialog).getByText('Reasoning: 0')).toBeTruthy();
  expect(within(dialog).getByText('Choice 1: Token limit reached')).toBeTruthy();
  expect(within(dialog).getByText('Choice 2: Tool calls')).toBeTruthy();
  expect(within(dialog).getByText(BigInt('9007199254740993').toLocaleString())).toBeTruthy();
  expect(within(dialog).getByText('6')).toBeTruthy();
  const detailContent = within(dialog).getByLabelText("Request detail content");
  detailContent.scrollTop = 500;
  await user.click(within(dialog).getByRole('button', {name: 'Next request'}));
  expect(detailContent.scrollTop).toBe(0);
  expect(document.activeElement).toBe(within(dialog).getByRole('heading', {name:'Request details'}));
  expect(within(dialog).getByText('Cached: Unknown')).toBeTruthy();
  expect(within(dialog).getByText('Reasoning: Unknown')).toBeTruthy();
  expect(within(dialog).getByText('Not reported')).toBeTruthy();
  expect(within(dialog).queryByText('Choice 1: Token limit reached')).toBeNull();
  expect(within(dialog).getByText('12')).toBeTruthy();
  expect(within(dialog).getByText('6')).toBeTruthy();
});

it('shows full-range latency percentiles and preserves filters when changing the metric', async () => {
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async input => Response.json(String(input).endsWith('/keys') ? {data:[]} : {data:[],next_cursor:null,summary:{...summary,request_count:151,timing_count:100,average_duration_ms:25,latency_percentiles:{boundary:'gateway_body_ms',sample_count:100,p50_ms:10,p95_ms:800,p99_ms:900}}})));
  render(<MemoryRouter initialEntries={['/workspaces/demo/usage?modelAlias=fast&chargeBy=key']}><RouteQuery /><GatewayActivity token="test" models={['fast']} statisticsOnly initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
  await screen.findByText('25 ms');
  const user=userEvent.setup();
  await user.click(screen.getByRole('button',{name:'Latency metric'}));
  await user.click(await screen.findByRole('menuitemradio',{name:'P95 latency'}));
  expect(screen.getByText('800 ms')).toBeTruthy();
  expect(screen.getByText('100 complete gateway timings')).toBeTruthy();
  const query=new URLSearchParams(screen.getByLabelText('Route query').textContent!);
  expect(query.get('modelAlias')).toBe('fast');expect(query.get('chargeBy')).toBe('key');expect(query.get('latency')).toBe('p95');
});

it('keeps latency unavailable when there are no completed timing samples', async () => {
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async input => Response.json(String(input).endsWith('/keys') ? {data:[]} : {data:[],next_cursor:null,summary:{...summary,timing_count:0,average_duration_ms:null,latency_percentiles:{boundary:'gateway_body_ms',sample_count:0,p50_ms:null,p95_ms:null,p99_ms:null}}})));
  render(<MemoryRouter initialEntries={['/workspaces/demo/usage?latency=p99']}><GatewayActivity token="test" models={['fast']} statisticsOnly initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
  await screen.findByText('0 complete gateway timings');
  const card=screen.getByRole('button',{name:'Latency metric'}).closest('article')!;
  expect(within(card).getByText('—')).toBeTruthy();
  expect(card.textContent).not.toContain('0 ms');
});

it('investigates full-range charges by model and key without mixing currencies or exposing IDs', async () => {
  const covered = {request_count:1,charged_requests:1,unresolved_requests:0,unpriced_requests:0,not_charged_requests:0};
  const unknown = {...covered,charged_requests:0,unresolved_requests:1,currency:null,amount_nanos:null};
  const keyId='12345678-1234-1234-1234-123456789abc';
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async input => Response.json(String(input).endsWith('/keys') ? {data:[]} : {data:[],next_cursor:null,summary:{...summary,
    charges_by_model:[{...covered,model_alias:'fast',currency:'USD',amount_nanos:'9007199254740993'},{...covered,model_alias:'fast',currency:'EUR',amount_nanos:'1000000000'},{...unknown,model_alias:'fast'}],
    charges_by_key:[{...covered,api_key_id:keyId,key_name:'Production',currency:'USD',amount_nanos:'9007199254740993'},{...unknown,api_key_id:keyId,key_name:'Production'}],
  }})));
  render(<MemoryRouter initialEntries={['/workspaces/demo/usage?from=2026-09-01&modelAlias=fast&httpStatus=502']}><RouteQuery /><GatewayActivity token="test" models={['fast']} statisticsOnly initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
  const region=await screen.findByRole('region',{name:'Customer charge breakdown'});
  await within(region).findByText('USD 9007199.254740993');
  expect(within(region).getByText('EUR 1.00')).toBeTruthy();
  expect(within(region).getByText('2 charged · 1 unresolved')).toBeTruthy();
  expect(within(region).getAllByRole('row')).toHaveLength(2);
  const user=userEvent.setup();
  await user.click(within(region).getByRole('button',{name:'Group customer charges'}));
  await user.click(await screen.findByRole('menuitemradio',{name:'API key',exact:true}));
  expect(within(region).getByText('1 charged · 1 unresolved')).toBeTruthy();
  expect(region.textContent).not.toContain(keyId);
  const url=new URL(within(region).getByRole('link',{name:'View charge requests for Production'}).getAttribute('href')!,'http://localhost');
  expect(Object.fromEntries(url.searchParams)).toEqual({from:'2026-09-01',modelAlias:'fast',keyId,httpStatus:'502'});
  expect(screen.getByLabelText('Route query').textContent).toContain('chargeBy=key');
});

describe('gateway activity', () => {
  it('links full-range delivery counts to scoped Logs while preserving date, model and key filters', async () => {
    vi.stubGlobal('fetch',vi.fn<typeof fetch>(async()=>Response.json({data:[],next_cursor:null,summary:{...summary,request_count:151,delivery_statuses:[{http_status:200,request_count:20},{http_status:502,request_count:1},{http_status:null,request_count:130}]}})));
    render(<MemoryRouter initialEntries={['/workspaces/demo/usage?from=2026-09-01&to=2026-09-05&modelAlias=fast&keyId=key-1']}><GatewayActivity token="test" models={['fast']} initialScope={{organizationId:'org-1',projectId:'project-1'}} statisticsOnly /></MemoryRouter>);
    const failed=await screen.findByRole('link',{name:'HTTP 502'});
    const url=new URL(failed.getAttribute('href')!,'http://localhost');
    expect(url.pathname).toBe('/workspaces/demo/executions');
    expect(Object.fromEntries(url.searchParams)).toEqual({from:'2026-09-01',to:'2026-09-05',modelAlias:'fast',keyId:'key-1',httpStatus:'502'});
    expect(screen.getByRole('link',{name:'Unknown'}).getAttribute('href')).toContain('httpStatus=unknown');
    expect(screen.getByRole('row',{name:'Unknown 130'})).toBeTruthy();
  });

  it('filters by recorded HTTP status and clears it without losing other URL parameters', async () => {
    const calls:string[]=[];
    vi.stubGlobal('fetch',vi.fn<typeof fetch>(async input=>{
      const url=String(input);calls.push(url);
      return Response.json(url.endsWith('/keys')?{data:[]}:{data:[makeRequest('first',null,'fast')],next_cursor:null,summary:{...summary,delivery_statuses:[{http_status:502,request_count:1},{http_status:null,request_count:1}]}});
    }));
    render(<MemoryRouter initialEntries={['/workspaces/demo/executions?modelAlias=fast&sort=input_desc&columns=status,charge']}><RouteQuery /><GatewayActivity token="test" models={['fast']} initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
    await screen.findByRole('button',{name:'fast',exact:true});
    const user=userEvent.setup();
    await user.click(screen.getByRole('button',{name:'Filter requests'}));
    fireEvent.click(screen.getByRole('menuitem',{name:'HTTP status',exact:true}));
    await user.click(await screen.findByRole('menuitemradio',{name:'HTTP 502'}));
    await waitFor(()=>expect(calls.some(url=>url.includes('http_status=502&sort=input_desc'))).toBe(true));
    expect(screen.getByLabelText('Route query').textContent).toContain('columns=status%2Ccharge');
    await user.click(await screen.findByRole('button',{name:/HTTP 502.*Remove filter/}));
    expect(screen.getByLabelText('Route query').textContent).not.toContain('httpStatus=');
    expect(screen.getByLabelText('Route query').textContent).toContain('sort=input_desc');
  });
  it('sends sorting to the server for initial pages, cursor pages and exports while preserving URL view state', async () => {
    const calls: string[] = [];
    const fetcher=vi.fn<typeof fetch>(async input => {
      const url=String(input);calls.push(url);
      if(url.endsWith('/keys'))return Response.json({data:[]});
      if(url.includes('/requests/export'))return new Response('Time (UTC),Model\r\n', {status:413});
      const params=new URL(url,'http://localhost').searchParams;
      return Response.json({data:[makeRequest(params.has('after')?'second':'first',null,'fast')],next_cursor:params.has('after')?null:'older-cursor',summary});
    });
    vi.stubGlobal('fetch',fetcher);
    render(<MemoryRouter initialEntries={['/workspaces/demo/executions?modelAlias=fast&columns=status,charge&view=diagnosis']}><RouteQuery /><GatewayActivity token="test" models={['fast']} initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
    await screen.findByRole('button',{name:'fast',exact:true});
    const user=userEvent.setup();
    await user.click(screen.getByRole('button',{name:'Request actions'}));
    await user.click(screen.getByRole('menuitemradio',{name:'Most output tokens'}));
    await waitFor(()=>expect(calls.some(url=>url.includes('model_alias=fast&sort=output_desc&limit=100'))).toBe(true));
    expect(screen.getByLabelText('Route query').textContent).toContain('columns=status%2Ccharge');
    expect(screen.getByLabelText('Route query').textContent).toContain('view=diagnosis');
    await user.click(await screen.findByRole('button',{name:'Load older requests'}));
    await waitFor(()=>expect(calls.some(url=>url.includes('sort=output_desc&limit=100&after=older-cursor'))).toBe(true));
    await user.click(screen.getByRole('button',{name:'Request actions'}));
    expect(screen.getByRole('menuitemradio',{name:'Most output tokens'}).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('menuitem',{name:'Export CSV'}));
    await waitFor(()=>expect(calls.some(url=>url.endsWith('/requests/export?model_alias=fast&sort=output_desc'))).toBe(true));
    await user.click(await screen.findByRole('button',{name:'Request actions'}));
    await user.click(screen.getByRole('menuitemradio',{name:'Newest first'}));
    expect(screen.getByLabelText('Route query').textContent).not.toContain('sort=');
    await waitFor(()=>expect(screen.getAllByRole('button',{name:'fast',exact:true})).toHaveLength(1));
  });
  it('keeps column choices in the URL, preserves filters and restores defaults without refetching', async () => {
    const fetcher = vi.fn<typeof fetch>(async input => ({ ok: true, json: async () => String(input).endsWith('/keys') ? {data: []} : {data:[makeRequest('first',null,'fast')],next_cursor:null,summary} } as Response));
    vi.stubGlobal('fetch', fetcher);
    render(<MemoryRouter initialEntries={['/workspaces/demo/executions?modelAlias=fast&view=diagnosis']}><RouteQuery /><GatewayActivity token="admin-session" models={['fast']} initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
    await screen.findByRole('button',{name:'fast',exact:true});
    const calls = fetcher.mock.calls.length;
    const user = userEvent.setup();
    await user.click(screen.getByRole('button',{name:'Table settings'}));
    expect(screen.getByRole('menuitemcheckbox',{name:'Model'}).getAttribute('aria-disabled')).toBe('true');
    await user.click(screen.getByRole('menuitemcheckbox',{name:'Input tokens'}));
    expect(screen.getByRole('menuitemcheckbox',{name:'Input tokens'}).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByLabelText('Route query').textContent).toContain('modelAlias=fast');
    expect(screen.getByLabelText('Route query').textContent).toContain('view=diagnosis');
    expect(screen.getByLabelText('Route query').textContent).toContain('columns=');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('columnheader',{name:'Input tokens'})).toBeNull();
    expect(fetcher.mock.calls.length).toBe(calls);
    await user.click(screen.getByRole('button',{name:'Table settings'}));
    await user.click(screen.getByRole('menuitem',{name:'Reset columns'}));
    expect(await screen.findByRole('columnheader',{name:'Input tokens'})).toBeTruthy();
    expect(screen.getByLabelText('Route query').textContent).not.toContain('columns=');
  });

  it('prioritizes model identity and time on mobile while keeping charges selectable', async () => {
    vi.stubGlobal('innerWidth',390);
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
    vi.stubGlobal('fetch',vi.fn<typeof fetch>(async input => ({ok:true,json:async()=>String(input).endsWith('/keys')?{data:[]}:{data:[makeRequest('first',null,'fast')],next_cursor:null,summary}} as Response)));
    const view=render(<MemoryRouter><GatewayActivity token="test" models={['fast']} initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
    expect(await screen.findByRole('columnheader',{name:'Status'})).toBeTruthy();
    expect(screen.queryByRole('columnheader',{name:'Customer charge'})).toBeNull();
    expect(screen.queryByRole('columnheader',{name:'Time'})).toBeNull();
    expect(view.container.querySelector('.request-summary-time')?.textContent).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Table settings'}));
    await user.click(screen.getByRole('menuitemcheckbox', {name: 'Customer charge'}));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('columnheader', {name: 'Customer charge'})).toBeTruthy();
    view.unmount();
    render(<MemoryRouter initialEntries={['/workspaces/demo/executions?columns=time,latency,invalid']}><GatewayActivity token="test" models={['fast']} initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
    expect(await screen.findByRole('columnheader',{name:'Time'})).toBeTruthy();
    expect(screen.getByRole('columnheader',{name:'Latency'})).toBeTruthy();
    expect(screen.queryByRole('columnheader',{name:'invalid'})).toBeNull();
    expect(screen.queryByRole('columnheader',{name:'Customer charge'})).toBeNull();
  });
  it.each([200, 413])('exports the full filtered range or shows actionable size guidance (%s)', async status => {
    const createUrl = vi.fn(() => 'blob:request-export');
    const revokeUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const content = new Blob(['Time (UTC),Model\r\n2026-09-01,fast\r\n'], { type: 'text/csv' });
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.includes('/requests/export')) {
        const query = new URL(path, 'http://localhost').searchParams;
        expect(query.get('model_alias')).toBe('fast');
        expect(query.get('key_id')).toBe('key-1');
        expect(query.get('status')).toBe('confirmed_completed');
        expect(query.has('from_ms')).toBe(true);
        expect(query.has('to_ms')).toBe(true);
        expect(query.has('limit')).toBe(false);
        expect(query.has('after')).toBe(false);
        expect(init?.headers).toEqual({ authorization: 'Bearer admin-session' });
        return { ok: status === 200, status, blob: async () => content } as Response;
      }
      return { ok: true, json: async () => path.endsWith('/keys') ? { data: [] } : { data: [makeRequest('first', null, 'fast')], summary, next_cursor: 'older-page' } } as Response;
    });
    vi.stubGlobal('fetch', fetcher);
    render(<MemoryRouter initialEntries={['/workspaces/demo/executions?from=2026-09-01&to=2026-09-05&modelAlias=fast&keyId=key-1&status=confirmed_completed']}><GatewayActivity token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);
    await screen.findByRole('button', { name: 'fast' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Request actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export CSV' }));
    if (status === 200) {
      await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
      expect(createUrl).toHaveBeenCalledWith(content);
      expect(click.mock.instances[0].download).toBe('niu-requests.csv');
      await waitFor(() => expect(revokeUrl).toHaveBeenCalledWith('blob:request-export'));
    } else {
      expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Too many requests to export. Narrow the date range, model or API key filter to 10,000 requests or fewer.');
      expect(click).not.toHaveBeenCalled();
    }
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes('/requests/export'))).toHaveLength(1);
  });

  it('cancels a pending export when the active filters change', async () => {
    let exportSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).includes('/requests/export')) {
        exportSignal = init?.signal as AbortSignal;
        return new Promise<Response>((_, reject) => exportSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
      }
      return { ok: true, json: async () => String(input).endsWith('/keys') ? { data: [] } : { data: [makeRequest('first', null, 'fast')], summary, next_cursor: null } } as Response;
    }));
    render(<MemoryRouter initialEntries={['/workspaces/demo/executions?modelAlias=fast']}><GatewayActivity token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);
    await screen.findByRole('button', { name: 'fast' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Request actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export CSV' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Preparing export…');
    await user.click(await screen.findByRole('button', { name: /Remove filter/ }));
    await waitFor(() => expect(exportSignal?.aborted).toBe(true));
    expect(screen.queryByText('Preparing export…')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows failed delivery independently of completed upstream execution and its charge', async () => {
    const request = { ...makeRequest('failed-delivery', null, 'fast'),
      timing: { total_ms: 100, dispatch_ms: 2, headers_ms: 100, first_output_ms: null, complete: true, http_status: 502 },
      customer_charge_currency: 'USD', customer_charge_nanos: '17', customer_charge_status: 'charged' };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => {
      const path = String(input);
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
      if (path === `${base}/keys`) return ok({ data: [] });
      if (path === `${base}/requests?limit=100`) return ok({ data: [request], next_cursor: null, summary });
      if (path.endsWith('/payloads')) return ok({ data: null });
      if (path.endsWith('/guardrails')) return ok({ data: null });
      throw new Error(`Unexpected request: ${path}`);
    }));
    render(<MemoryRouter><GatewayActivity token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);
    expect((await screen.findByText('Failed · HTTP 502')).classList.contains('is-failed')).toBe(true);
    await userEvent.setup().click(screen.getByRole('button', { name: 'fast' }));
    expect(await screen.findByText('HTTP 502')).toBeTruthy();
    expect(screen.getByText('Provider status')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getAllByText('USD 0.000000017').length).toBeGreaterThan(0);
  });
  it.each([true, false])('opens retained payloads with consistent complete timing (%s)', async complete => {
    const request = { ...makeRequest('retained-attempt', null, 'fast'), duration_ms: 1437, timing: { total_ms: 1486, dispatch_ms: 40, headers_ms: 1486, first_output_ms: null, complete, http_status: 200 } };
    const fetcher = vi.fn<typeof fetch>(async input => {
      const path = String(input);
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
      if (path === `${base}/keys`) return ok({ data: [] });
      if (path === `${base}/requests?limit=100`) return ok({ data: [request], next_cursor: null, summary });
      if (path === `${base}/requests/retained-attempt/payloads`) return ok({ data: {
        request: { messages: [{ role: 'user', content: 'Diagnose this request' }] },
        response: 'data: {"content":"Useful answer"}\n\ndata: [DONE]',
        content_type: 'text/event-stream', complete: true, truncated: false,
        expires_at: '2026-09-28T00:05:00Z',
      } });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<MemoryRouter><GatewayActivity token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'fast' }));
    expect(await screen.findByText('Diagnose this request')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Raw data' }));
    const prompt = await screen.findByRole('textbox', { name: 'Request payload' });
    expect((prompt as HTMLTextAreaElement).value).toContain('Diagnose this request');
    expect((screen.getByRole('textbox', { name: 'Response payload' }) as HTMLTextAreaElement).value).toContain('Useful answer');
    expect(screen.queryByText('Timeline')).toBeNull();
    expect(screen.queryByText('Usage evidence')).toBeNull();
    expect(screen.queryByText('Task evidence')).toBeNull();
    expect(prompt.hasAttribute('readonly')).toBe(true);
    expect(screen.queryByText('1,437 ms')).toBeNull();
    if (complete) expect(screen.getAllByText('1,486 ms')).toHaveLength(2);
    else {
      expect(screen.queryByText('1,486 ms')).toBeNull();
      expect(screen.getByText(/Response interrupted/)).toBeTruthy();
    }
  });

  it('distinguishes withheld and redacted output without hiding incurred customer charges', async () => {
    const rows = ['blocked', 'indeterminate', 'redacted', null].map((outcome, index) => ({
      ...makeRequest(`attempt-${index}`, null, 'fast', null, { customer_charge_currency: 'USD', customer_charge_nanos: '250000000', customer_charge_status: 'charged' }),
      output_guardrail_outcome: outcome,
    }));
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => {
      const path = String(input); calls.push(path);
      if (path === `${base}/keys`) return Response.json({ data: [] });
      const filtered = path.includes('status=output_withheld');
      return Response.json({ data: filtered ? rows.slice(0, 2) : rows, next_cursor: null, summary: { ...summary, request_count: filtered ? 2 : 4 } });
    }));
    const user = userEvent.setup();
    render(<MemoryRouter><GatewayActivity token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Filter requests' });
    await waitFor(() => expect(screen.getAllByText('Output withheld')).toHaveLength(2));
    expect(screen.getByText('Completed · Redacted')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getAllByText('USD 0.25')).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Filter requests' }));
    await user.click(screen.getByRole('menuitem', { name: 'Status', exact: true }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Output withheld', exact: true }));
    await waitFor(() => expect(calls.some(path => path.includes('status=output_withheld'))).toBe(true));
    await waitFor(() => expect(screen.queryByText('Completed · Redacted')).toBeNull());
    expect(screen.getAllByText('USD 0.25')).toHaveLength(2);
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('uses a single mobile menu for status choice and returns to filter categories', async () => {
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => String(input).endsWith('/keys') ? Response.json({ data: [] }) : Response.json({ data: [], next_cursor: null, summary })));
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/workspaces/demo/executions?view=diagnosis']}><RouteQuery /><GatewayActivity token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'Filter requests' }));
    await user.click(screen.getByRole('menuitem', { name: 'Status', exact: true }));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getByRole('menuitemradio', { name: 'Provider completed', exact: true })).toBeTruthy();
    await user.click(screen.getByRole('menuitem', { name: '← Filters', exact: true }));
    expect(screen.getByRole('menuitem', { name: 'Model', exact: true })).toBeTruthy();
    await user.click(screen.getByRole('menuitem', { name: 'Status', exact: true }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Output withheld', exact: true }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    const query = new URLSearchParams(screen.getByLabelText('Route query').textContent || '');
    expect(query.get('status')).toBe('output_withheld');
    expect(query.get('view')).toBe('diagnosis');
    await user.click(screen.getByRole('button', { name: /Output withheld\s*Remove filter/ }));
    await waitFor(() => expect(new URLSearchParams(screen.getByLabelText('Route query').textContent || '').get('status')).toBeNull());
    expect(new URLSearchParams(screen.getByLabelText('Route query').textContent || '').get('view')).toBe('diagnosis');
  });

  it('uses authoritative acceptance evidence while keeping agent claims unverified', () => {
    const claim = { authority: 'agent_claim' as const, result: 'accepted' as const };
    expect(taskOutcome({ execution_id: 'exec-claim', source: 'agent', record_id: 'claim-only', coverage: 'partial', outcomes: [claim] })).toBe('Unverified');
    expect(taskOutcome({ execution_id: 'exec-validated', source: 'agent', record_id: 'validated', coverage: 'complete', outcomes: [claim, { authority: 'deterministic_validator', result: 'accepted' }] })).toBe('Accepted');
    expect(taskOutcome({ execution_id: 'exec-conflict', source: 'agent', record_id: 'conflict', coverage: 'complete', outcomes: [{ authority: 'deterministic_validator', result: 'accepted' }, { authority: 'human_acceptance', result: 'rejected' }] })).toBe('Conflicting evidence');
  });

  it('shows gateway requests as a filterable log and pages older evidence without mixing in workspace statistics', async () => {
    const first = makeRequest('attempt-new', 'task-history', 'fast', {
      execution_id: 'execution-1', source: 'sample-agent', record_id: 'record-1', coverage: 'partial',
      outcomes: [{ authority: 'agent_claim', result: 'accepted' }],
    });
    const second = makeRequest('attempt-old', 'task-history', 'fast', null, { customer_charge_currency: 'USD', customer_charge_nanos: '250000000', customer_charge_status: 'charged' });
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      calls.push({ path, init });
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
      if (path === `${base}/keys`) return ok({ data: [{ id: 'key-1', name: 'Dev key', allowed_models: ['fast'], revoked: false, expired: false }] });
      if (path === `${base}/requests?limit=100`) return ok({ data: [first], next_cursor: 'attempt-new', summary });
      if (path === `${base}/requests?limit=100&after=attempt-new`) return ok({ data: [second], next_cursor: null, summary });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const user = userEvent.setup();
    const { container } = render(<MemoryRouter><GatewayActivity token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);

    expect(await screen.findByRole('button', { name: 'fast' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Requests/ })).toBeTruthy();
    expect(container.querySelector('.gateway-activity-summary')).toBeNull();
    const chart = screen.getByRole('img', {name: 'Requests over time'});
    expect(chart.textContent).toContain('2 requests');
    expect(screen.queryByText(/Latest .* loaded requests/)).toBeNull();
    expect(screen.queryByText('Niu base URL')).toBeNull();
    expect(screen.getByText('Provider · provider-fast-v2')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Customer charge' })).toBeTruthy();
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Load older requests' }));

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'fast' })).toHaveLength(2));
    expect(screen.getByText('USD 0.25')).toBeTruthy();
    await user.click(screen.getAllByText('2 ms')[0]);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.queryByText('attempt-new')).toBeNull();
    expect(screen.getByRole('button', { name: 'Previous request' }).hasAttribute('disabled')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Next request' }));
    expect(screen.queryByText('attempt-old')).toBeNull();
    expect(screen.getByRole('button', { name: 'Next request' }).hasAttribute('disabled')).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('heading', { name: /Requests/ })).toBeTruthy();
    expect(calls.some(call => call.path.endsWith('/requests?limit=100&after=attempt-new'))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Load older requests' })).toBeNull();
  });

  it('applies date, model, key, and status filters to the scoped feed', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      calls.push(path);
      if (path === `${base}/keys`) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'key-1', name: 'Build key', revoked: false, expired: false }] }) } as Response;
      if (path.startsWith(`${base}/requests?`)) return { ok: true, status: 200, json: async () => ({ data: [makeRequest('filtered-attempt', null, 'fast')], next_cursor: null, summary: { ...summary, request_count: 1 } }) } as Response;
      throw new Error(`Unexpected request: ${path}`);
    }));

    const user = userEvent.setup();
    render(<MemoryRouter><GatewayActivity token="admin-session" models={['fast', 'careful']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Filter requests' });
    await user.click(await screen.findByRole('button', { name: 'Filter requests' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Model', exact: true }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'fast', exact: true }));
    await user.click(await screen.findByRole('button', { name: 'Filter requests' }));
    await user.click(await screen.findByRole('menuitem', { name: 'API key', exact: true }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Build key', exact: true }));
    await user.click(await screen.findByRole('button', { name: 'Filter requests' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Status', exact: true }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Provider completed', exact: true }));
    await user.click(screen.getByRole('button', { name: 'All time' }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-27' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-27' } });

    await waitFor(() => expect(calls.some(path => path.includes('to_ms='))).toBe(true));
    const filteredPath = calls.find(path => path.includes('key_id=key-1') && path.includes('status=confirmed_completed') && path.includes('from_ms=') && path.includes('to_ms='));
    expect(filteredPath).toBeTruthy();
    const query = new URLSearchParams(filteredPath!.split('?')[1]);
    expect(query.get('model_alias')).toBe('fast');
    expect(query.get('key_id')).toBe('key-1');
    expect(query.get('status')).toBe('confirmed_completed');
    expect(query.has('from_ms')).toBe(true);
    expect(query.has('to_ms')).toBe(true);
    expect(query.get('limit')).toBe('100');
  });

  it('does not inject client setup into request investigation', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === `${base}/keys`) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'key-1', name: 'Slow key', allowed_models: ['slow'], revoked: false, expired: false }] }) } as Response;
      if (path === `${base}/requests?limit=100`) return { ok: true, status: 200, json: async () => ({ data: [], next_cursor: null, summary: { ...summary, request_count: 0, usage_count: 0, prompt_tokens: '0', completion_tokens: '0', timing_count: 0, average_duration_ms: null, unresolved_customer_charge_count: 0, unpriced_request_count: 0, customer_charges: [], usage_by_model: [] } }) } as Response;
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<MemoryRouter><GatewayActivity token="admin-session" models={['fast', 'slow']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'No requests yet' });
    expect(screen.queryByText('Niu base URL')).toBeNull();
    expect(screen.queryByText('Investigate gateway requests, outcomes, timing, and cost evidence.')).toBeNull();
    expect(screen.queryByText('Gateway calls, outcomes, and evidence for this workspace.')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Filter requests' })).toBeTruthy();
  });

  it('keeps the overview empty state quiet when Chat is already a primary action', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === `${base}/keys`) return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
      if (path === `${base}/requests?limit=10`) return { ok: true, status: 200, json: async () => ({ data: [], next_cursor: null, summary: { ...summary, request_count: 0, usage_count: 0, prompt_tokens: '0', completion_tokens: '0', timing_count: 0, average_duration_ms: null, unresolved_customer_charge_count: 0, unpriced_request_count: 0, customer_charges: [], usage_by_model: [] } }) } as Response;
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<MemoryRouter><GatewayActivity compact token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'No requests yet' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Open Chat/i })).toBeNull();
  });

  it('keeps workspace aggregates on Activity and leaves request investigation separate', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === `${base}/requests?limit=100`) return { ok: true, status: 200, json: async () => ({
        data: [makeRequest('activity-attempt', null, 'fast')], next_cursor: null, summary,
      }) } as Response;
      throw new Error(`Unexpected request: ${path}`);
    }));

    const { container } = render(<MemoryRouter><GatewayActivity token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} statisticsOnly /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Model usage' })).toBeTruthy();
    expect(screen.getByText('Matching requests')).toBeTruthy();
    expect(screen.getByText('Model usage')).toBeTruthy();
    expect(screen.getByText('24')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(container.querySelector('.gateway-task-feed')).toBeNull();
    expect(screen.getAllByRole('link', { name: /Investigate requests/i }).map(link => link.getAttribute('href'))).toEqual([
      '/workspaces/default/executions',
      '/workspaces/default/executions',
    ]);
  });

  it('preserves the selected date, model, and status when opening request evidence', async () => {
    window.history.replaceState({}, '', '/workspaces/default/usage?from=2026-09-01&to=2026-09-05&modelAlias=fast&status=confirmed_completed');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith(`${base}/requests?`)) return { ok: true, status: 200, json: async () => ({ data: [], next_cursor: null, summary }) } as Response;
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<MemoryRouter initialEntries={['/workspaces/default/usage?from=2026-09-01&to=2026-09-05&modelAlias=fast&status=confirmed_completed']}><GatewayActivity token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} statisticsOnly /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Top API keys' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View requests' }).getAttribute('href')).toBe('/workspaces/default/executions?from=2026-09-01&to=2026-09-05&modelAlias=fast&keyId=key-1&status=confirmed_completed');
  });

  it('ranks key usage and links the named key to filtered request evidence without displaying its identifier', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === `${base}/requests?limit=100`) return { ok: true, status: 200, json: async () => ({
        data: [], next_cursor: null, summary: { ...summary, request_count: 2 },
      }) } as Response;
      throw new Error(`Unexpected request: ${path}`);
    }));

    const { container } = render(<MemoryRouter><GatewayActivity token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} statisticsOnly /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Top API keys' })).toBeTruthy();
    expect(screen.getByText('Build app')).toBeTruthy();
    expect(screen.getByText('36 tokens')).toBeTruthy();
    expect(screen.getByText(/2 requests · 2 with reported usage/)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /View requests/i }).find(link => link.getAttribute('href') === '/workspaces/default/executions?keyId=key-1')).toBeTruthy();
    expect(container.textContent).not.toContain('key-1');
  });

  it('links each model usage row to matching requests while preserving active workspace filters', async () => {
    window.history.replaceState({}, '', '/workspaces/default/usage?from=2026-09-01&to=2026-09-05&keyId=key-1&status=confirmed_completed');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith(`${base}/requests?`)) return { ok: true, status: 200, json: async () => ({ data: [], next_cursor: null, summary }) } as Response;
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<MemoryRouter initialEntries={['/workspaces/default/usage?from=2026-09-01&to=2026-09-05&keyId=key-1&status=confirmed_completed']}><GatewayActivity token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} statisticsOnly /></MemoryRouter>);

    const modelEvidence = await screen.findByRole('link', { name: 'View requests for fast' });
    expect(modelEvidence.getAttribute('href')).toBe('/workspaces/default/executions?from=2026-09-01&to=2026-09-05&modelAlias=fast&keyId=key-1&status=confirmed_completed');
  });

  it('keeps API-key token totals unknown when the gateway has no reported usage', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === `${base}/requests?limit=100`) return { ok: true, status: 200, json: async () => ({
        data: [], next_cursor: null,
        summary: { ...summary, request_count: 1, usage_count: 0, prompt_tokens: '0', completion_tokens: '0', usage_by_key: [{
          api_key_id: 'key-unknown', key_name: 'Background sync', request_count: 1, usage_count: 0,
          prompt_tokens: '0', completion_tokens: '0', unknown_usage_count: 1,
        }] },
      }) } as Response;
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<MemoryRouter><GatewayActivity token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} statisticsOnly /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Top API keys' })).toBeTruthy();
    expect(screen.getByText('Unknown')).toBeTruthy();
    expect(screen.getByText(/1 request · 0 with reported usage · 1 unknown/)).toBeTruthy();
  });

  it('opens a linked request that is outside the loaded page without changing list totals', async () => {
    const fetcher=vi.fn(async(input:RequestInfo | URL)=>{
      const path=String(input);
      if (path.endsWith('/requests/older-request')) return Response.json({data:makeRequest('older-request',null,'slow')});
      if (path.endsWith('/payloads')) return Response.json({data:null});
      if (path.endsWith('/keys')) return Response.json({data:[]});
      return Response.json({data:[makeRequest('recent-request',null,'fast')],next_cursor:'next-page',summary:{...summary,request_count:105}});
    });
    vi.stubGlobal('fetch',fetcher);
    render(<MemoryRouter initialEntries={['/workspaces/project-1/executions#gateway-attempt-older-request']}><GatewayActivity token="admin-session" models={['fast','slow']} initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
    const dialog=await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('slow');
    expect(fetcher.mock.calls.some(([url])=>String(url).endsWith('/requests/older-request'))).toBe(true);
    expect(document.getElementById('gateway-attempt-older-request')).toBeNull();
    expect(document.getElementById('gateway-attempt-recent-request')).toBeTruthy();
  });

  it('returns keyboard focus to the opening row after closing request details', async () => {
    vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo | URL)=>Response.json(String(input).includes('/payloads')
      ? {data:null}
      : {data:[makeRequest('keyboard-request',null,'slow')],next_cursor:null,summary:{...summary,request_count:1}})));
    render(<MemoryRouter><GatewayActivity token="admin-session" models={['slow']} initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
    const user=userEvent.setup();
    const row=(await screen.findByRole('button',{name:'slow',exact:true})).closest('tr')!;
    row.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(()=>expect(document.activeElement).toBe(row));
  });

  it('highlights the linked request and moves focus into its details', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith(`${base}/requests?`)) {
        return { ok: true, status: 200, json: async () => ({
          data: [makeRequest('attempt-focused', null, 'slow')], next_cursor: null,
          summary: { ...summary, request_count: 1 },
        }) } as Response;
      }
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<MemoryRouter initialEntries={['/workspaces/project-1/executions?modelAlias=slow#gateway-attempt-attempt-focused']}><GatewayActivity token="admin-session" models={['fast', 'slow']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} preferredModelAlias="slow" /></MemoryRouter>);

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(document.getElementById('gateway-attempt-attempt-focused')?.classList.contains('is-focused')).toBe(true));
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });
});

it('shows owner-funded coverage without presenting missing pricing or zero charges', async () => {
  const funding = {request_count: 2, charged_requests: 0, unresolved_requests: 0, unpriced_requests: 0, not_charged_requests: 0, owner_funded_requests: 2, currency: null, amount_nanos: null};
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => Response.json(String(input).endsWith('/keys') ? {data: []} : {data: [], next_cursor: null, summary: {...summary, owner_funded_request_count: 2, unpriced_request_count: 0, customer_charges: [], charges_by_model: [{...funding, model_alias: 'fast'}], charges_by_key: [{...funding, api_key_id: 'key-1', key_name: 'Personal client'}]}})));
  render(<MemoryRouter><GatewayActivity token="test" models={['fast']} statisticsOnly initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
  const totals = await screen.findByRole('region', {name: 'Filtered request totals'});
  await within(totals).findByText('Own API key');
  expect(within(totals).getByText('2 with own API keys')).toBeTruthy();
  const breakdown = screen.getByRole('region', {name: 'Customer charge breakdown'});
  expect(within(breakdown).getByText('Own API key')).toBeTruthy();
  expect(within(breakdown).queryByText('No rate')).toBeNull();
  expect(within(breakdown).queryByText('Not charged')).toBeNull();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', {name: 'Group customer charges'}));
  await user.click(screen.getByRole('menuitemradio', {name: 'API key'}));
  expect(within(breakdown).getByText('Personal client')).toBeTruthy();
  expect(within(breakdown).getByText('2 with own API keys')).toBeTruthy();
});


it('retries a failed content read without closing the selected request', async () => {
  let failed=true;
  const fetcher=vi.fn<typeof fetch>(async input=>{
    const path=String(input);
    if(path.endsWith('/keys')) return Response.json({data:[]});
    if(path.endsWith('/guardrails')) return Response.json({data:null});
    if(path.endsWith('/payloads')) return failed ? Response.json({}, {status:503}) : Response.json({data:null});
    return Response.json({data:[makeRequest('content-retry',null,'retry-model')],next_cursor:null,summary});
  });
  vi.stubGlobal('fetch',fetcher);
  render(<MemoryRouter><GatewayActivity token="test" models={[]} initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
  const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'retry-model',exact:true}));
  const sheet=screen.getByRole('dialog');
  expect((await within(sheet).findByRole('alert')).textContent).toContain('Could not load request content');
  failed=false;
  await user.click(within(sheet).getByRole('button',{name:'Retry request content'}));
  expect(await within(sheet).findByText('Request and response bodies were not retained or have expired.')).toBeTruthy();
  expect(within(sheet).queryByRole('alert')).toBeNull();
  expect(screen.getByRole('dialog')).toBe(sheet);
  expect(fetcher.mock.calls.filter(call=>String(call[0]).endsWith('/payloads'))).toHaveLength(2);
});

it.each([undefined, {}, {request:{},response:'Body',content_type:'application/json',complete:true,truncated:false,expires_at:'invalid'}])('treats malformed retained content as a read failure rather than absent data (%j)', async data => {
  vi.stubGlobal('fetch',vi.fn<typeof fetch>(async input=>{
    const path=String(input);
    if(path.endsWith('/keys')) return Response.json({data:[]});
    if(path.endsWith('/guardrails')) return Response.json({data:null});
    if(path.endsWith('/payloads')) return Response.json({data});
    return Response.json({data:[makeRequest('invalid-content',null,'content-model')],next_cursor:null,summary});
  }));
  render(<MemoryRouter><GatewayActivity token="test" models={[]} initialScope={{organizationId:'org-1',projectId:'project-1'}}/></MemoryRouter>);
  const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'content-model',exact:true}));
  const sheet=screen.getByRole('dialog');
  expect(await within(sheet).findByText('Could not load request content.')).toBeTruthy();
  expect(within(sheet).getByRole('button',{name:'Retry request content'})).toBeTruthy();
  expect(within(sheet).queryByText('Request and response bodies were not retained or have expired.')).toBeNull();
  expect(within(sheet).queryByRole('tab',{name:'Messages'})).toBeNull();
});

it('opens a historical video request with its original workspace/key and omits text-only diagnosis',async()=>{
 const job='44444444-4444-4444-8444-444444444444';
 const key='33333333-3333-4333-8333-333333333333';
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo | URL)=>{
  const path=String(input);
  if(path.endsWith(`/requests/${job}`))return Response.json({data:{...makeRequest(job,null,'Saved video'),request_kind:'video',api_key_id:key,key_name:'Video key'}});
  if(path.endsWith('/payloads') || path.endsWith('/guardrails'))return Response.json({data:null});
  if(path.endsWith('/keys'))return Response.json({data:[]});
  return Response.json({data:[],next_cursor:null,summary:{...summary,request_count:0}});
 }));
 render(<MemoryRouter initialEntries={[`/workspaces/demo-workspace/executions#gateway-attempt-${job}`]}><GatewayActivity token="member" models={[]} initialScope={{organizationId:'org-1',projectId:'project-1'}}/></MemoryRouter>);
 const dialog=await screen.findByRole('dialog');
 const link=within(dialog).getByRole('link',{name:'Open video result'});
 const query=new URL(link.getAttribute('href')!,'http://localhost').searchParams;
 expect(query.get('workspace')).toBe('demo-workspace');
 expect(query.get('key')).toBe(key);
 expect(query.get('job')).toBe(job);
 expect(query.get('mode')).toBe('video');
 expect(within(dialog).queryByText('Input tokens')).toBeNull();
 expect(within(dialog).queryByText('Finish reason')).toBeNull();
 expect(within(dialog).queryByRole('region',{name:'Request timing'})).toBeNull();
 expect(dialog.textContent).not.toContain(job);
 expect(dialog.textContent).not.toContain(key);
});

 it.each(['usage', 'executions'])('keeps the workspace when starting Chat from empty %s', async section => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({data: [], next_cursor: null, summary: {...summary, request_count: 0, usage_by_model: []}})));
  render(<MemoryRouter initialEntries={[`/workspaces/other-workspace/${section}`]}><GatewayActivity token="test" models={[]} statisticsOnly={section === 'usage'} initialScope={{organizationId: 'org-1', projectId: 'project-1'}} /></MemoryRouter>);
  const link = await screen.findByRole('link', {name: /Open Chat/});
  expect(link.getAttribute('href')).toBe('/generations?new=1&workspace=other-workspace');
});

it('offers filter recovery instead of implying the workspace has never had activity', async () => {
 vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({data: [], next_cursor: null, summary: {...summary, request_count: 0, usage_by_model: [], usage_by_key: []}})));
 render(<MemoryRouter initialEntries={['/workspaces/demo/usage?from=2030-01-01&modelAlias=fast&httpStatus=500&tokens=reasoning']}><RouteQuery /><GatewayActivity token="test" models={[]} statisticsOnly initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
 await screen.findByText('No matching model activity');
 expect(screen.getByText('No matching API key activity')).toBeTruthy();
 expect(screen.queryByRole('link', {name: /Open Chat/})).toBeNull();
 fireEvent.click(screen.getByRole('button', {name:'Clear filters'}));
 await waitFor(() => expect(screen.getByLabelText('Route query').textContent).toBe('?tokens=reasoning'));
 expect(await screen.findByRole('link', {name:/Open Chat/})).toBeTruthy();
});
