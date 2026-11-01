import { useState, type ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../dashboard/app/components/ui/tabs';
import { useLocale } from '../../../dashboard/app/shell/locale';
import { Button } from '../../../dashboard/app/components/ui/button';
export default function AgentDocModes({ source, raw, children }: { source: string; raw?: string; children: ReactNode }) {
  const { t } = useLocale();
  const [status, setStatus] = useState('');
  return <Tabs defaultValue="markdown">
    <div className="not-content flex flex-wrap items-center justify-between gap-3">
      <TabsList aria-label="Document view"><TabsTrigger value="markdown">Markdown</TabsTrigger><TabsTrigger value="source">Source</TabsTrigger></TabsList>
      <div className="flex items-center gap-2">
        {raw && <Button asChild variant="ghost" size="sm"><a href={raw}>Raw .md</a></Button>}
        <Button variant="outline" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(source); setStatus(t('Copied', '已复制')); } catch { setStatus(t('Copy failed. Select the source and copy manually.', '复制失败，请选中原文手动复制。')); } }}>{t('Copy source', '复制原文')}</Button>
        <span role="status" className="text-sm">{status}</span>
      </div>
    </div>
    <TabsContent value="markdown">{children}</TabsContent>
    <TabsContent value="source"><pre className="overflow-x-auto rounded-lg bg-muted/30 p-4 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]" aria-label="Markdown source"><code>{source}</code></pre></TabsContent>
  </Tabs>;
}
