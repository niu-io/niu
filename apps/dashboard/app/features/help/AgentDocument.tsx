import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { IconCheck, IconCopy, IconExternalLink } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLocale } from '@/shell/ui-locale';

/** A source viewer for public machine contracts; never interprets Markdown as HTML. */
export default function AgentDocument({ path }: { path: string }) {
  const { t: uiT } = useUILocale();
  const { t } = useLocale();
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setSource(null); setError(false); setCopied(false); setCopyError(false);
    void fetch(path, { signal: controller.signal, credentials: 'omit' }).then(async response => {
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('Unavailable document');
      const text = await response.text();
      if (!controller.signal.aborted) setSource(text);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [path, revision]);
  useEffect(() => { if (copied) { const id = window.setTimeout(() => setCopied(false), 1800); return () => window.clearTimeout(id); } }, [copied]);
  async function copy() {
    if (source === null) return;
    try { await navigator.clipboard.writeText(source); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  }
  return <section className="flex h-full min-h-0 w-full flex-col">
    <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-semibold">{t('Agent document', '智能体文档')}</h1><p className="text-sm text-muted-foreground">{path.split('/').pop()} {uiT("· Markdown")}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={source === null} onClick={() => void copy()}>{copied ? <IconCheck /> : <IconCopy />}{copied ? t('Copied', '已复制') : t('Copy source', '复制原文')}</Button>
          <Button asChild variant="ghost" size="sm"><a href={path} target="_blank" rel="noopener noreferrer">{t('Open raw', '打开原文')}<IconExternalLink /></a></Button>
        </div>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t('Give this document to your coding agent. It contains installation and operation instructions for agents.', '将这份文档交给 coding agent，由它读取并执行所需的安装与操作。')}</p>
      {error ? <Alert><AlertDescription>{t('The document could not be loaded.', '无法加载文档。')}<Button variant="link" onClick={() => setRevision(value => value + 1)}>{t('Retry', '重试')}</Button></AlertDescription></Alert> : source === null ? <p role="status">{t('Loading document…', '正在加载文档…')}</p> : <div><div className="playground-response" aria-label={t('Agent document', '智能体文档')}><ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown></div><details className="mt-6"><summary className="cursor-pointer text-sm font-medium">{t('Markdown source', 'Markdown 原文')}</summary><pre className="m-0 mt-2 overflow-x-auto rounded-lg border bg-muted/30 p-4 text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]" aria-label={t('Markdown source', 'Markdown 原文')}><code>{source}</code></pre></details></div>}
      {copyError && <p role="alert" className="mt-3 text-sm">{t('Copy failed. Select the source text and copy it manually.', '复制失败，请选中原文手动复制。')}</p>}
      <span role="status" className="sr-only">{copied ? t('Source copied.', '原文已复制。') : ''}</span>
    </div>
  </section>;
}
