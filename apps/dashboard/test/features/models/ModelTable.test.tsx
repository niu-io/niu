import { act, render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route, Link } from 'react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import ModelTable from '@/features/models/components/ModelTable';
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/app/dashboard-context', () => ({ useDashboardContext: () => ({ token: '', workspace: null }) }));
vi.mock('@/app/useModelPopularity', () => ({ useModelPopularity: (models: unknown[]) => ({ models }) }));
afterEach(cleanup);
const models = Array.from({ length: 25 }, (_, i) => ({ id: `openai/model-${i}`, provider: 'openrouter', public_catalog: true }));
it('searches and opens a model without losing the catalog filter on return', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/models']}><Routes><Route path="/models/*" element={<SidebarProvider><Link to="/models">Models breadcrumb</Link><ModelTable models={models} /></SidebarProvider>} /></Routes></MemoryRouter>);
  await user.type(screen.getByRole('textbox', { name: 'Filter model routes' }), 'model-24');
  expect(screen.queryByRole('link', { name: 'openai/model-0', exact: true })).toBeNull();
  await user.click(screen.getByRole('link', { name: 'openai/model-24', exact: true }));
  expect(screen.getByRole('complementary', { name: 'openai/model-24 route details' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Try in Chat' }).getAttribute('href')).toBe('/generations?new=1&model=openai%2Fmodel-24');
  expect(screen.getByRole('link', { name: 'Create an API key' }).getAttribute('href')).toBe('/workspaces/default/keys/new');
  await user.click(screen.getByRole('link', { name: 'Models breadcrumb' }));
  expect((screen.getByRole('textbox', { name: 'Filter model routes' }) as HTMLInputElement).value).toBe('model-24');
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
  expect(screen.getByRole('link', { name: 'Example model' }).getAttribute('href')).toBe('/models/openai/model-0?workspace=default');
  expect(screen.getByText('Provider description')).toBeTruthy();
  expect(screen.getByText('128K context')).toBeTruthy();
  expect(screen.getByText('USD 0.00/M input tokens')).toBeTruthy();
  expect(screen.getByText('USD 2.00/M output tokens')).toBeTruthy();
});

it('provides a working catalog recovery action for an unavailable model', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/models/openai/unavailable']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={models} /></SidebarProvider>} /></Routes></MemoryRouter>);
  expect(screen.getByText('Model unavailable')).toBeTruthy();
  await user.click(screen.getByRole('link', { name: 'Browse models' }));
  expect(screen.getByRole('textbox', { name: 'Filter model routes' })).toBeTruthy();
  expect(screen.getAllByRole('article')).toHaveLength(20);
});

it('clears both a developer filter and an unmatched search to recover the catalog', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/models']}><SidebarProvider><ModelTable models={models} /></SidebarProvider></MemoryRouter>);
  const developer = screen.getByRole('checkbox', { name: 'OpenAI', exact: true });
  await user.click(developer);
  await user.type(screen.getByRole('textbox', { name: 'Filter model routes' }), 'unavailable-example');
  expect(screen.getByText('No matching models')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(developer.getAttribute('aria-checked')).toBe('false');
  expect(document.activeElement).toBe(screen.getByRole('textbox', {name:'Filter model routes'}));
  expect((screen.getByRole('textbox', { name: 'Filter model routes' }) as HTMLInputElement).value).toBe('');
  expect(screen.getAllByRole('article')).toHaveLength(20);
});

it('formats published token rates without floating point artifacts or rounding tiny rates to zero', () => {
  const enriched = [{ ...models[0], customer_pricing: {currency:'USD',unit:'nanounits_per_million_tokens' as const,prompt_rate:'1100000000',completion_rate:'1000'} }];
  render(<MemoryRouter><SidebarProvider><ModelTable models={enriched}/></SidebarProvider></MemoryRouter>);
  expect(screen.getByText('USD 1.1/M input tokens')).toBeTruthy();
  expect(screen.getByText('USD 0.000001/M output tokens')).toBeTruthy();
});

it('preserves developer filters when their group is collapsed with the keyboard', async () => {
  const user=userEvent.setup();
  render(<MemoryRouter><SidebarProvider><ModelTable models={models}/></SidebarProvider></MemoryRouter>);
  await user.click(screen.getByRole('checkbox',{name:'OpenAI',exact:true}));
  const trigger=screen.getByRole('button',{name:'Model developer',exact:true});
  trigger.focus();await user.keyboard(' ');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('checkbox',{name:'OpenAI',exact:true})).toBeNull();
  await user.keyboard(' ');
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('checkbox',{name:'OpenAI',exact:true}).getAttribute('aria-checked')).toBe('true');
  await user.type(screen.getByRole('textbox',{name:'Filter model routes'}),'model-24');
  expect(screen.getByText('1 model')).toBeTruthy();
  expect(screen.queryByText('1 models')).toBeNull();
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

it('sorts the visible names naturally instead of hidden route aliases',async()=>{
  const entries=[{...models[0],id:'z/first',catalog:{name:'Alpha 2'}},
    {...models[1],id:'a/second',catalog:{name:'Alpha 10'}},
    {...models[2],id:'b/third',catalog:{name:'alpha 1'}}];
  const user=userEvent.setup();
  render(<MemoryRouter><SidebarProvider><ModelTable models={entries}/></SidebarProvider></MemoryRouter>);
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
