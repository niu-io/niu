import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

const viewport = vi.hoisted(() => ({ mobile: true }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => viewport.mobile }));

function Navigation() {
  return <SidebarProvider><SidebarTrigger /><Sidebar><a href="/chat">Chat</a></Sidebar></SidebarProvider>;
}

describe('responsive sidebar', () => {
  it('does not reopen a mobile drawer after visiting the desktop layout', () => {
    viewport.mobile = true;
    const { rerender } = render(<Navigation />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
    expect(screen.getByRole('dialog', { name: 'Sidebar' })).toBeTruthy();
    viewport.mobile = false;
    rerender(<Navigation />);
    expect(screen.queryByRole('dialog')).toBeNull();
    viewport.mobile = true;
    rerender(<Navigation />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
    expect(screen.getByRole('dialog', { name: 'Sidebar' })).toBeTruthy();
  });
});
