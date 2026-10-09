import { StrictMode } from 'react';
import { useGatewayConnection } from '../../src/app/useGatewayConnection';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, it, vi } from 'vitest';
import LoginRoute from '../../src/features/login/page';
import AppLayout from '../../src/app/AppLayout';

it('detects a later proxy outage and restores the same page without losing its draft', async () => {
  let online = true;
  vi.stubGlobal('fetch', vi.fn(async input => {
    if (!online) return new Response('Bad Gateway', { status: 502 });
    const path = String(input);
    return new Response(JSON.stringify(path === '/healthz' ? { status: 'ok' }
      : path === '/admin/v1/auth/config' ? { password_login: true }
      : path === '/admin/v1/session' ? { data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } }
      : { data: [] }));
  }));
  const router = createMemoryRouter([{ element: <AppLayout />, children: [{ path: '/chat', element: <textarea aria-label="Task draft" /> }] }], { initialEntries: ['/chat'] });
  const user = userEvent.setup();
  render(<StrictMode><RouterProvider router={router} /></StrictMode>);
  await user.type(await screen.findByRole('textbox', { name: 'Task draft' }), 'Keep my work');
  online = false;
  act(() => window.dispatchEvent(new Event('focus')));
  await screen.findByRole('heading', { name: 'Gateway unavailable' });
  expect(screen.queryByRole('textbox', { name: 'Task draft' })).toBeNull();
  expect(screen.getByText('We couldn’t reach the gateway. We’ll reconnect automatically when the service returns.')).toBeTruthy();
  online = true;
  act(() => window.dispatchEvent(new Event('online')));
  const draft = await screen.findByRole('textbox', { name: 'Task draft' });
  expect((draft as HTMLTextAreaElement).value).toBe('Keep my work');
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Gateway unavailable' })).toBeNull());
});

it('prevents duplicate retry requests while a health check is pending', async () => {
  let resolve!: (response: Response) => void;
  let pending = false;
  const fetchMock = vi.fn(async input => String(input) !== '/healthz' ? new Response(JSON.stringify({ enabled: false })) : pending
    ? new Promise<Response>(done => { resolve = done; })
    : new Response('Bad Gateway', { status: 502 }));
  vi.stubGlobal('fetch', fetchMock);
  const router = createMemoryRouter([{ element: <AppLayout />, children: [{ path: '/chat', element: <p>Ready</p> }, { path: '/login', element: <LoginRoute /> }] }], { initialEntries: ['/chat'] });
  const user = userEvent.setup();
  render(<StrictMode><RouterProvider router={router} /></StrictMode>);
  await screen.findByRole('heading', { name: 'Gateway unavailable' });
  pending = true;
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect((screen.getByRole('button', { name: 'Checking…' }) as HTMLButtonElement).disabled).toBe(true);
  const count = fetchMock.mock.calls.length;
  act(() => window.dispatchEvent(new Event('focus')));
  expect(fetchMock.mock.calls.length).toBe(count);
  await act(async () => resolve(new Response(JSON.stringify({ status: 'ok' }))));
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
});

it('automatically recovers from a failed check without a click', async () => {
  vi.useFakeTimers();
  try {
    let online = false;
    vi.stubGlobal('fetch', vi.fn(async () => online
      ? new Response(JSON.stringify({ status: 'ok' }))
      : new Response('Bad Gateway', { status: 502 })));
    const { result, unmount } = renderHook(() => useGatewayConnection('/chat'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.checked).toBe(true);
    expect(result.current.health).toBeNull();
    online = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.health?.status).toBe('ok');
    unmount();
  } finally {
    vi.useRealTimers();
  }
});
