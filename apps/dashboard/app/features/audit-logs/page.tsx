import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { translateUI, readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState } from 'react';
import { IconChevronDown, IconHistory, IconRefresh, IconSearch } from '@tabler/icons-react';
import type { PlatformAuditCategory, PlatformAuditEvent, PlatformAuditPage } from '@niu-io/sdk/platform-audit';
import { TableSkeleton } from '@/components/PageSkeletons';
import PageHeader from '@/components/PageHeader';
import { fetchQuery, peekQuery } from '@/lib/query-cache';
import { useDashboardContext } from '@/shell/dashboard-context';
import { request } from '@/features/providers/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const categories: Record<PlatformAuditCategory | 'all', string> = {
  all: 'All events', authentication: 'Authentication', configuration: 'Configuration', access: 'Access', supplier: 'Provider',
};
const names: Record<string, string> = {
    password_login_succeeded: 'Password login succeeded', session_created: 'Session issued',
    session_revoked: 'Session revoked', operator_created: 'Account created', operator_revoked: 'Account revoked',
    role_changed: 'Role changed', password_changed: 'Password changed', branding_updated: 'Branding updated',
    payment_gateway_updated: 'Payment gateway updated', platform_access_granted: 'Platform access granted',
    platform_access_revoked: 'Platform access revoked', vendor_created: 'Provider connection created',
    vendor_retired: 'Provider connection retired', vendor_updated: 'Provider connection updated', vendor_seeded: 'Provider connection imported',
    vendor_model_created: 'Model route created', vendor_model_updated: 'Model route updated',
    vendor_model_seeded: 'Model route imported', provider_created: 'Provider created', supplier_associated: 'Provider associated', provider_associated: 'Provider associated',
  };
function actionName(action: string) {
  const known = names[action];
  if (known) return translateUI(known);
  const cleaned = action.replace(/_/g, ' ').trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : translateUI('Other action');
}
function roleName(role:string) {const labels:Record<string,string>={owner:'Owner',admin:'Administrator',viewer:'Viewer'};return translateUI(labels[role]??'Unknown');}
function actorName(event: PlatformAuditEvent) {
  return event.actor_kind === 'unknown' ? translateUI('Not recorded') : event.actor_kind === 'installation' ? translateUI('Installation administrator (recorded)') : event.actor_label;
}

export default function AuditLogsPage() {
  const { token } = useDashboardContext();
  return <AuditLogs key={token} token={token} />;
}

