import { useEffect, useRef, useState } from 'react';
import { IconChevronDown, IconRefresh } from '@tabler/icons-react';
import type { PlatformAuditCategory, PlatformAuditEvent, PlatformAuditPage } from '../../../../../sdks/javascript/src/platform-audit';
import { useDashboardContext } from '@/app/dashboard-context';
import { request } from '@/features/providers/api';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const categories: Record<PlatformAuditCategory | 'all', string> = {
  all: 'All events', authentication: 'Authentication', configuration: 'Configuration', access: 'Access', supplier: 'Provider',
};
function actionName(action: string) {
  const names: Record<string, string> = {
    password_login_succeeded: 'Password login succeeded', session_created: 'Session issued',
    session_revoked: 'Session revoked', operator_created: 'Account created', operator_revoked: 'Account revoked',
    role_changed: 'Role changed', password_changed: 'Password changed', branding_updated: 'Branding updated',
    payment_gateway_updated: 'Payment gateway updated', platform_access_granted: 'Platform access granted',
    platform_access_revoked: 'Platform access revoked', vendor_created: 'API configuration created',
    vendor_updated: 'API configuration updated', vendor_seeded: 'API configuration imported',
    vendor_model_created: 'Model binding created', vendor_model_updated: 'Model binding updated',
    vendor_model_seeded: 'Model binding imported', provider_created: 'Provider created',
  };
  return names[action] ?? action.replaceAll('_', ' ').replace(/\bsuppliers?\b/gi, value => value.endsWith('s') ? 'providers' : 'provider').replace(/^./, value => value.toUpperCase());
}
function actorName(event: PlatformAuditEvent) {
  return event.actor_kind === 'unknown' ? 'Not recorded' : event.actor_label;
}

export default function AuditLogsPage() {
  const { token } = useDashboardContext();
  return <AuditLogs key={token} token={token} />;
}

function AuditLogs({ token }: { token: string }) {
  const [category, setCategory] = useState<PlatformAuditCategory | 'all'>('all');
  const [rows, setRows] = useState<PlatformAuditEvent[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    pending.current?.abort(); pending.current = controller;
    setRows(null); setCursor(null); setError(''); setLoading(true);
    const query = new URLSearchParams({ limit: '50' });
    if (category !== 'all') query.set('category', category);
    void request<PlatformAuditPage>(token, '/api/v1/platform/audit-events?' + query, 'GET', undefined, controller.signal)
      .then(page => { if (!controller.signal.aborted) { setRows(page.data); setCursor(page.next_cursor); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Audit logs could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); pending.current?.abort(); };
  }, [token, category, revision]);

  async function loadMore() {
    if (!cursor || loading) return;
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    setLoading(true); setError('');
    const query = new URLSearchParams({ limit: '50', cursor });
    if (category !== 'all') query.set('category', category);
    try {
      const page = await request<PlatformAuditPage>(token, '/api/v1/platform/audit-events?' + query, 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      setRows(previous => {
        const ids = new Set(previous?.map(event => event.id));
        return [...previous ?? [], ...page.data.filter(event => !ids.has(event.id))];
      });
      setCursor(page.next_cursor);
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'More audit events could not be loaded.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }

  return <section className="space-y-5" aria-label="Platform audit logs">
    <p className="text-sm text-muted-foreground">Saved account, access, Provider and configuration operations. Rejected login attempts and reads are not recorded here. Historical actor details may be missing; session issuance does not prove an interactive login.</p>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" aria-label="Audit category">{categories[category]}<IconChevronDown size={16} /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start"><DropdownMenuRadioGroup value={category} onValueChange={value => setCategory(value as typeof category)}>
          {Object.entries(categories).map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup></DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}><IconRefresh size={16} />Refresh</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error} <Button variant="ghost" onClick={() => setRevision(value => value + 1)}>Retry</Button></p>}
    {rows === null ? loading && <p role="status">Loading audit logs…</p> : rows.length === 0 ? <p>No audit events in this category.</p> : <Table>
      <TableHeader><TableRow><TableHead className="w-48">Time (UTC)</TableHead><TableHead>Action</TableHead><TableHead className="hidden md:table-cell">Actor</TableHead><TableHead className="hidden md:table-cell">Target</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map(event => <TableRow key={event.id}>
        <TableCell className="align-top whitespace-normal text-xs tabular-nums sm:whitespace-nowrap"><time dateTime={event.created_at}>{event.created_at.replace('T', ' ').replace(/\.\d+Z$/, '')}</time></TableCell>
        <TableCell className="align-top whitespace-normal break-words"><span>{actionName(event.action)}{event.action === 'role_changed' && event.before_role && event.after_role ? ' · ' + event.before_role[0].toUpperCase() + event.before_role.slice(1) + ' → ' + event.after_role[0].toUpperCase() + event.after_role.slice(1) : ''}</span><small className="mt-1 block text-muted-foreground">{categories[event.category]}{event.revision !== null ? ' · Revision ' + event.revision : ''}</small><dl className="mt-2 space-y-1 md:hidden"><div><dt className="inline text-xs text-muted-foreground">Actor: </dt><dd className="inline">{actorName(event)}</dd></div><div><dt className="inline text-xs text-muted-foreground">Target: </dt><dd className="inline">{event.target_label}</dd></div></dl></TableCell>
        <TableCell className="hidden align-top whitespace-normal break-words md:table-cell">{actorName(event)}</TableCell>
        <TableCell className="hidden align-top whitespace-normal break-words md:table-cell">{event.target_label}</TableCell>
      </TableRow>)}</TableBody>
    </Table>}
    {cursor && <div className="flex justify-center"><Button variant="outline" disabled={loading} onClick={() => void loadMore()}>{loading ? 'Loading…' : 'Load more'}</Button></div>}
  </section>;
}
