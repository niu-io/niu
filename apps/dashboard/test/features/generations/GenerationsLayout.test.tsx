import { it, expect, vi } from 'vitest';
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
it('keeps the sidebar, scroll container, history rows alive across session types', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => Response.json(input.endsWith('/chats') ? { data: chats } : { data: [], has_more: false })));
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
  scroll.scrollTop = 80;
  await user.click(screen.getByRole('button', { name: 'Switch session' }));
  await screen.findByRole('heading', { name: 'Video content' });
  expect(container.querySelector('#generation-history')).toBe(sidebar);
  expect(screen.getByLabelText('Saved sessions')).toBe(scroll);
  expect(scroll.scrollTop).toBe(80);
  expect(screen.getByRole('link', { name: 'Shared chat' })).toBe(row);
  await user.click(screen.getByRole('button', { name: 'Switch session' }));
  await screen.findByRole('heading', { name: 'Chat content' });
  expect(container.querySelector('#generation-history')).toBe(sidebar);
  expect(scroll.scrollTop).toBe(80);
  await waitFor(() => expect(screen.queryByText('Loading sessions…')).toBeNull());
});

it('retains history data and scroll position when the mobile drawer closes and reopens', async () => {
  vi.stubGlobal('innerWidth', 390);
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const fetch = vi.fn(async () => Response.json({ data: [], has_more: false }));
  vi.stubGlobal('fetch', fetch);
  function Mobile() {
    const { setOpenMobile } = useSidebar();
    const trigger = useRef<HTMLButtonElement>(null);
    return <><Button ref={trigger} onClick={() => setOpenMobile(true)}>Show history</Button>
      <GenerationsLayout><GenerationSessionBindings trigger={trigger} notice={<Button onClick={() => setOpenMobile(false)}>Hide history</Button>} history={{context, chats}} /></GenerationsLayout></>;
  }
  const user = userEvent.setup();
  render(<MemoryRouter><SidebarProvider><Mobile /></SidebarProvider></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: 'Show history' }));
  await screen.findByRole('link', { name: 'Shared chat' });
  await waitFor(() => expect(screen.queryByText('Loading sessions…')).toBeNull());
  screen.getByLabelText('Saved sessions').scrollTop = 80;
  const reads = fetch.mock.calls.length;
  await user.click(screen.getByRole('button', { name: 'Hide history' }));
  await waitFor(() => expect(screen.queryByLabelText('Saved sessions')).toBeNull());
  await user.click(screen.getByRole('button', { name: 'Show history' }));
  await screen.findByRole('link', { name: 'Shared chat' });
  expect(screen.getByLabelText('Saved sessions').scrollTop).toBe(80);
  expect(fetch.mock.calls.length).toBe(reads);
  expect(screen.queryByRole('button', { name: 'Search sessions' })).toBeNull();
});