function AuditLogs({ token }: { token: string }) {
  const { t: uiT } = useUILocale();
  function targetName(event: PlatformAuditEvent) {
    if (event.source !== 'vendor') return event.target_label;
    const [connection, ...model] = event.target_label.split(' / ');
    const reference = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(connection)
      ? `ID ${connection}` : connection;
    return [uiT("Provider connection", "供应商连接"), reference, ...model].join(' · ');
  }
  function eventAction(action: string) {
    switch (action) {
      case 'registration_preview_enabled': return uiT('Limited Preview registration enabled', '已开启有限预览注册');
      case 'registration_disabled': return uiT('Self-registration closed', '已关闭自助注册');
      case 'registration_approved': return uiT('Registration approved', '已批准注册申请');
      case 'registration_rejected': return uiT('Registration rejected', '已拒绝注册申请');
      default: return actionName(action);
    }
  }
  const scope = token || 'public';
  const [category, setCategory] = useState<PlatformAuditCategory | 'all'>('all');
  const initialPage = peekQuery<PlatformAuditPage>(scope, '/api/v1/admin/audit?limit=50');
  const [rows, setRows] = useState<PlatformAuditEvent[] | null>(() => initialPage?.data ?? null);
  const [cursor, setCursor] = useState<string | null>(() => initialPage?.next_cursor ?? null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(() => !initialPage);
  const [loadedPath, setLoadedPath] = useState('/api/v1/admin/audit?limit=50');
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const filtered = category !== 'all' || Boolean(query.trim());
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [query]);
  const params = new URLSearchParams({ limit: '50' });
  if (category !== 'all') params.set('category', category);
  if (search) {
    params.set('search', search);
    const labels = [
      ...[...Object.keys(names), 'registration_preview_enabled', 'registration_disabled', 'registration_approved', 'registration_rejected']
        .map(action => [`action:${action}`, eventAction(action)]),
      ...Object.entries(categories).filter(([key]) => key !== 'all').map(([key, name]) => [`category:${key}`, uiT(name)]),
      ['source:vendor', uiT('Provider connection', '供应商连接')],
      ['actor:unknown', uiT('Not recorded')],
      ['actor:installation', uiT('Installation administrator (recorded)')],
    ].filter(([, label]) => label.toLowerCase().includes(search.toLowerCase())).map(([key]) => key);
    if (labels.length) params.set('labels', labels.join(','));
  }
  const path = '/api/v1/admin/audit?' + params;
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    pending.current?.abort(); pending.current = controller;
    const cached = peekQuery<PlatformAuditPage>(scope, path);
    setLoadedPath(path);
    if (cached) {
      setRows(cached.data);
      setCursor(cached.next_cursor);
      setLoading(true);
    } else {
      setRows(null);
      setCursor(null);
      setLoading(true);
    }
    setError('');
    void fetchQuery(
      scope,
      path,
      signal => request<PlatformAuditPage>(token, path, 'GET', undefined, signal),
      { signal: controller.signal, force: revision > 0, awaitRevalidate: true },
    )
      .then(page => { if (!controller.signal.aborted) { setRows(page.data); setCursor(page.next_cursor); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Audit logs could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); pending.current?.abort(); };
  }, [scope, token, path, revision]);

  async function loadMore() {
    if (!cursor || loading) return;
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    setLoading(true); setError('');
    try {
      const page: PlatformAuditPage = await request(token, path + '&cursor=' + encodeURIComponent(cursor), 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (page.next_cursor === cursor) throw new Error('Audit history did not advance.');
      setRows(previous => {
        const ids = new Set(previous?.map(event => event.id));
        return [...previous ?? [], ...page.data.filter(event => !ids.has(event.id))];
      });
      setCursor(page.next_cursor);
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'More audit events could not be loaded.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }

  return <section className="empty-region space-y-5" aria-label={uiT("Platform audit logs")}>
    <PageHeader
      title={uiT("Audit logs")}
      action={
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={loading}
          aria-label={uiT("Refresh")}
          title={uiT("Refresh")}
          onClick={() => setRevision(value => value + 1)}
        >
          <IconRefresh size={16} className={loading ? 'animate-spin' : undefined} aria-hidden="true" />
        </Button>
      }
    />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" aria-label={uiT("Audit category")}>{translateUI(categories[category])}<IconChevronDown size={16} /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start"><DropdownMenuRadioGroup value={category} onValueChange={value => setCategory(value as typeof category)}>
          {Object.entries(categories).map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{uiT(label)}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup></DropdownMenuContent>
      </DropdownMenu>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        <div className="relative w-full sm:w-64">
          <IconSearch size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-full pl-9"
            ref={searchInput}
            type="search" maxLength={256}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={uiT("Search events")}
            aria-label={uiT("Search audit events")}
          />
        </div>
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error} <Button variant="ghost" onClick={() => setRevision(value => value + 1)}>{uiT("Retry")}</Button></p>}
    {rows === null || loadedPath !== path || query.trim() !== search ? !error && <TableSkeleton columns={4} rows={6} label={uiT("Loading audit logs…")} /> : (rows ?? []).length === 0 ? <Empty className="min-h-48"><EmptyHeader><EmptyMedia variant="icon"><IconHistory size={20} aria-hidden="true" /></EmptyMedia><EmptyTitle>{filtered ? uiT("No matching audit events") : uiT("No audit events yet")}</EmptyTitle></EmptyHeader>
      {filtered && <EmptyContent><Button variant="outline" onClick={() => {
        setCategory('all');
        setQuery('');
        setSearch('');
        searchInput.current?.focus();
      }}>{uiT("Clear filters")}</Button></EmptyContent>}
    </Empty> : <Table>
      <TableHeader><TableRow><TableHead className="w-48">{uiT("Time (UTC)")}</TableHead><TableHead>{uiT("Action")}</TableHead><TableHead className="hidden md:table-cell">{uiT("Actor")}</TableHead><TableHead className="hidden md:table-cell">{uiT("Target")}</TableHead></TableRow></TableHeader>
      <TableBody>{(rows ?? []).map(event => <TableRow key={event.id}>
        <TableCell className="align-top whitespace-normal text-xs tabular-nums sm:whitespace-nowrap"><time dateTime={event.created_at}>{new Intl.DateTimeFormat(readUILocale(), { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(event.created_at))}</time></TableCell>
        <TableCell className="align-top whitespace-normal break-words"><span>{eventAction(event.action)}{event.action === 'role_changed' && event.before_role && event.after_role ? ' · ' + roleName(event.before_role) + ' → ' + roleName(event.after_role) : ''}</span><small className="mt-1 block text-muted-foreground">{translateUI(categories[event.category])}</small><dl className="mt-2 space-y-1 md:hidden"><div><dt className="inline text-xs text-muted-foreground">{uiT("Actor:")}{" "}</dt><dd className="inline">{actorName(event)}</dd></div><div><dt className="inline text-xs text-muted-foreground">{uiT("Target:")}{" "}</dt><dd className="inline">{targetName(event)}</dd></div></dl></TableCell>
        <TableCell className="hidden align-top whitespace-normal break-words md:table-cell">{actorName(event)}</TableCell>
        <TableCell className="hidden align-top whitespace-normal break-words md:table-cell">{targetName(event)}</TableCell>
      </TableRow>)}</TableBody>
    </Table>}
    {cursor && loadedPath === path && query.trim() === search && <div className="flex justify-center"><Button variant="outline" disabled={loading} onClick={() => void loadMore()}>{loading ? uiT("Loading…") : uiT("Load more")}</Button></div>}
  </section>;
}
