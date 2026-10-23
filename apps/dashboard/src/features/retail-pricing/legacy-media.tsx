import { useEffect, useRef, useState, type RefObject } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { request } from '@/features/providers/api';
import type { RetailCustomer } from './api';
import MediaRateHistory from '@/features/provider-business/MediaRateHistory';

/** Compatibility management, separate from ordinary platform price publication. */
export default function LegacyMediaContracts({ token, onClose, returnFocus }: { token: string; onClose: () => void; returnFocus?: RefObject<HTMLButtonElement | null> }) {
  const [companies, setCompanies] = useState<RetailCustomer[]>([]);
  const [selected, setSelected] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [failedCursor, setFailedCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const seenCursors = useRef(new Set<string>());
  async function load(after?: string) {
    active.current?.abort();
    if (!after) seenCursors.current.clear();
    const controller = new AbortController(); active.current = controller;
    setLoading(true); setError(''); setFailedCursor(after);
    try {
      const page = await request<{data: RetailCustomer[]; next_after: string | null}>(token, '/api/v1/pricing/customers?limit=100' + (after ? '&after=' + encodeURIComponent(after) : ''), 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (!Array.isArray(page.data) || page.data.some(row => !row.organization_id || !row.organization_name?.trim() || !Number.isFinite(Date.parse(row.created_at)))) throw new Error('Company details could not be read.');
      if (page.next_after !== null && (typeof page.next_after !== 'string' || !page.next_after || seenCursors.current.has(page.next_after))) throw new Error('The company list did not advance. Retry loading companies.');
      setCompanies(previous => [...new Map([...(after ? previous : []), ...page.data].map(row => [row.organization_id, row])).values()]);
      if (page.next_after) seenCursors.current.add(page.next_after);
      setCursor(page.next_after);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Companies could not be loaded.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(); return () => active.current?.abort(); }, [token]);
  const ambiguous = (row: RetailCustomer) => companies.some(other => other.organization_id !== row.organization_id && other.organization_name === row.organization_name && other.created_at === row.created_at);
  const company = companies.find(row => row.organization_id === selected);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent onCloseAutoFocus={event => { if (returnFocus?.current?.isConnected) { event.preventDefault(); returnFocus.current.focus(); } }} className="w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90dvh] overflow-y-auto">
    <DialogHeader><DialogTitle>Existing media contracts</DialogTitle><DialogDescription>Manage previously configured customer-specific media rates. New ordinary prices belong in Publish media price. Existing jobs retain their original prices.</DialogDescription></DialogHeader>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="max-w-full justify-between" disabled={loading && !companies.length}><span className="truncate">{company?.organization_name ?? 'Choose company'}</span><IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={16} className="max-h-80 max-w-[calc(100vw-2rem)] overflow-y-auto"><DropdownMenuRadioGroup value={selected} onValueChange={setSelected}>{companies.map(row => <DropdownMenuRadioItem key={row.organization_id} value={row.organization_id} disabled={ambiguous(row)}><span className="whitespace-normal break-words">{row.organization_name}<span className="block text-xs text-muted-foreground">Created {row.created_at.replace('T', ' ')}{ambiguous(row) ? ' · Rename to distinguish' : ''}</span></span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
    {company && <p className="text-sm text-muted-foreground">Company created {company.created_at.replace('T', ' ')}.</p>}
    {loading && <p role="status">Loading companies…</p>}
    {error && <div role="alert" className="space-y-2"><p>{error}</p><Button variant="outline" disabled={loading} onClick={() => void load(failedCursor)}>Retry companies</Button></div>}
    {cursor && !error && <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>More companies</Button>}
    {!loading && !error && !companies.length && <p>No customer companies are available.</p>}
    {company && <MediaRateHistory key={company.organization_id} token={token} organization={company.organization_id} allowPublish={false}/>}
  </DialogContent></Dialog>;
}
