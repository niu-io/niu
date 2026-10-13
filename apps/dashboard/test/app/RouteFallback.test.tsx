import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import RouteFallback from '@/app/RouteFallback';
vi.mock('@/app/branding', () => ({ useBranding: () => ({ settings: { display_name: 'Niu' }, logo: '/logo.svg' }) }));
function mount(error: unknown) {
  const router = createMemoryRouter([{ path: '/', loader: () => { throw error; }, errorElement: <RouteFallback /> }]);
  render(<RouterProvider router={router} />);
}
it.each([
  [401, 'Sign-in required', 'Sign in to open this page.'],
  [403, 'Access denied', 'You do not have permission to open this page.'],
  [404, 'Not Found', 'The page you requested could not be found.'],
  [429, 'Too many requests', 'Please wait a moment and try again.'],
  [503, 'Server error', 'The server could not load this page. Please try again.'],
])('renders HTTP %s with a clear error type, description and collapsed diagnostics', async (status, title, description) => {
  mount(new Response('Request could not be completed.', { status }));
  expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
  expect(screen.getByText(description)).toBeTruthy();
  expect(screen.queryByText(`HTTP ${status}`, { exact: false })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Error details' }));
  expect(screen.getByText(`HTTP ${status}`, { exact: false })).toBeTruthy();
  expect(screen.getByText('Request could not be completed.', { exact: false })).toBeTruthy();
  expect(screen.queryByText('Dashboard', { exact: true })).toBeNull();
});
it('shows application diagnostic information without exposing credentials or internal paths and identifiers', async () => {
  mount(new TypeError('Could not read session 11111111-1111-4111-8111-111111111111 at /Users/example/private.ts token=credential Bearer secret'));
  await screen.findByRole('heading', { name: 'Application error' });
  await userEvent.click(screen.getByRole('button', { name: 'Error details' }));
  const detail = screen.getByText('TypeError', { exact: false }).textContent!;
  expect(detail).toContain('Could not read session');
  expect(detail).not.toContain('11111111-1111-4111-8111-111111111111');
  expect(detail).not.toContain('/Users/example');
  expect(detail).not.toContain('credential');
  expect(detail).not.toContain('Bearer secret');
});
