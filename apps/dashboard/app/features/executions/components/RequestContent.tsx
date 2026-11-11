import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useState } from 'react';
import { IconCopy as Copy } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { requestMessages, responseMessages, visibleContent } from './request-content';

export default function RequestContent({ payload }: { payload: {request: unknown; response: string; content_type: string; complete: boolean; truncated: boolean} }) {
  const { t: uiT, format: uiF } = useUILocale();
  const input = requestMessages(payload.request);
  const output = responseMessages(payload.response, payload.content_type);
  const [copyStatus, setCopyStatus] = useState('');
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(visibleContent(value)); setCopyStatus('Copied'); }
    catch { setCopyStatus('Could not copy. Select the text to copy it.'); }
  }
  return <section className="min-w-0 space-y-3" aria-label={uiT("Request content")}>
    <Tabs defaultValue="messages"><TabsList variant="line"><TabsTrigger value="messages">{uiT("Messages")}</TabsTrigger><TabsTrigger value="raw">{uiT("Raw data")}</TabsTrigger></TabsList>
      <TabsContent value="messages" className="space-y-5">
        {([['Request', input], ['Response', output.messages]] as const).map(([label, messages]) => <div key={label} className="space-y-3"><h3 className="text-sm font-medium">{uiT(label)}</h3>
          {messages.length ? messages.map((item, index) => <div key={index} className="min-w-0 rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-medium capitalize text-muted-foreground">{visibleContent(item.role)}</h4>{item.text && <Button variant="ghost" size="icon" aria-label={uiF("Copy {0} message {1}", [label.toLowerCase(), index + 1])} onClick={() => void copy(item.text)}><Copy size={14} /></Button>}</div>
            {item.text && <p className="whitespace-pre-wrap break-words text-sm">{visibleContent(item.text)}</p>}
            {item.tools.map((tool, toolIndex) => <Collapsible key={toolIndex}><CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="max-w-full"><span className="truncate">{visibleContent(tool.name) || uiT("Tool call")}</span><ChevronDown size={14} /></Button></CollapsibleTrigger><CollapsibleContent><Textarea aria-label={uiF("{0} arguments", [visibleContent(tool.name) || uiT("Tool")])} value={visibleContent(tool.arguments)} readOnly rows={4} className="font-mono text-xs" /></CollapsibleContent></Collapsible>)}
          </div>) : <p className="text-sm text-muted-foreground">{uiT(label === 'Request' ? "No readable request messages. Inspect Raw data for this protocol." : "No readable response messages. Inspect Raw data for this protocol.")}</p>}
        </div>)}
        {(output.partial || !payload.complete || payload.truncated) && <p className="text-sm text-muted-foreground">{uiT("The response view is partial. Inspect Raw data for retained events.")}</p>}
      </TabsContent>
      <TabsContent value="raw" className="space-y-4">{([['Request payload', JSON.stringify(payload.request, null, 2) ?? ''], ['Response payload', payload.response]] as const).map(([label, value]) => <div key={label} className="space-y-2"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">{uiT(label)}</h3><Button variant="ghost" size="icon" aria-label={uiF("Copy {0}", [label.toLowerCase()])} onClick={() => void copy(value)}><Copy size={14} /></Button></div><Textarea aria-label={uiT(label)} readOnly rows={10} className="font-mono text-xs" value={visibleContent(value)} /></div>)}</TabsContent>
    </Tabs>
    {copyStatus && <p role="status" className="text-sm text-muted-foreground">{uiT(copyStatus)}</p>}
  </section>;
}
