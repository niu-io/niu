import { beforeEach, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { useRef, useState } from 'react';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import GenerationsLayout, { GenerationSessionBindings } from '@/features/generations/GenerationsLayout';
import type { DashboardContext } from '@/app/dashboard-context';
const workspace = { id: 'workspace', organization_id: 'organization', name: 'Workspace' };
const context = { token: 'member', workspace, workspaces: [workspace] } as DashboardContext;
const chats = [{ id: 'chat', title: 'Shared chat', prompt: '', createdAt: 100 }];
function Chat() {
  const trigger = useRef<HTMLButtonElement>(null);
  return <><GenerationSessionBindings trigger={trigger} history={{context: (context), chats: (chats), activeChat: ("chat")}} /><h1>Chat content</h1></>;
}
function Video() {
  const trigger = useRef<HTMLButtonElement>(null);
  return <><GenerationSessionBindings trigger={trigger} history={{context: (context), activeVideo: ("video")}} /><h1>Video content</h1></>;
}
it('keeps the sidebar, scroll container, history rows and header search alive across session types', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => Response.json(input.endsWith('/chat-sessions') ? { data: chats } : { data: [], has_more: false })));
  function Harness() {
    const [video, setVideo] = useState(false);
    return <><Button onClick={() => setVideo(value => !value)}>Switch session</Button><GenerationsLayout>{video ? <Video /> : <Chat />}</GenerationsLayout></>;
  }
  const user = userEvent.setup();
  const { container } = render(<MemoryRouter><SidebarProvider><Harness /></SidebarProvider></MemoryRouter>);
  await screen.findByRole('link', { name: 'Shared chat' });
  const sidebar = container.querySelector('#generation-history');
  const scroll = screen.getByLabelText('Saved sessions');
  const row = screen.getByRole('link', { name: 'Shared chat' });
  const search = screen.getByRole('button', { name: 'Search sessions' });
  expect(search.closest('[data-slot="sidebar-header"]')).not.toBeNull();
  scroll.scrollTop = 80;
  await user.click(search);
  await user.type(screen.getByRole('combobox', { name: 'Search sessions' }), 'Shared');
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Switch session' }));
  await screen.findByRole('heading', { name: 'Video content' });
  expect(container.querySelector('#generation-history')).toBe(sidebar);
  expect(screen.getByLabelText('Saved sessions')).toBe(scroll);
  expect(scroll.scrollTop).toBe(80);
  expect(screen.getByRole('link', { name: 'Shared chat' })).toBe(row);
  expect(screen.getByRole('button', { name: 'Search sessions' })).toBe(search);
  await user.click(search);
  expect((screen.getByRole('combobox', { name: 'Search sessions' }) as HTMLInputElement).value).toBe('Shared');
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Switch session' }));
  await screen.findByRole('heading', { name: 'Chat content' });
  expect(container.querySelector('#generation-history')).toBe(sidebar);
  expect(scroll.scrollTop).toBe(80);
  await waitFor(() => expect(screen.queryByText('Loading sessions…')).toBeNull());
});

it('retains search when the mobile drawer closes and reopens, and Escape only closes search', async () => {
  vi.stubGlobal('innerWidth', 390);
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [], has_more: false })));
  function Mobile() {
    const { setOpenMobile } = useSidebar();
    const trigger = useRef<HTMLButtonElement>(null);
    return <><Button ref={trigger} onClick={() => setOpenMobile(true)}>Show history</Button>
      <GenerationsLayout><GenerationSessionBindings trigger={trigger} notice={<Button onClick={() => setOpenMobile(false)}>Hide history</Button>} history={{context: (context), chats: (chats)}} /></GenerationsLayout></>;
  }
  const user = userEvent.setup();
  render(<MemoryRouter><SidebarProvider><Mobile /></SidebarProvider></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: 'Show history' }));
  await user.click(await screen.findByRole('button', { name: 'Search sessions' }));
  await user.type(screen.getByRole('combobox', { name: 'Search sessions' }), 'Shared');
  await user.keyboard('{Escape}');
  expect(screen.getByRole('button', { name: 'Hide history' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Hide history' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Search sessions' })).toBeNull());
  await user.click(screen.getByRole('button', { name: 'Show history' }));
  await user.click(await screen.findByRole('button', { name: 'Search sessions' }));
  expect((screen.getByRole('combobox', { name: 'Search sessions' }) as HTMLInputElement).value).toBe('Shared');
});

beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
