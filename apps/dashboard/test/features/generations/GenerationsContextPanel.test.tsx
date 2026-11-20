import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import GenerationsLayout, { GenerationSessionBindings } from '@/features/generations/GenerationsLayout';
import {
  buildChatContextPanelData,
  openGenerationsContextRun,
} from '@/features/generations/GenerationsContextPanel';
import { useRef } from 'react';
import type { DashboardContext } from '@/shell/dashboard-context';

const mockContext = {
  token: 'member',
  session: { permissions: { read: true, write: true } },
  workspace: { id: 'ws-1', organization_id: 'org-1', slug: 'default', name: 'Default' },
  workspaces: [{ id: 'ws-1', organization_id: 'org-1', slug: 'default', name: 'Default' }],
} as DashboardContext;

function TestSurface({ initialRunId }: { initialRunId?: string }) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelData = buildChatContextPanelData(
    [
      {
        prompt: 'Write a TypeScript Fibonacci function',
        results: [
          {
            model: 'openai/gpt-4.1',
            content: 'Here is the implementation:\n```ts\nexport function fib(n: number): number {\n  return n <= 1 ? n : fib(n - 1) + fib(n - 2);\n}\n```',
            elapsedMs: 840,
            promptTokens: 28,
            completionTokens: 52,
            totalTokens: 80,
            attemptId: 'att-101',
            attemptReference: 'req-101',
            error: null,
            finishReason: 'stop',
            phase: 'complete',
          },
          {
            model: 'anthropic/claude-sonnet-4',
            content: 'Streaming draft...',
            elapsedMs: 310,
            promptTokens: null,
            completionTokens: null,
            totalTokens: null,
            attemptId: 'att-102',
            attemptReference: 'req-102',
            error: null,
            finishReason: null,
            phase: 'streaming',
          },
        ],
      },
    ],
    () => '$0.0012',
    [
      { id: 'openai/gpt-4.1', display_name: 'GPT-4.1' },
      { id: 'anthropic/claude-sonnet-4', display_name: 'Claude Sonnet 4' },
    ],
    '/workspaces/default',
    { systemPrompt: 'Be concise.', maxTokens: 4096, temperature: 0.7, logPayloads: true },
  );

  return (
    <GenerationsLayout>
      <GenerationSessionBindings
        trigger={triggerRef}
        title="Fibonacci Session"
        contextPanel={{ ...panelData, initialRunId }}
        history={{ context: mockContext }}
      />
      <div id="generation-turn-1" tabIndex={-1}>
        <button
          type="button"
          onClick={() => openGenerationsContextRun('turn-1:anthropic/claude-sonnet-4:1')}
        >
          View progress
        </button>
        <button
          type="button"
          onClick={() => openGenerationsContextRun('turn-1:openai/gpt-4.1:0')}
        >
          Generation details
        </button>
      </div>
    </GenerationsLayout>
  );
}

describe('GenerationsContextPanel', () => {
  it('opens the right-hand Context panel on a running task when clicking View progress', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SidebarProvider>
          <TestSurface />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText('Generation context')).toBeNull();
    expect(screen.getByRole('button', { name: 'Toggle context panel' }).textContent).toContain('1 running');

    await user.click(screen.getByRole('button', { name: 'View progress' }));

    const contextAside = await screen.findByLabelText('Generation context');
    expect(contextAside).toBeTruthy();
    expect(screen.getByText('Streaming response in real time…')).toBeTruthy();
    expect(screen.getByText('Request authorized and dispatched')).toBeTruthy();
    expect(screen.getByText('Receiving model output tokens')).toBeTruthy();
  });

  it('inspects completed generation metadata and extracted deliverables in the Context panel', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SidebarProvider>
          <TestSurface />
        </SidebarProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Generation details' }));

    await screen.findByLabelText('Generation context');
    expect(screen.getByText('840 ms')).toBeTruthy();
    expect(screen.getByText('$0.0012')).toBeTruthy();
    expect(screen.getByText('Configured')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open in Logs' }).getAttribute('href')).toBe(
      '/workspaces/default/executions?modelAlias=openai%2Fgpt-4.1#gateway-attempt-req-101',
    );

    await user.click(screen.getByRole('tab', { name: /Deliverables/ }));
    expect(await screen.findByText('export function fib(n: number): number {')).toBeTruthy();
    expect(screen.getByText('ts')).toBeTruthy();
  });

  it('automatically opens and selects the requested run when initialRunId is present', async () => {
    render(
      <MemoryRouter>
        <SidebarProvider>
          <TestSurface initialRunId="req-101" />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText('Generation context')).toBeTruthy();
    expect(screen.getByText('Turn 1 · req-101')).toBeTruthy();
  });

  it('toggles the Assets (素材库) right-hand sidebar panel and keeps it mutually exclusive with Context', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SidebarProvider>
          <TestSurface />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText('Workspace assets')).toBeNull();
    expect(screen.queryByLabelText('Generation context')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Toggle assets panel' }));

    expect(await screen.findByLabelText('Workspace assets')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Attach image' })).toBeTruthy();
    expect(screen.queryByLabelText('Generation context')).toBeNull();

    // Opening Context closes Assets
    await user.click(screen.getByRole('button', { name: 'Toggle context panel' }));
    expect(await screen.findByLabelText('Generation context')).toBeTruthy();
    expect(screen.queryByLabelText('Workspace assets')).toBeNull();

    // Opening Assets again closes Context
    await user.click(screen.getByRole('button', { name: 'Toggle assets panel' }));
    expect(await screen.findByLabelText('Workspace assets')).toBeTruthy();
    expect(screen.queryByLabelText('Generation context')).toBeNull();
  });
});
