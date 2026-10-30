import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, it, vi } from 'vitest';
import HelpPage from '../../../src/features/help/page';

it('loads deep links directly and keeps the iframe source stable when navigating', async () => {
  const router = createMemoryRouter([{ path: '/help/*', Component: HelpPage }], { initialEntries: ['/help/getting-started/?q=test#requirements'] });
  render(<RouterProvider router={router} />);
  const frame = screen.getByTitle('Docs') as HTMLIFrameElement;
  expect(frame.getAttribute('src')).toBe('/docs/getting-started/?q=test&embed=help#requirements');
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  await act(() => router.navigate('/help/security/overview/'));
  expect(screen.getByTitle('Docs')).toBe(frame);
  expect(frame.getAttribute('src')).toBe('/docs/getting-started/?q=test&embed=help#requirements');
  await waitFor(() => expect(post).toHaveBeenCalledWith({ type: 'niu-docs-navigate', path: '/docs/security/overview/?embed=help' }, window.location.origin));
});

it('accepts navigation only from its own same-origin docs frame', async () => {
  const router = createMemoryRouter([{ path: '/help/*', Component: HelpPage }], { initialEntries: ['/help/'] });
  render(<RouterProvider router={router} />);
  const frame = screen.getByTitle('Docs') as HTMLIFrameElement;
  const send = (origin: string, source: Window | null) => window.dispatchEvent(new MessageEvent('message', {
    origin, source, data: { type: 'niu-docs-navigation', path: '/docs/security/overview/' },
  }));
  await act(() => { send('https://example.com', frame.contentWindow); send(window.location.origin, window); });
  expect(router.state.location.pathname).toBe('/help/');
  await act(() => { send(window.location.origin, frame.contentWindow); });
  expect(router.state.location.pathname).toBe('/help/security/overview/');
});

it('keeps the Help embed marker out of dashboard history', async () => {
  const router = createMemoryRouter([{ path: '/help/*', Component: HelpPage }], { initialEntries: ['/help/'] });
  render(<RouterProvider router={router} />);
  const frame = screen.getByTitle('Docs') as HTMLIFrameElement;
  await act(() => window.dispatchEvent(new MessageEvent('message', {
    origin: window.location.origin, source: frame.contentWindow,
    data: { type: 'niu-docs-navigation', path: '/docs/api/sdk/?embed=help&q=types#clients' },
  })));
  expect(router.state.location.pathname).toBe('/help/api/sdk/');
  expect(router.state.location.search).toBe('?q=types');
  expect(router.state.location.hash).toBe('#clients');
});
