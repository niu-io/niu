import { useRef, useState } from 'react';
import { IconDownload, IconPaperclip } from '@tabler/icons-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatLocalizedMessage, translateUI, useLocale } from '@/shell/ui-locale';

export type ChatAttachment = { name: string; type: string; content: string };
const isInlineImage = (file: ChatAttachment) => file.type === 'image' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(file.content);

/** Inspect the original attachments retained with one saved Chat turn. */
export default function ChatTurnAttachments({ attachments }: { attachments: ChatAttachment[] }) {
  const { locale } = useLocale();
  const t = (text: string) => translateUI(text, locale);
  const [preview, setPreview] = useState<ChatAttachment | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  if (!attachments.length) return null;

  const occurrences = new Map<string, number>();
  return <>
    <div role="group" className="flex min-w-0 flex-wrap gap-2" aria-label={t("Attachments")}>
      {attachments.map(file => {
        const identity = `${file.type}:${file.name}:${file.content}`;
        const occurrence = occurrences.get(identity) ?? 0;
        occurrences.set(identity, occurrence + 1);
        return <Button key={`${identity}:${occurrence}`} type="button" variant="outline" className="h-auto min-w-0 max-w-full justify-start gap-2 px-2 py-2 text-left" aria-label={formatLocalizedMessage("Preview {0}", [file.name], locale)} onClick={event => {
        trigger.current = event.currentTarget;
        setImageFailed(false);
        setPreview(file);
      }}>
        {isInlineImage(file) ? <img src={file.content} alt="" className="size-16 shrink-0 rounded object-contain" /> : <IconPaperclip size={20} className="shrink-0" aria-hidden="true" />}
        <span className="min-w-0 max-w-48 truncate">{file.name}</span>
      </Button>; })}
    </div>
    <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(null); }}>
      <DialogContent className="sm:max-w-2xl" onCloseAutoFocus={event => {
        if (trigger.current?.isConnected) { event.preventDefault(); trigger.current.focus(); }
      }}>
        <DialogHeader><DialogTitle className="break-all">{preview?.name}</DialogTitle><DialogDescription className="sr-only">{t("Attachment sent with this message.")}</DialogDescription></DialogHeader>
        {preview?.type === 'image' ? isInlineImage(preview) && !imageFailed
          ? <img src={preview.content} alt={preview.name} className="max-h-[60dvh] w-full object-contain" onError={() => setImageFailed(true)} />
          : <Alert variant="destructive"><AlertDescription>{t("Image preview is unavailable.")}</AlertDescription></Alert>
          : <pre className="max-h-[60dvh] overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-4 text-sm">{preview?.content}</pre>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setPreview(null)}>{t("Close")}</Button>
          {preview && (preview.type === 'text' || isInlineImage(preview)) && <Button asChild><a href={preview.type === 'image' ? preview.content : `data:text/plain;charset=utf-8,${encodeURIComponent(preview.content)}`} download={preview.name}><IconDownload size={16} aria-hidden="true" />{t("Download")}</a></Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
