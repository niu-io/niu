import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeMenu from '../../../docs/src/components/ThemeMenu';

describe('appearance synchronization', () => {
  it('keeps the floating choices inside mobile navigation’s top-layer container', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({matches:false, addEventListener:vi.fn(), removeEventListener:vi.fn()})));
    const sidebar = document.createElement('sl-sidebar-pane');
    document.body.append(sidebar);
    try {
      render(<ThemeMenu />, {container:sidebar});
      await userEvent.setup().click(screen.getByRole('button',{name:'Color mode'}));
      expect(sidebar.contains(screen.getByRole('menu'))).toBe(true);
      expect(screen.getByRole('menuitemradio',{name:'System',exact:true})).toBeTruthy();
    } finally { sidebar.remove(); }
  });

  it('updates an already mounted theme control after another document changes its mode', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({matches:false, addEventListener:vi.fn(), removeEventListener:vi.fn()})));
    render(<ThemeMenu />);
    localStorage.setItem('niu-dashboard-theme', 'dark');
    window.dispatchEvent(new StorageEvent('storage', {key:'niu-dashboard-theme',newValue:'dark'}));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button',{name:'Color mode'}));
    expect(screen.getByRole('menuitemradio',{name:'Dark',exact:true}).getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('menuitemradio',{name:'Light',exact:true}));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('returns to device appearance after the shared preference cache is cleared', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({matches:false, addEventListener:vi.fn(), removeEventListener:vi.fn()})));
    localStorage.setItem('niu-dashboard-theme','dark');
    render(<ThemeMenu />);
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage',{key:null}));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button',{name:'Color mode'}));
    expect(screen.getByRole('menuitemradio',{name:'System',exact:true}).getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
