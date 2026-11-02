import { Empty, EmptyHeader, EmptyDescription } from '@/components/ui/empty';
import { translateUI } from '@/shell/ui-locale';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/PageSkeletons';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { request } from '@/features/providers/api';

type Change = { assignment_revision: number; policy_revision: number | null; policy_name: string | null; actor_name: string; created_at: string };
type Page = { data: Change[]; next_cursor: number | null };
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(readUILocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : translateUI('Time unavailable');

export default function KeyGuardrailHistory({ token, endpoint }: { token: string; endpoint: string }) {
  const { t: uiT, format: uiF } = useUILocale();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Change[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); pending.current = controller;
    setRows([]); setCursor(null); setLoading(true); setError('');
    void request<Page>(token, `${endpoint}/history`, 'GET', undefined, controller.signal)
      .then(page => { if (!controller.signal.aborted) { validate(page); setRows(page.data); setCursor(page.next_cursor); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load assignment history.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); pending.current?.abort(); };
  }, [open, token, endpoint, reload]);
  async function older() {
    if (!cursor || loading) return;
    const controller = new AbortController(); pending.current = controller;
    setLoading(true); setError('');
    try {
      const page = await request<Page>(token, `${endpoint}/history?before_assignment_revision=${cursor}`, 'GET', undefined, controller.signal);
      if (!controller.signal.aborted) { validate(page, cursor); setRows(current => [...current, ...page.data]); setCursor(page.next_cursor); }
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load older changes.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  return <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost">{uiT("Assignment history")}</Button></DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{uiT("Guardrail assignment history")}</DialogTitle><DialogDescription>{uiT("Recorded changes to this key’s additional policy. Workspace rules continue to apply after removal.")}</DialogDescription></DialogHeader>
        {rows.length > 0 && <Table className="min-w-[520px] table-fixed">
          <TableHeader><TableRow><TableHead>{uiT("Policy change")}</TableHead><TableHead>{uiT("Changed by")}</TableHead><TableHead>{uiT("Date")}</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map(row => <TableRow key={row.assignment_revision}>
            <TableCell className="whitespace-normal break-words">{row.policy_revision === null ? uiT("Key policy removed") : uiF("{0} · Version {1}", [row.policy_name || uiT("Saved policy"), row.policy_revision])}</TableCell>
            <TableCell className="whitespace-normal break-words">{row.actor_name || uiT("Name unavailable")}</TableCell>
            <TableCell className="whitespace-normal break-words">{date(row.created_at)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>}
        {loading && !rows.length && <TableSkeleton columns={3} rows={3} label={uiT("Loading assignment history…")} />}
        {loading && rows.length > 0 && <p role="status" className="text-sm text-muted-foreground">{uiT("Loading assignment history…")}</p>}
        {error ? <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" disabled={loading} onClick={() => rows.length && cursor ? void older() : setReload(value => value + 1)}>{uiT("Retry")}</Button></AlertDescription></Alert> : !loading && !rows.length && <Empty className="min-h-48"><EmptyHeader><EmptyDescription>{uiT("No recorded assignment changes. Changes before history tracking are unavailable.")}</EmptyDescription></EmptyHeader></Empty>}
        {!error && cursor && <Button variant="outline" disabled={loading} onClick={() => void older()}>{uiT("Load older changes")}</Button>}
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{uiT("Close")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function validate(page: Page, before?: number) {
  if (!Array.isArray(page.data) || page.data.some(row => !Number.isSafeInteger(row.assignment_revision) || row.assignment_revision < 1 || (before !== undefined && row.assignment_revision >= before))
    || (page.next_cursor !== null && (!Number.isSafeInteger(page.next_cursor) || page.next_cursor < 1 || (before !== undefined && page.next_cursor >= before)))) {
    throw new Error('Invalid assignment history response.');
  }
}
