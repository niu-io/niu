import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { LegacyPathRedirect, legacyPathTarget } from '../../app/shell/legacy-redirects';

function Destination() { const location = useLocation(); return <p>{location.pathname + location.search + location.hash}</p>; }

describe('legacy workspace handoffs', () => {
  it('merges preset queries and preserves the incoming scope and anchor', () => {
    expect(legacyPathTarget('../assets?kind=video', 'team-space', '?query=demo&kind=image', '#saved')).toBe('/workspaces/team-space/assets?kind=image&query=demo#saved');
  });
  it('resolves deferred client redirects absolutely instead of against route nesting', async () => {
    render(<MemoryRouter initialEntries={['/workspaces/team-space/library?query=demo#saved']}><Routes>
      <Route path="/workspaces/:workspace/library" element={<LegacyPathRedirect to="../assets?kind=video" />} />
      <Route path="/workspaces/:workspace/assets" element={<Destination />} />
    </Routes></MemoryRouter>);
    expect(await screen.findByText('/workspaces/team-space/assets?kind=video&query=demo#saved')).toBeTruthy();
  });
});
