import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route, Link } from 'react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import ModelTable from '@/features/models/components/ModelTable';
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/app/console-context', () => ({ useConsoleContext: () => ({ token: '', workspace: null }) }));
vi.mock('@/app/useModelPopularity', () => ({ useModelPopularity: (models: unknown[]) => ({ models }) }));
afterEach(cleanup);
const models = Array.from({ length: 25 }, (_, i) => ({ id: `openai/model-${i}`, provider: 'openrouter', public_catalog: true }));
it('searches and opens a model without losing the catalog filter on return', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/models']}><Routes><Route path="/models/*" element={<SidebarProvider><Link to="/models">Models breadcrumb</Link><ModelTable models={models} /></SidebarProvider>} /></Routes></MemoryRouter>);
  await user.type(screen.getByRole('textbox', { name: 'Search model routes' }), 'model-24');
  expect(screen.queryByRole('link', { name: 'openai/model-0', exact: true })).toBeNull();
  await user.click(screen.getByRole('link', { name: 'openai/model-24', exact: true }));
  expect(screen.getByRole('complementary', { name: 'openai/model-24 route details' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Try in Chat' }).getAttribute('href')).toContain('model=openai%2Fmodel-24');
  await user.click(screen.getByRole('link', { name: 'Models breadcrumb' }));
  expect((screen.getByRole('textbox', { name: 'Search model routes' }) as HTMLInputElement).value).toBe('model-24');
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
  const enriched = [{ ...models[0], catalog: { name: 'Example model', description: 'Provider description', context_length: 128000, input_price: '0', output_price: '0.000002' } }];
  render(<MemoryRouter initialEntries={['/models']}><Routes><Route path="/models/*" element={<SidebarProvider><ModelTable models={enriched} /></SidebarProvider>} /></Routes></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Example model' }).getAttribute('href')).toBe('/models/openai/model-0');
  expect(screen.getByText('Provider description')).toBeTruthy();
  expect(screen.getByText('128K context')).toBeTruthy();
  expect(screen.getByText('$0/M input tokens')).toBeTruthy();
  expect(screen.getByText('$2/M output tokens')).toBeTruthy();
});
