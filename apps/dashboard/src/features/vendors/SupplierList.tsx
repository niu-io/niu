import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useDashboardContext } from '@/app/dashboard-context';
import { supplierAvailability, type SupplierSetup } from './supplier-setup';
import SupplierLogo from './components/SupplierLogo';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { IconDots as MoreHorizontal, IconPlus as Plus } from '@tabler/icons-react';
import { request, writeMayHaveCommitted } from './api';

type Supplier = SupplierSetup & { id: string; name: string; logo_url?: string; api_keys?: number; models?: number; members: number; qualification_status: string };
export default function SupplierList() {
  const { token } = useDashboardContext();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [dialog, setDialog] = useState<'add' | 'delete' | ''>('');
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogTrigger = useRef<HTMLButtonElement | null>(null);
  const actionTriggers = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void request<{data: Supplier[]}>(token, '/admin/v1/providers', 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setSuppliers(result.data); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, revision]);
  function open(action: typeof dialog, supplier: Supplier | null = null) { setError(''); setSelected(supplier); setName(supplier?.name ?? ''); setDialog(action); }
  const deletionBlocked = Boolean(selected && ((selected.api_keys ?? 0) > 0 || (selected.models ?? 0) > 0 || selected.members > 0));
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || (dialog === 'delete' && deletionBlocked)) return;
    setBusy(true); setError('');
    try {
      await request(token, '/admin/v1/providers' + (selected ? '/' + encodeURIComponent(selected.id) : ''), dialog === 'delete' ? 'DELETE' : 'POST', dialog === 'delete' ? undefined : { name: name.trim() });
      setDialog(''); setRevision(value => value + 1);
    } catch (reason) {
      if (dialog === 'add' && writeMayHaveCommitted(reason)) {
        setDialog('');
        setError('Supplier creation could not be confirmed. Refresh the list before adding another Supplier; the previous request may have saved it.');
      } else setError(dialog === 'delete' ? 'This Supplier could not be deleted. Suppliers with API keys, offers, or members must retain their records.' : reason instanceof Error ? reason.message : 'Could not save Supplier.');
    }
    finally { setBusy(false); }
  }
  const visible = suppliers;
  return <>
    <PageHeader title="Suppliers" action={<Button onClick={event => { dialogTrigger.current = event.currentTarget; open('add'); }}><Plus className="size-4" />Add Supplier</Button>} />
    <div className="space-y-5 py-5">
      <p className="text-sm text-muted-foreground">Connect an upstream API key, then add model routes. Supply readiness requires current Supplier and offer approval, agreed rates, and enabled API routes. Customer selling prices and access are configured per workspace.</p>
      {error && !dialog && <p role="alert">{error}<Button variant="ghost" onClick={() => setRevision(value => value + 1)}>Retry</Button></p>}
      {loading ? <p role="status">Loading Suppliers…</p> : <Table className="supplier-directory-table"><TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead className="hidden sm:table-cell">API keys</TableHead><TableHead className="hidden sm:table-cell">Model routes</TableHead><TableHead>Supply readiness</TableHead><TableHead className="hidden sm:table-cell">Next step</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>
        {visible.map(supplier => { const availability = supplierAvailability(supplier); return <TableRow key={supplier.id}><TableCell className="whitespace-normal"><div className="flex items-center gap-3"><SupplierLogo url={supplier.logo_url} /><Link className="min-w-0 break-words font-medium hover:underline" to={'/admin/suppliers/' + encodeURIComponent(supplier.id)}>{supplier.name}</Link></div></TableCell><TableCell className="hidden sm:table-cell">{supplier.api_keys ?? '—'}</TableCell><TableCell className="hidden sm:table-cell">{supplier.models ?? '—'}</TableCell><TableCell className="whitespace-normal"><Badge className="whitespace-normal" variant={availability.usable ? "secondary" : "outline"}>{availability.label}</Badge><p className="mt-1 whitespace-normal text-xs text-muted-foreground">{availability.detail}</p><Button asChild variant="link" className="mt-2 h-auto whitespace-normal p-0 text-left sm:hidden"><Link to={'/admin/suppliers/' + encodeURIComponent(supplier.id) + '/' + availability.section}>{availability.action}</Link></Button></TableCell><TableCell className="hidden sm:table-cell"><Button asChild variant="link" className="h-auto whitespace-normal p-0 text-left"><Link to={'/admin/suppliers/' + encodeURIComponent(supplier.id) + '/' + availability.section}>{availability.action}</Link></Button></TableCell><TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" ref={node => { if (node) actionTriggers.current.set(supplier.id, node); else actionTriggers.current.delete(supplier.id); }} onClick={event => { dialogTrigger.current = event.currentTarget; }} onFocus={event => { dialogTrigger.current = event.currentTarget; }} aria-label={'Actions for ' + supplier.name}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to={'/admin/suppliers/' + encodeURIComponent(supplier.id)}>Open Supplier</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to={'/admin/suppliers/' + encodeURIComponent(supplier.id) + '/settings'}>Edit Supplier</Link></DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => { dialogTrigger.current = actionTriggers.current.get(supplier.id) ?? null; open('delete', supplier); }}>Delete Supplier</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>; })}
        {!visible.length && <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">{suppliers.length ? 'No matching Suppliers.' : 'No Suppliers yet. Add your first Supplier to configure its API keys and models.'}</TableCell></TableRow>}
      </TableBody></Table>}
    </div>
    <Dialog open={Boolean(dialog)} onOpenChange={open => { if (!open && !busy) setDialog(''); }}><DialogContent className="niu-modal" onCloseAutoFocus={event => { if (dialogTrigger.current?.isConnected) { event.preventDefault(); dialogTrigger.current.focus(); } }}><DialogHeader><DialogTitle>{dialog === 'delete' ? `Delete ${selected?.name}?` : 'Add Supplier'}</DialogTitle><DialogDescription>{dialog === 'delete' ? deletionBlocked ? 'This Supplier has API keys, models, or members and cannot be deleted. Audit history is retained.' : 'Only Suppliers without API keys, offers, or members can be deleted. Audit history is retained.' : 'Add the business supplying your models. Configure API keys and rates in its detail page.'}</DialogDescription></DialogHeader><form onSubmit={event => void save(event)} className="space-y-5">{dialog !== 'delete' && <div className="space-y-2"><Label htmlFor="supplier-name">Supplier name</Label><Input id="supplier-name" autoFocus maxLength={100} required value={name} disabled={busy} onChange={event => setName(event.target.value)} /></div>}{error && <p role="alert" className="text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setDialog('')}>Cancel</Button><Button variant={dialog === 'delete' ? 'destructive' : 'default'} disabled={busy || (dialog === 'delete' ? deletionBlocked : !name.trim())}>{busy ? dialog === 'delete' ? 'Deleting…' : 'Adding…' : dialog === 'delete' ? 'Delete Supplier' : 'Add Supplier'}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}
