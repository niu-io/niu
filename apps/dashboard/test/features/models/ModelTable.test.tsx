import { act, render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route, Link } from 'react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import ModelTable from '@/features/models/components/ModelTable';
const mockedContext = vi.hoisted(() => ({
  token: '',
  workspace: null as null | { id: string; organization_id: string; name: string },
  session: null as null | { kind: 'installation' | 'operator'; permissions?: { read: boolean; write: boolean; manage_operators: boolean; platform_admin?: boolean } },
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/shell/dashboard-context', () => ({ useDashboardContext: () => mockedContext }));
vi.mock('@/shell/useModelPopularity', () => ({ useModelPopularity: (models: unknown[]) => ({ models }) }));
afterEach(() => {
  mockedContext.token = '';
  mockedContext.workspace = null;
  mockedContext.session = null;
  cleanup();
});
const models = Array.from({ length: 25 }, (_, i) => ({ id: `openai/model-${i}`, provider: 'openrouter', provider_name: 'OpenRouter', public_catalog: true, catalog: {output_modalities:['text']} }));
it('searches and opens a model without losing the catalog filter on return', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/models']}><Routes><Route path="/models/*" element={<SidebarProvider><Link to="/models">Models breadcrumb</Link><ModelTable models={models} /></SidebarProvider>} /></Routes></MemoryRouter>);
  await user.type(screen.getByRole('textbox', { name: 'Search models by name or ID' }), 'model-24');
  expect(screen.queryByRole('link', { name: 'Model 0', exact: true })).toBeNull();
  await user.click(screen.getByRole('link', { name: 'Model 24', exact: true }));
  expect(screen.getByRole('complementary', { name: 'openai/model-24 route details' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Try' }).getAttribute('href')).toBe('/generations?new=1&model=openai%2Fmodel-24');
  expect(screen.getByRole('link', { name: 'Create an API key' }).getAttribute('href')).toBe('/workspaces/default/keys/new');
  await user.click(screen.getByRole('link', { name: 'Models breadcrumb' }));
  expect((screen.getByRole('textbox', { name: 'Search models by name or ID' }) as HTMLInputElement).value).toBe('model-24');
});
it('appends results instead of replacing pages and opens deep-linked details', async () => {
  const user = userEvent.setup();
  const view = render(<MemoryRouter initialEntries={['/models']}><Routes><Route path="/models/*" element={<SidebarProvider><Link to="/models">Models breadcrumb</Link><ModelTable models={models} /></SidebarProvider>} /></Routes></MemoryRouter>);
  expect(screen.getAllByRole('article')).toHaveLength(20);
  await user.click(screen.getByRole('button', { name: 'Show more models' }));
  expect(screen.getAllByRole('article')).toHaveLength(25);
  expect(screen.queryByRole('button', { name: 'Show more models' })).toBeNull();
  view.unmount();
  render(<MemoryRouter initialEntries={['/models/openai/model-24']}><Routes><Route path="/models/*" element={<SidebarProvider><Link to="/models">Models breadcrumb</Link><ModelTable models={models} /></SidebarProvider>} /></Routes></MemoryRouter>);
  expect(screen.getByRole('complementary', { name: 'openai/model-24 route details' })).toBeTruthy();
});

it('renders provider metadata and preserves the developer/model detail path', () => {
  const enriched = [{ ...models[0], customer_pricing: {currency:'USD',unit:'nanounits_per_million_tokens' as const,prompt_rate:'0',completion_rate:'2000000000'}, catalog: { name: 'Example model', description: 'Provider description', context_length: 128000 } }];
  render(<MemoryRouter initialEntries={['/models']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={enriched} /></SidebarProvider>} /></Routes></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Example model' }).getAttribute('href')).toBe('/models/openai/model-0');
  expect(screen.getByText('Provider description')).toBeTruthy();
  expect(screen.getByText('128K context')).toBeTruthy();
  expect(screen.getByText('$0.00/M input tokens')).toBeTruthy();
  expect(screen.getByText('$2.00/M output tokens')).toBeTruthy();
});

it('provides a working catalog recovery action for an unavailable model', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/models/openai/unavailable']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={models} /></SidebarProvider>} /></Routes></MemoryRouter>);
  expect(screen.getByText('Model unavailable')).toBeTruthy();
  await user.click(screen.getByRole('link', { name: 'Browse models' }));
  expect(screen.getByRole('textbox', { name: 'Search models by name or ID' })).toBeTruthy();
  expect(screen.getAllByRole('article')).toHaveLength(20);
});

it('clears both a Provider filter and an unmatched search to recover the catalog', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/models']}><SidebarProvider><ModelTable models={models} /></SidebarProvider></MemoryRouter>);
  const provider = screen.getByRole('checkbox', { name: 'OpenRouter', exact: true });
  await user.click(provider);
  await user.type(screen.getByRole('textbox', { name: 'Search models by name or ID' }), 'unavailable-example');
  expect(screen.getByText('No matching models')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(provider.getAttribute('aria-checked')).toBe('false');
  expect(document.activeElement).toBe(screen.getByRole('textbox', {name:'Search models by name or ID'}));
  expect((screen.getByRole('textbox', { name: 'Search models by name or ID' }) as HTMLInputElement).value).toBe('');
  expect(screen.getAllByRole('article')).toHaveLength(20);
});

it('shows the request fee when base token rates are zero', () => {
  const tariff = { currency: 'USD', unit: 'nanounits_per_million_tokens' as const, prompt_rate: '0', completion_rate: '0', request_fee_nanos: '10000000', minimum_charge_nanos: '0', context_tiers: [] };
  render(<MemoryRouter><SidebarProvider><ModelTable models={[{ ...models[0], customer_pricing: tariff }]} /></SidebarProvider></MemoryRouter>);
  expect(screen.queryByText('Free')).toBeNull();
  expect(screen.getByText('Request fee · $0.01')).toBeTruthy();
});

it('formats published token rates without floating point artifacts or rounding tiny rates to zero', () => {
  const enriched = [{ ...models[0], customer_pricing: {currency:'USD',unit:'nanounits_per_million_tokens' as const,prompt_rate:'1100000000',completion_rate:'1000'} }];
  render(<MemoryRouter><SidebarProvider><ModelTable models={enriched}/></SidebarProvider></MemoryRouter>);
  expect(screen.getByText('$1.1/M input tokens')).toBeTruthy();
  expect(screen.getByText('$0.000001/M output tokens')).toBeTruthy();
});

it('preserves Provider filters when their group is collapsed with the keyboard', async () => {
  const user=userEvent.setup();
  render(<MemoryRouter><SidebarProvider><ModelTable models={models}/></SidebarProvider></MemoryRouter>);
  await user.click(screen.getByRole('checkbox',{name:'OpenRouter',exact:true}));
  const trigger=screen.getByRole('button',{name:'Providers',exact:true});
  trigger.focus();await user.keyboard(' ');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('checkbox',{name:'OpenRouter',exact:true})).toBeNull();
  await user.keyboard(' ');
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('checkbox',{name:'OpenRouter',exact:true}).getAttribute('aria-checked')).toBe('true');
  await user.type(screen.getByRole('textbox',{name:'Search models by name or ID'}),'model-24');
  expect(screen.getByText('1 model')).toBeTruthy();
  expect(screen.queryByText('1 models')).toBeNull();
});


it('does not turn an imported distributor into a model developer', () => {
  const imported = [
    { id:'babelark/third-party-model', provider:'babelark', provider_name: 'BabelArk', catalog:{name:'Third-party model', output_modalities:['text']} },
    { id:'babelark/deepseek-chat', provider:'babelark', provider_name: 'BabelArk', catalog:{name:'DeepSeek Chat', output_modalities:['text']} },
  ];
  const view = render(<MemoryRouter><SidebarProvider><ModelTable models={imported}/></SidebarProvider></MemoryRouter>);
  expect(screen.queryByRole('region',{name:'Inferred developer filters'})).toBeNull();
  const providerFilters = screen.getByRole('region',{name:'Provider filters'});
  expect(within(providerFilters).getByRole('checkbox',{name:'BabelArk',exact:true})).toBeTruthy();
  const thirdParty = screen.getByRole('link',{name:'Third-party model'}).closest('article')!;
  expect(within(thirdParty).queryByText(/^Developer:/)).toBeNull();
  expect(within(thirdParty).queryByText(/^via /)).toBeNull();
  const direct = screen.getByRole('link',{name:'DeepSeek Chat'}).closest('article')!;
  expect(within(direct).queryByText(/^Developer:/)).toBeNull();
  expect(within(direct).queryByText(/^via /)).toBeNull();
  view.unmount();
  render(<MemoryRouter initialEntries={['/models/babelark/third-party-model']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={imported}/></SidebarProvider>}/></Routes></MemoryRouter>);
  expect(screen.getByRole('complementary',{name:'babelark/third-party-model route details'})).toBeTruthy();
  expect(screen.queryByText('Developer (inferred)')).toBeNull();
  expect(screen.getByText('Provider')).toBeTruthy();
  expect(screen.getByText('BabelArk')).toBeTruthy();
});

it('does not carry late clipboard feedback into another model page', async () => {
  const user=userEvent.setup();
  let rejectCopy!: (reason:Error)=>void;
  vi.spyOn(navigator.clipboard,'writeText').mockImplementation(()=>new Promise<void>((_,reject)=>{rejectCopy=reject;}));
  render(<MemoryRouter initialEntries={['/models/openai/model-0']}><Routes><Route path="/models/*" element={<SidebarProvider><Link to="/models/openai/model-1">Next model</Link><ModelTable models={models}/></SidebarProvider>}/></Routes></MemoryRouter>);
  await user.click(screen.getByRole('button',{name:'Copy',exact:true}));
  await user.click(screen.getByRole('link',{name:'Next model',exact:true}));
  await act(async()=>{rejectCopy(new Error('Clipboard unavailable'));});
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button',{name:'Copy',exact:true})).toBeTruthy();
  expect(screen.getByRole('complementary',{name:'openai/model-1 route details'})).toBeTruthy();
});

it('omits internal route publication labels from the customer catalog', () => {
  render(<MemoryRouter><SidebarProvider><ModelTable models={[models[0],{...models[1],public_catalog:false}]}/></SidebarProvider></MemoryRouter>);
  expect(screen.queryByText('Configured route')).toBeNull();
  expect(screen.queryByText('Public catalog')).toBeNull();
});

it('sorts the visible names naturally and by context length',async()=>{
  const entries=[{...models[0],id:'z/first',catalog:{name:'Alpha 2',context_length:64000}},
    {...models[1],id:'a/second',catalog:{name:'Alpha 10',context_length:200000}},
    {...models[2],id:'b/third',catalog:{name:'alpha 1',context_length:32000}}];
  const user=userEvent.setup();
  render(<MemoryRouter initialEntries={['/models?sort=context']}><SidebarProvider><ModelTable models={entries}/></SidebarProvider></MemoryRouter>);
  expect(screen.getAllByRole('article').map(row=>within(row).getAllByRole('link')[0].textContent)).toEqual(['Alpha 10','Alpha 2','alpha 1']);
  await user.click(screen.getByRole('button',{name:'Sort models'}));
  await user.click(screen.getByRole('menuitemradio',{name:'Name: A–Z'}));
  expect(screen.getAllByRole('article').map(row=>within(row).getAllByRole('link')[0].textContent)).toEqual(['alpha 1','Alpha 2','Alpha 10']);
  await user.click(screen.getByRole('button',{name:'Sort models'}));
  await user.click(screen.getByRole('menuitemradio',{name:'Default order'}));
  expect(screen.getAllByRole('article').map(row=>within(row).getAllByRole('link')[0].textContent)).toEqual(['Alpha 2','Alpha 10','alpha 1']);
});

 it('never substitutes provider purchase prices for absent customer rates', () => {
  const legacy = [{...models[0],catalog:{input_price:'0.000004',output_price:'0.000008'}}];
  render(<MemoryRouter initialEntries={['/models/openai/model-0']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={legacy}/></SidebarProvider>}/></Routes></MemoryRouter>);
  expect(screen.getAllByText('Not published')).toHaveLength(2);
  expect(screen.queryByText(/4.*M tokens/)).toBeNull();
 });

it('lets users expand a clipped model description and starts another model collapsed', async()=>{
  const style=document.createElement('style');style.textContent='#model-description {line-height:24px}';document.head.append(style);
  const height=vi.spyOn(HTMLElement.prototype,'scrollHeight','get').mockReturnValue(144);
  try {
    const entries=models.slice(0,2).map(model=>({...model,catalog:{description:'First paragraph.\n\nDocumentation: https://example.com/models and [unsafe](javascript:alert(1)).'}}));
    render(<MemoryRouter initialEntries={['/models/openai/model-0']}><Routes><Route path="/models/*" element={<SidebarProvider><Link to="/models/openai/model-1">Next model</Link><ModelTable models={entries}/></SidebarProvider>}/></Routes></MemoryRouter>);
    const user=userEvent.setup();const more=await screen.findByRole('button',{name:'Show more',exact:true});
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('link',{name:'https://example.com/models'}).tabIndex).toBe(-1);
    await user.click(more);
    const less=screen.getByRole('button',{name:'Show less',exact:true});
    expect(less.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(less);
    const documentation=screen.getByRole('link',{name:'https://example.com/models'});
    expect(documentation.getAttribute('href')).toBe('https://example.com/models');
    expect(documentation.getAttribute('rel')).toBe('noopener noreferrer');
    expect(documentation.getAttribute('target')).toBe('_blank');
    expect(documentation.tabIndex).toBe(0);
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    await user.click(screen.getByRole('link',{name:'Next model'}));
    expect((await screen.findByRole('button',{name:'Show more',exact:true})).getAttribute('aria-expanded')).toBe('false');
  } finally {height.mockRestore();style.remove();}
});


it.each([['123456789', '$0.123456789 /M tokens'], ['0', '$0.00 /M tokens'], [null, null]])('displays only the published customer cache-read tariff (%s)', (cachedRate, price) => {
  const enriched = [{ ...models[0], customer_pricing: {currency:'USD',unit:'nanounits_per_million_tokens' as const,prompt_rate:'1000000000',completion_rate:'2000000000',cached_prompt_rate:cachedRate} }];
  render(<MemoryRouter initialEntries={['/models/openai/model-0']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={enriched}/></SidebarProvider>} /></Routes></MemoryRouter>);
  if (price) {
    expect(screen.getByText('Cache read price').nextElementSibling?.textContent).toBe(price);
  } else {
    expect(screen.queryByText('Cache read price')).toBeNull();
  }
});

it('keeps developer and provider facets separate without treating access namespaces as companies', async () => {
  const user=userEvent.setup();
  const routes=[
    {id:'fastrouter/seedance-2.0-mini',provider:'fastrouter', provider_name: 'FastRouter',public_catalog:false},
    {id:'byok/claude-sonnet-4',provider:'openrouter', provider_name: 'OpenRouter',public_catalog:false},
    {id:'team/custom',provider:'byok',public_catalog:false},
    {id:'anthropic/claude-haiku',provider:'fastrouter', provider_name: 'FastRouter',public_catalog:true},
  ];
  render(<MemoryRouter><SidebarProvider><ModelTable models={routes}/></SidebarProvider></MemoryRouter>);
  const connections=within(screen.getByRole('region',{name:'Provider filters'}));
  expect(screen.queryByRole('region',{name:'Inferred developer filters'})).toBeNull();
  expect(connections.queryByRole('checkbox',{name:/byok/i})).toBeNull();
  await user.click(connections.getByRole('checkbox',{name:'FastRouter'}));
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(screen.getByRole('link',{name:'Claude Haiku',exact:true})).toBeTruthy();
  expect(screen.getByText('Provider: FastRouter')).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Clear filters'}));
  expect(screen.getAllByRole('article')).toHaveLength(4);
});

it('filters explicit modalities and capabilities together, shows tags, and clears selections', async () => {
  const user = userEvent.setup();
  const tagged = [
    {id:'openai/vision',provider:'openrouter', provider_name: 'OpenRouter',public_catalog:true,catalog:{input_modalities:['text','image'],output_modalities:['text'],supported_parameters:['tools','structured_outputs']}},
    {id:'google/video',provider:'openrouter', provider_name: 'OpenRouter',public_catalog:true,catalog:{input_modalities:['text','image'],output_modalities:['video']}},
    {id:'unknown',public_catalog:true},
  ];
  render(<MemoryRouter><SidebarProvider><ModelTable models={tagged}/></SidebarProvider></MemoryRouter>);
  await user.click(within(screen.getByRole('region',{name:'Input modalities filters'})).getByRole('checkbox',{name:'Image',exact:true}));
  expect(screen.getAllByRole('article')).toHaveLength(2);
  await user.click(within(screen.getByRole('region',{name:'Capabilities filters'})).getByRole('checkbox',{name:'Tool calling',exact:true}));
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(within(screen.getByRole('article')).getByText('Structured output')).toBeTruthy();
  await user.click(within(screen.getByRole('region',{name:'Output modalities filters'})).getByRole('checkbox',{name:'Video',exact:true}));
  expect(screen.getByText('No matching models')).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Remove Video output filter'}));
  expect(screen.getAllByRole('article')).toHaveLength(1);
  await user.click(screen.getByRole('button',{name:'Clear filters'}));
  expect(screen.getAllByRole('article')).toHaveLength(3);
  expect(screen.queryByRole('button',{name:'Remove Image input filter'})).toBeNull();
});

// Refs #104: absent metadata still lets users try Chat interactively without fabricating a verified curl example.
it.each([
  [undefined, true, false, null],
  [[], true, false, null],
  [['text'], true, false, '/chat/completions'],
  [['video'], false, true, '/video/jobs'],
  [['text', 'video'], true, true, '/video/jobs'],
  [['audio'], false, false, null],
])('offers concise Try handoffs and only documented curl examples for outputs %s', (outputs, chat, video, endpoint) => {
  const model={id:'example/model', public_catalog:true, catalog:{output_modalities:outputs}};
  render(<MemoryRouter initialEntries={['/models/example/model']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={[model]} /></SidebarProvider>} /></Routes></MemoryRouter>);
  if (chat && video) {
    expect(screen.getByRole('link', { name: 'Try chat' }).getAttribute('href')).toContain('new=1');
    expect(screen.getByRole('link', { name: 'Try video' }).getAttribute('href')).toContain('new=video');
  } else if (chat) {
    expect(screen.getByRole('link', { name: 'Try' }).getAttribute('href')).toContain('new=1');
  } else if (video) {
    expect(screen.getByRole('link', { name: 'Try' }).getAttribute('href')).toContain('new=video');
  } else {
    expect(screen.queryByRole('link', { name: 'Try' })).toBeNull();
  }
  if (endpoint) expect(document.querySelector('pre')?.textContent).toContain(endpoint);
  else expect(document.querySelector('pre')).toBeNull();
});

it('links an unknown-capability model to Chat without stamping misleading unpublished labels on callable cards', () => {
  const model = {id:'babelark/example',public_catalog:false,catalog:{output_modalities:[]}};
  const browse = render(<MemoryRouter><SidebarProvider><ModelTable models={[model]}/></SidebarProvider></MemoryRouter>);
  expect(screen.getByRole('link', {name:'Try'}).getAttribute('href')).toContain('model=babelark%2Fexample');
  expect(screen.queryByText('Capabilities not published')).toBeNull();
  expect(screen.queryByText('Not published')).toBeNull();
  browse.unmount();
  render(<MemoryRouter initialEntries={['/models/babelark/example']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={[model]}/></SidebarProvider>}/></Routes></MemoryRouter>);
  expect(screen.getByRole('link', {name:'Try'}).getAttribute('href')).toContain('model=babelark%2Fexample');
  expect(screen.getByText('Upstream did not declare input or output modalities for this model.')).toBeTruthy();
});


it('distinguishes direct Provider billing from missing platform prices without claiming availability', () => {
  const model = {...models[0], billing_source: 'own_api_key' as const};
  render(<MemoryRouter initialEntries={['/models/openai/model-0']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={[model]}/></SidebarProvider>}/></Routes></MemoryRouter>);
  expect(screen.getByText('No Niu charge')).toBeTruthy();
  expect(screen.queryByText('Not published')).toBeNull();
});
it('keeps platform funding separate from an absent price', () => {
  const model = {...models[0], billing_source: 'niu_credits' as const};
  render(<MemoryRouter initialEntries={['/models/openai/model-0']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={[model]}/></SidebarProvider>}/></Routes></MemoryRouter>);
  expect(screen.getByText(/Niu charges, when applicable, use workspace credits/)).toBeTruthy();
  expect(screen.getAllByText('Not published')).toHaveLength(2);
  expect(screen.queryByText(/Your Provider bills/)).toBeNull();
});
it('offers the current Video workflow when catalog text metadata is stale',()=>{
 const model={id:'example/stale',public_catalog:true,catalog:{output_modalities:['text']},generation_capabilities:{chat:false,video:true}};
 render(<MemoryRouter initialEntries={['/models/example/stale']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={[model]}/></SidebarProvider>}/></Routes></MemoryRouter>);
 expect(screen.getByRole('link',{name:'Try'}).getAttribute('href')).toContain('new=video');
 expect(document.querySelector('pre')?.textContent).toContain('/video/jobs');
 expect(document.querySelector('pre')?.textContent).toContain('"model":"example/stale"');
 expect(screen.getByRole('link',{name:'All models'}).getAttribute('href')).toBe('/models');
 expect(screen.queryByText('Text output')).toBeNull();
});

it('explains Video estimation without presenting token prices for a Video-only model',()=>{
 const model={id:'example/video',billing_source:'niu_credits' as const,public_catalog:true,generation_capabilities:{chat:false,video:true}};
 render(<MemoryRouter initialEntries={['/models/example/video']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={[model]}/></SidebarProvider>}/></Routes></MemoryRouter>);
 expect(screen.queryByText('Input price')).toBeNull();
 expect(screen.queryByText('Output price')).toBeNull();
 expect(screen.getByText(/Video cost depends on request settings/)).toBeTruthy();
 expect(screen.getByRole('link',{name:'Try'})).toBeTruthy();
});

it('ignores legacy inferred developer filters and preserves capability filters on detail links',()=>{
 const catalog=[
  {id:'anthropic/claude-sonnet-4',provider:'openrouter', provider_name: 'OpenRouter',public_catalog:true,catalog:{name:'Claude Sonnet 4',input_modalities:['text','image'],output_modalities:['text']}},
  {id:'openai/gpt-4o',provider:'openrouter', provider_name: 'OpenRouter',public_catalog:true,catalog:{name:'GPT-4o',input_modalities:['text','image'],output_modalities:['text']}},
 ];
 render(<MemoryRouter initialEntries={['/models?dev=anthropic&input=image']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={catalog}/></SidebarProvider>}/></Routes></MemoryRouter>);
 expect(screen.getAllByRole('article')).toHaveLength(2);
 const detailLink = screen.getByRole('link',{name:'Claude Sonnet 4'});
 expect(detailLink.getAttribute('href')).toBe('/models/anthropic/claude-sonnet-4?input=image');
});

it('shows one catalog even when an old billing-source bookmark is opened', () => {
  const mixed = [
    { id: 'qiniu-personal-qualification/z-test', billing_source: 'own_api_key' as const, public_catalog: false },
    { id: 'qiniu-personal-qualification/a-test', billing_source: 'own_api_key' as const, public_catalog: false },
    { id: 'qiniu/kimi-k3', billing_source: 'niu_credits' as const, public_catalog: true, catalog: { name: 'Kimi K3', output_modalities: ['text'] }, customer_pricing: { currency: 'USD', prompt_rate: '0', completion_rate: '0' } },
  ];
  render(<MemoryRouter initialEntries={['/models?source=own_api_key']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={mixed}/></SidebarProvider>}/></Routes></MemoryRouter>);
  const titles = screen.getAllByRole('article').map(card => within(card).getAllByRole('link')[0].textContent);
  expect(titles.sort()).toEqual(['A Test', 'Kimi K3', 'Z Test']);

  expect(screen.queryByRole('region', { name: 'Billing source filters' })).toBeNull();
});

it('renders model card titles and meta action links with default foreground color instead of primary accent', () => {
  const mixed = [
    { id: 'openai/gpt-4o', provider: 'openrouter', provider_name: 'OpenRouter', public_catalog: true, catalog: { name: 'GPT-4o', output_modalities: ['text'] } },
    { id: 'fastrouter/seedance', provider: 'fastrouter', provider_name: 'FastRouter', public_catalog: true, generation_capabilities: { chat: false, video: true }, catalog: { name: 'Seedance Video', output_modalities: ['video'] } },
  ];
  render(<MemoryRouter initialEntries={['/models']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={mixed} /></SidebarProvider>} /></Routes></MemoryRouter>);
  const titleLink = screen.getByRole('link', { name: 'GPT-4o' });
  expect(titleLink.className).toContain('text-foreground');
  expect(titleLink.className).not.toContain('text-primary');
  const tryLinks = screen.getAllByRole('link', { name: 'Try' });
  expect(tryLinks).toHaveLength(2);
  for (const link of tryLinks) {
    expect(link.className).toContain('text-foreground');
    expect(link.className).not.toContain('text-primary');
  }
});

it('hides active generation and curl CTAs for uncallable commercial models and links admins to missing pricing steps', () => {
  const uncallableModel = {
    id: 'openai/unpriced-commercial',
    provider: 'openrouter', provider_name: 'OpenRouter',
    billing_source: 'niu_credits' as const,
    public_catalog: false,
    callable: false,
    readiness_issues: ['procurement_pricing_missing', 'selling_price_missing'],
    catalog: { name: 'Unpriced Commercial', output_modalities: ['text'] },
  };
  const internalOwnKey = {
    id: 'internal/direct-chat',
    provider: 'openrouter', provider_name: 'OpenRouter',
    billing_source: 'own_api_key' as const,
    public_catalog: true,
    callable: true,
    readiness_issues: [],
    catalog: { name: 'Internal Direct', output_modalities: ['text'] },
  };

  // Non-admin list view: explicit readiness state, no active generation CTA on uncallable model,
  // while own_api_key/internal model remains callable.
  const customerList = render(
    <MemoryRouter initialEntries={['/models']}>
      <Routes>
        <Route path="/models/*" element={<SidebarProvider><ModelTable models={[uncallableModel, internalOwnKey]} /></SidebarProvider>} />
      </Routes>
    </MemoryRouter>,
  );
  const uncallableCard = screen.getByRole('link', { name: 'Unpriced Commercial' }).closest('article');
  if (!uncallableCard) throw new Error('Expected uncallable model card');
  expect(within(uncallableCard).getByText('Purchase rate & selling price missing')).toBeTruthy();
  expect(within(uncallableCard).getByText('Not published')).toBeTruthy();
  expect(within(uncallableCard).queryByRole('link', { name: 'Try' })).toBeNull();
  expect(within(uncallableCard).queryByRole('link', { name: 'Publish selling price' })).toBeNull();

  const internalCard = screen.getByRole('link', { name: 'Internal Direct' }).closest('article');
  if (!internalCard) throw new Error('Expected internal model card');
  expect(within(internalCard).getByText('No Niu charge')).toBeTruthy();
  expect(within(internalCard).getByRole('link', { name: 'Try' })).toBeTruthy();
  customerList.unmount();

  // Platform admin detail view: no Try / API key / curl example, direct links to remedy steps.
  mockedContext.session = {
    kind: 'installation',
    permissions: { read: true, write: true, manage_operators: true, platform_admin: true },
  };
  render(
    <MemoryRouter initialEntries={['/models/openai/unpriced-commercial']}>
      <Routes>
        <Route path="/models/*" element={<SidebarProvider><ModelTable models={[uncallableModel]} /></SidebarProvider>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByRole('status').textContent).toContain('Purchase rate & selling price missing');
  expect(screen.queryByRole('link', { name: 'Try' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Create an API key' })).toBeNull();
  expect(document.querySelector('pre.model-route-example')).toBeNull();
  expect(screen.getByRole('link', { name: 'Complete Provider rate' }).getAttribute('href')).toBe('/admin/providers');
  expect(screen.getByRole('link', { name: 'Publish selling price' }).getAttribute('href')).toBe('/admin/pricing?model=openai%2Funpriced-commercial&publish=text');
});

it('intercepts model trial when workspace has zero active API keys and offers 1-click auto-create & try', async () => {
  const user = userEvent.setup();
  mockedContext.token = 'member-token';
  mockedContext.workspace = { id: 'ws-zero', organization_id: 'org-1', name: 'Starter', active_key_count: 0 } as unknown as typeof mockedContext.workspace;
  mockedContext.session = { kind: 'operator', permissions: { read: true, write: true, manage_operators: false } };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/v1/workspaces/ws-zero/keys' && init?.method === 'POST') {
      return Response.json({ id: 'key-play-1', token: 'niu_secret_play', allowed_models: ['*'], key: { id: 'key-play-1', slug: 'playground', name: 'Playground', allowed_models: ['*'], invocation_allowed: true, revoked: false, expired: false } }, { status: 201 });
    }
    return Response.json({ data: [] });
  }));
  const chatModel = { id: 'deepseek/deepseek-v3', provider: 'deepseek', public_catalog: true, catalog: { name: 'DeepSeek V3', output_modalities: ['text'] } };
  render(
    <MemoryRouter initialEntries={['/workspaces/starter/models/deepseek/deepseek-v3']}>
      <Routes>
        <Route path="/workspaces/:workspace/models/*" element={<SidebarProvider><ModelTable models={[chatModel]} /></SidebarProvider>} />
        <Route path="/generations" element={<div data-testid="landed-gen">Ready</div>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByRole('status').textContent).toContain('No active API key');
  await user.click(screen.getByRole('button', { name: 'Try' }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Auto-create key & try' }));
  expect(await screen.findByTestId('landed-gen')).toBeTruthy();
});
