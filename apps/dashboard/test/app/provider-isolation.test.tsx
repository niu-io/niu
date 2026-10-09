import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { appRoutes } from '../../src/app/routes';

describe('shared authentication boundary', () => {
  for (const path of ['/workspaces/default', '/suppliers', '/providers', '/suppliers/supplier', '/chat', '/workspaces/default/models', '/admin/suppliers']) {
    it(`redirects signed-out ${path} to login before rendering the dashboard`, async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }))));
      const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
      render(<RouterProvider router={router} />);
      await waitFor(() => expect(router.state.location.pathname).toBe('/login'), { timeout: 10000 });
      expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
      expect(screen.queryByRole('navigation', { name: 'Product navigation' })).toBeNull();
      expect(router.state.location.state.from).toBe(path);
    });
  }
});
