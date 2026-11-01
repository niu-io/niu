import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentDocument from '@/features/help/AgentDocument';
import { saveLocale } from '@/shell/locale';
it('shows and copies exact public source without interpreting HTML and recovers from a failed read', async () => {
  saveLocale('zh-CN');
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  let failed = true;
  const source = '# Setup\n\n<script>never execute</script>\n**Exact source**\n';
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url) !== '/docs/install.md') return Response.json({}, {status: 401});
    return failed ? new Response('unavailable', {status: 503}) : new Response(source, {headers: {'content-type': 'text/markdown'}});
  }));
  const user = userEvent.setup();
  const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  const { container } = render(<AgentDocument path="/docs/install.md" />);
  expect(await screen.findByText('无法加载文档。')).toBeTruthy();
  expect(screen.getByRole('button', {name: '复制原文'}).hasAttribute('disabled')).toBe(true);
  failed = false;
  await user.click(screen.getByRole('button', {name: '重试'}));
  expect((await screen.findByLabelText('Markdown 原文')).textContent).toBe(source);
  expect(container.querySelector('pre script')).toBeNull();
  await user.click(screen.getByRole('button', {name: '复制原文'}));
  expect(clipboard).toHaveBeenCalledWith(source);
  expect(screen.getByRole('link', {name: '打开原文'}).getAttribute('href')).toBe('/docs/install.md');
  expect(screen.getByText('原文已复制。')).toBeTruthy();
});
