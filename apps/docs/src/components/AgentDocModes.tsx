import { useState, type ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../dashboard/app/components/ui/tabs';
import { useLocale } from '../../../dashboard/app/shell/locale';
import { Button } from '../../../dashboard/app/components/ui/button';

export default function AgentDocModes({ source, raw, children }: { source: string; raw?: string; children: ReactNode }) {
  const { t } = useLocale();
  const [status, setStatus] = useState('');

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(label);
    } catch {
      setStatus(t('Copy failed. Select the text and copy manually.', '复制失败，请选中文本手动复制。'));
    }
  }

  return (
    <Tabs defaultValue="markdown">
      <div className="not-content flex flex-wrap items-center justify-between gap-3">
        <TabsList aria-label={t('Document view', '文档视图')}>
          <TabsTrigger value="markdown">Markdown</TabsTrigger>
          <TabsTrigger value="source">Source</TabsTrigger>
        </TabsList>
        <div className="flex flex-wrap items-center gap-2">
          {raw && (
            <>
              <code className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{raw}</code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void copyText(`${window.location.origin}${raw}`, t('URL copied', '链接已复制'))}
              >
                {t('Copy URL', '复制链接')}
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href={raw}>{raw.endsWith('.txt') ? 'llms.txt' : 'Raw .md'}</a>
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void copyText(source, t('Copied', '已复制'))}
          >
            {t('Copy source', '复制原文')}
          </Button>
          <span role="status" className="text-sm text-muted-foreground">{status}</span>
        </div>
      </div>
      <TabsContent value="markdown">{children}</TabsContent>
      <TabsContent value="source">
        <pre className="overflow-x-auto rounded-lg bg-muted/30 p-4 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]" aria-label="Markdown source">
          <code>{source}</code>
        </pre>
      </TabsContent>
    </Tabs>
  );
}
