import { useState } from 'react';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';
import { useLocale } from '../../../dashboard/src/app/locale';

function extractActiveMarkdown(): string {
  const title = document.querySelector<HTMLElement>('h1#_top')?.innerText.trim() || document.title;
  const contentRoot = document.querySelector<HTMLElement>('.sl-markdown-content');
  if (!contentRoot) return `# ${title}\n\nURL: ${window.location.href}\n`;

  const isZh = document.documentElement.dataset.locale === 'zh-CN';
  const activeRoot =
    contentRoot.querySelector<HTMLElement>(isZh ? '[data-lang="zh"]' : '[data-lang="en"]') ??
    contentRoot;

  const lines: string[] = [`# ${title}`, '', `Source: ${window.location.href}`, ''];
  const children = Array.from(activeRoot.children) as HTMLElement[];

  for (const el of children) {
    if (el.hidden || getComputedStyle(el).display === 'none') continue;
    const tag = el.tagName;
    if (tag === 'H2') {
      lines.push(`## ${el.innerText.trim()}`, '');
    } else if (tag === 'H3') {
      lines.push(`### ${el.innerText.trim()}`, '');
    } else if (tag === 'H4') {
      lines.push(`#### ${el.innerText.trim()}`, '');
    } else if (el.classList.contains('expressive-code') || tag === 'PRE') {
      const code = el.querySelector('pre code')?.textContent ?? el.innerText;
      lines.push('```', code.replace(/\n$/, ''), '```', '');
    } else if (tag === 'UL' || tag === 'OL') {
      const items = Array.from(el.querySelectorAll(':scope > li')) as HTMLElement[];
      items.forEach((li, idx) => {
        const prefix = tag === 'OL' ? `${idx + 1}. ` : '- ';
        lines.push(`${prefix}${li.innerText.trim().replace(/\n+/g, ' ')}`);
      });
      lines.push('');
    } else {
      const text = el.innerText.trim();
      if (text) lines.push(text, '');
    }
  }

  return lines.join('\n').trim() + '\n';
}

export default function CopyPageButton() {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(extractActiveMarkdown());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard permission rejection in restricted contexts
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="docs-copy-page-btn"
      onClick={handleCopy}
      aria-label={t('Copy page as Markdown', '复制本页为 Markdown')}
    >
      {copied ? <IconCheck size={15} stroke={1.9} /> : <IconCopy size={15} stroke={1.8} />}
      {copied ? (
        <>
          <span data-lang="en">Copied</span>
          <span data-lang="zh">已复制</span>
        </>
      ) : (
        <>
          <span data-lang="en">Copy page</span>
          <span data-lang="zh">复制本页</span>
        </>
      )}
    </Button>
  );
}
