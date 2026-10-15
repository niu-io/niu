import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { request, writeMayHaveCommitted } from '@/features/vendors/api';
import { SellingSchedule } from './schedule';
import { enrollmentDirectory, enrollmentError, enrollmentPath, readWorkspaceEnrollment, safeEnrollmentName, type EnrollmentDirectory, type EnrollmentTarget, type WorkspaceEnrollment } from './enrollment-api';
import type { RetailMediaEnrollmentPublication, RetailPriceRecord, RetailTextEnrollmentPublication } from '../../../../../sdks/javascript/src/admin';

type FrozenSubmission = { path: string; body: RetailTextEnrollmentPublication | RetailMediaEnrollmentPublication };
/** Changes only future workspace pricing. Parent mounts and verifies this dialog. */
export function RetailWorkspaceEnrollment({ token, price, onClose, onSaved }: { token: string; price: RetailPriceRecord; onClose: () => void; onSaved: () => void }) {
  const [fixedPrice] = useState(() => structuredClone(price));
  const [directory, setDirectory] = useState<EnrollmentDirectory | null>(null), [directoryError, setDirectoryError] = useState(''), [directoryRevision, setDirectoryRevision] = useState(0);
  const [company, setCompany] = useState(''), [workspace, setWorkspace] = useState('');
  const [companyQuery, setCompanyQuery] = useState(''), [workspaceQuery, setWorkspaceQuery] = useState('');
  const [current, setCurrent] = useState<WorkspaceEnrollment | null>(null), [readError, setReadError] = useState(''), [reading, setReading] = useState(false), [readRevision, setReadRevision] = useState(0);
  const [mode, setMode] = useState<'platform' | 'workspace'>('platform'), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [outcome, setOutcome] = useState<'idle' | 'unknown' | 'rejected'>('idle'), [error, setError] = useState('');
  const submission = useRef<FrozenSubmission | null>(null), inFlight = useRef(false);
  const locked = busy || submission.current !== null;
  const cannotClose = busy || outcome === 'unknown';
  const customers = directory?.customers ?? [], targets = directory?.targets ?? [];
  const selectedCompany = customers.find(row => row.organization_id === company), target = targets.find(row => row.organization_id === company && row.workspace_id === workspace);
  const ambiguousCompany = (id: string) => {
    const row = customers.find(value => value.organization_id === id);
    return !row || !safeEnrollmentName(row.organization_name) || customers.some(other => other.organization_id !== id && other.organization_name === row.organization_name && other.created_at === row.created_at);
  };
  const ambiguousWorkspace = (row: EnrollmentTarget) => !safeEnrollmentName(row.workspace_name) || targets.some(other => other.organization_id === row.organization_id && other.workspace_id !== row.workspace_id && other.workspace_name === row.workspace_name);
  const namedTarget = !!target && !ambiguousCompany(company) && !ambiguousWorkspace(target) && target.organization_name === selectedCompany?.organization_name;
  const hasAccount = !!directory?.accountCurrencies.get(company)?.has(fixedPrice.currency);
  const accountKnown = !!directory?.accountCurrencies.has(company);
  useEffect(() => {
    const controller = new AbortController(); setDirectory(null); setDirectoryError('');
    void enrollmentDirectory(token, controller.signal).then(value => { if (!controller.signal.aborted) setDirectory(value); }).catch(failure => { if (!controller.signal.aborted) setDirectoryError(enrollmentError(failure)); });
    return () => controller.abort();
  }, [token, directoryRevision]);
  useEffect(() => {
    setCurrent(null); setReadError('');
    if (!target || !namedTarget) { setReading(false); return; }
    const controller = new AbortController(); setReading(true);
    void readWorkspaceEnrollment(token, target, fixedPrice, controller.signal).then(value => {
      if (!controller.signal.aborted) { setCurrent(value); setMode(value.price_id === null ? 'workspace' : 'platform'); }
    }).catch(failure => { if (!controller.signal.aborted) setReadError(enrollmentError(failure)); }).finally(() => { if (!controller.signal.aborted) setReading(false); });
    return () => controller.abort();
  }, [token, target, namedTarget, fixedPrice, readRevision]);

  async function save(event: FormEvent) {
    event.preventDefault(); if (inFlight.current || outcome === 'rejected') return;
    let original = submission.current;
    if (!original) {
      try {
        if (!target || !namedTarget || !current || reading) throw new Error('Choose a named workspace and load its saved enrollment.');
        if (mode === 'platform' && !hasAccount) throw new Error('This company needs an existing ' + fixedPrice.currency + ' balance account before binding this price.');
        const note = reason.trim();
        if (!note || [...note].length > 500 || /[\u0000-\u001f\u007f-\u009f]/.test(note)) throw new Error('Enter a single-line reason of up to 500 characters.');
        const common = { price_id: mode === 'platform' ? fixedPrice.price_id : null, expected_version: current.version, idempotency_key: crypto.randomUUID(), reason: note };
        const body = fixedPrice.schedule.kind === 'text' ? { ...common, model_alias: fixedPrice.model_alias } : { ...common, dimensions: Object.freeze({ ...fixedPrice.schedule.dimensions }), meter: fixedPrice.schedule.meter };
        original = Object.freeze({ path: enrollmentPath(target, fixedPrice), body: Object.freeze(body) }); submission.current = original;
      } catch (failure) { setError(enrollmentError(failure)); return; }
    }
    inFlight.current = true; setBusy(true); setError('');
    let confirmed = false;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await request<{ data: { revision: string; version: string; price_id: string | null; model_alias?: string; dimensions?: RetailMediaEnrollmentPublication['dimensions']; meter?: string } }>(token, original.path, 'POST', original.body, controller.signal);
      const result = response.data;
      if (!result || !result.revision || !/^\d+$/.test(result.version) || BigInt(result.version) !== BigInt(original.body.expected_version) + 1n || result.price_id !== original.body.price_id) throw new Error('Enrollment response could not be confirmed.');
      if ('model_alias' in original.body ? result.model_alias !== original.body.model_alias : !result.dimensions || result.meter !== original.body.meter || result.dimensions.model !== original.body.dimensions.model || result.dimensions.channel !== original.body.dimensions.channel || result.dimensions.resolution !== original.body.dimensions.resolution || result.dimensions.reference_video !== original.body.dimensions.reference_video) throw new Error('Saved enrollment identity could not be confirmed.');
      confirmed = true; submission.current = null; setOutcome('idle');
    } catch (failure) {
      const uncertain = writeMayHaveCommitted(failure); setOutcome(uncertain ? 'unknown' : 'rejected');
      setError(enrollmentError(failure) + (uncertain ? ' Outcome is unknown. Keep this form open and retry the unchanged original request.' : ' The request was rejected. Reload enrollment before a new submission.'));
    } finally { clearTimeout(timeout); inFlight.current = false; setBusy(false); }
    if (confirmed) onSaved();
  }
  function reload() {
    if (cannotClose) return;
    submission.current = null; setOutcome('idle'); setError(''); setCurrent(null); setReadRevision(value => value + 1);
  }
  return <Dialog open onOpenChange={open => { if (!open && !cannotClose) onClose(); }}><DialogContent className="sm:max-w-3xl max-h-[90dvh] overflow-y-auto" showCloseButton={!cannotClose} onEscapeKeyDown={event => { if (cannotClose) event.preventDefault(); }} onInteractOutside={event => { if (cannotClose) event.preventDefault(); }}><DialogHeader><DialogTitle>Workspace pricing</DialogTitle><DialogDescription>{safeEnrollmentName(fixedPrice.model_alias) ? fixedPrice.model_alias : 'Selected model'} · {fixedPrice.currency}. Choose the pricing source for future operations. Existing requests keep their pinned prices; this does not qualify supply or add funds.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={event => void save(event)}>
    <div className="space-y-2"><Label>Company</Label><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" className="max-w-full" disabled={locked || !directory} aria-label="Enrollment company"><span className="truncate">{selectedCompany && safeEnrollmentName(selectedCompany.organization_name) ? selectedCompany.organization_name : 'Choose company'}</span><IconChevronDown size={16} className="shrink-0" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={8} className="max-h-80 max-w-[calc(100vw-2rem)] overflow-y-auto"><Input aria-label="Filter enrollment companies" placeholder="Filter companies" value={companyQuery} onChange={event => setCompanyQuery(event.target.value)} onKeyDown={event => { if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') event.stopPropagation(); }} /><DropdownMenuRadioGroup value={company} onValueChange={value => { setCompany(value); setWorkspace(''); setCurrent(null); setError(''); }}>{customers.filter(row => row.organization_name.toLowerCase().includes(companyQuery.trim().toLowerCase())).map(row => { const noWorkspaces = !targets.some(target => target.organization_id === row.organization_id); return <DropdownMenuRadioItem key={row.organization_id} value={row.organization_id} disabled={ambiguousCompany(row.organization_id) || noWorkspaces}><span className="min-w-0 break-words">{safeEnrollmentName(row.organization_name) ? row.organization_name : 'Company name unavailable'}<span className="block text-xs text-muted-foreground">Created {row.created_at.replace('T', ' ')}{ambiguousCompany(row.organization_id) ? ' · Rename to distinguish' : noWorkspaces ? ' · No workspaces' : ''}</span></span></DropdownMenuRadioItem>; })}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
    <div className="space-y-2"><Label>Workspace</Label><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" className="max-w-full" disabled={locked || !company} aria-label="Enrollment workspace"><span className="truncate">{target && safeEnrollmentName(target.workspace_name) ? target.workspace_name : 'Choose workspace'}</span><IconChevronDown size={16} className="shrink-0" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={8} className="max-h-80 max-w-[calc(100vw-2rem)] overflow-y-auto"><Input aria-label="Filter enrollment workspaces" placeholder="Filter workspaces" value={workspaceQuery} onChange={event => setWorkspaceQuery(event.target.value)} onKeyDown={event => { if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') event.stopPropagation(); }} /><DropdownMenuRadioGroup value={workspace} onValueChange={value => { setWorkspace(value); setCurrent(null); setError(''); }}>{targets.filter(row => row.organization_id === company && row.workspace_name.toLowerCase().includes(workspaceQuery.trim().toLowerCase())).map(row => <DropdownMenuRadioItem key={row.workspace_id} value={row.workspace_id} disabled={ambiguousWorkspace(row) || row.organization_name !== selectedCompany?.organization_name}><span className="min-w-0 break-words">{safeEnrollmentName(row.workspace_name) ? row.workspace_name : 'Workspace name unavailable'}{ambiguousWorkspace(row) ? ' · Rename to distinguish' : ''}</span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
    {!directory && !directoryError && <p role="status" className="text-sm text-muted-foreground">Loading companies, workspaces and currency accounts…</p>}
    {directoryError && <Alert variant="destructive"><AlertDescription>{directoryError}</AlertDescription></Alert>}
    {directoryError && <Button type="button" variant="outline" disabled={locked} onClick={() => setDirectoryRevision(value => value + 1)}>Reload directory</Button>}
    {reading && <p role="status" className="text-sm text-muted-foreground">Loading saved workspace enrollment…</p>}
    {readError && <Alert variant="destructive"><AlertDescription>{readError} No enrollment version has been assumed.</AlertDescription></Alert>}
    {target && directory && !hasAccount && <Alert><AlertDescription>{accountKnown ? <>No existing {fixedPrice.currency} account was found for this company. Create its currency account in Financial settings before selecting this platform price.</> : <>Currency account metadata could not be confirmed for this company. Close and reload the directory before binding a platform price.</>} Returning to legacy workspace pricing does not create an account.</AlertDescription></Alert>}
    <div className="space-y-2"><Label>Pricing source</Label><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={locked || !current} aria-label="Workspace pricing source">{mode === 'platform' ? 'Platform customer price' : 'Legacy workspace pricing'}<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={8}><DropdownMenuRadioGroup value={mode} onValueChange={value => { setMode(value as 'platform' | 'workspace'); setError(''); }}><DropdownMenuRadioItem value="platform" disabled={!hasAccount}>Platform customer price · {fixedPrice.currency}</DropdownMenuRadioItem><DropdownMenuRadioItem value="workspace">Legacy workspace pricing</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
    {current && <section className="space-y-2"><p className="text-sm font-medium">Saved enrollment · Revision {current.version}</p><p className="text-sm text-muted-foreground">{current.price_id === null ? 'Currently uses legacy workspace pricing.' : current.price_id === fixedPrice.price_id ? 'Currently uses this platform pricing identity.' : 'Currently uses another platform pricing identity. Selecting platform customer price will replace it for future operations.'}</p>{current.effective_price && <><p className="text-sm font-medium">Current applicable customer price · {current.effective_price.currency}</p><SellingSchedule schedule={current.effective_price.schedule} currency={current.effective_price.currency} compact /><p className="text-xs text-muted-foreground">{current.effective_price.promotion_scope === 'customer' ? 'Customer promotion' : current.effective_price.promotion_scope === 'global' ? 'Global promotion' : 'Standard price'} · Advisory selection, not a request snapshot.</p></>}</section>}
    <section className="space-y-2"><p className="text-sm font-medium">Selected platform standard · {fixedPrice.currency}</p><SellingSchedule schedule={fixedPrice.schedule} currency={fixedPrice.currency} compact /><p className="text-xs text-muted-foreground">Enrollment follows this model, currency and pricing identity. Future requests select its eligible customer promotion, global promotion or standard price; rates are not copied from this form.</p></section>
    <div className="space-y-2"><Label htmlFor="enrollment-reason">Reason</Label><Input id="enrollment-reason" value={reason} disabled={locked || !current} maxLength={500} onChange={event => { setReason(event.target.value); setError(''); }} /></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {outcome === 'unknown' && <Alert><AlertDescription>The original workspace, pricing source, version, reason and request key remain frozen. Recovery after refreshing or closing this browser is not implemented; keep this form open for the exact retry.</AlertDescription></Alert>}
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={cannotClose} onClick={onClose}>Close</Button>{target && <Button type="button" variant="outline" disabled={cannotClose || reading} onClick={reload}>Reload enrollment</Button>}<Button type="submit" disabled={busy || outcome === 'rejected' || (!submission.current && (!current || reading || !namedTarget || (mode === 'platform' && !hasAccount)))}>{busy ? 'Saving…' : outcome === 'unknown' ? 'Retry exact request' : 'Save workspace pricing'}</Button></div>
  </form></DialogContent></Dialog>;
}
