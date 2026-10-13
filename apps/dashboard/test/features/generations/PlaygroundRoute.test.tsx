import { expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import GenerationsRouteLayout from '@/features/generations/layout';
import PlaygroundRoute from '@/features/playground/page';
vi.mock('@/app/dashboard-context', () => ({ useDashboardContext: () => ({ token: 'member', models: [], workspace: { id: 'workspace', organization_id: 'organization' } }) }));
vi.mock('@/app/useModelPopularity', () => ({ useModelPopularity: () => ({ models: [] }) }));
vi.mock('@/features/video/VideoView', () => ({ default: () => <h1>Video session</h1> }));
vi.mock('@/features/playground/components/PlaygroundView', () => ({ default: () => <h1>Chat session</h1> }));
it.each([
  ['/generations?session=chat', 'Chat session'],
  ['/generations?intent=saved-input', 'Video session'],
  ['/generations?job=saved-result', 'Video session'],
  ['/generations?new=video', 'Video session'],
  ['/generations?mode=video&session=chat', 'Chat session'],
])('resolves %s by the session reference or new session type', (url, heading) => {
  render(<MemoryRouter initialEntries={[url]}><SidebarProvider><PlaygroundRoute /></SidebarProvider></MemoryRouter>);
  expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
});

it('keeps the parent route sidebar and title region mounted while the session type changes', async () => {
  const router = createMemoryRouter([{ path: '/generations', Component: GenerationsRouteLayout, children: [{ index: true, Component: PlaygroundRoute }] }], { initialEntries: ['/generations?session=chat'] });
  const { container } = render(<SidebarProvider><RouterProvider router={router} /></SidebarProvider>);
  await screen.findByRole('heading', { name: 'Chat session' });
  const sidebar = container.querySelector('#generation-history');
  const toolbar = container.querySelector('.generations-toolbar');
  const newButton = screen.getByRole('button', { name: 'New generation' });
  await act(() => router.navigate('/generations?intent=video'));
  await screen.findByRole('heading', { name: 'Video session' });
  expect(container.querySelector('#generation-history')).toBe(sidebar);
  expect(container.querySelector('.generations-toolbar')).toBe(toolbar);
  expect(screen.getByRole('button', { name: 'New generation' })).toBe(newButton);
  expect(container.querySelectorAll('#generation-history')).toHaveLength(1);
  await act(() => router.navigate('/generations?session=chat'));
  expect(container.querySelector('#generation-history')).toBe(sidebar);
  expect(container.querySelector('.generations-toolbar')).toBe(toolbar);
});
