import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { keyRequest, KeyRequestError } from '../api';
import type { KeyRequestRateLimit, KeyConcurrencyLimit, KeyTokenRateLimit } from '../../../../../../sdks/javascript/src/admin';

type Policy = KeyRequestRateLimit | KeyConcurrencyLimit | KeyTokenRateLimit;
type Field = 'requests_per_minute' | 'max_concurrent_requests' | 'tokens_per_minute';
type Definition = { field: Field; path: string; label: string; maximum: number; help: string };
const definitions: Definition[] = [
  { field: 'requests_per_minute', path: 'request-rate-limit', label: 'Requests per minute', maximum: 1_000_000, help: 'Counts dispatched requests in a rolling 60-second window, including failed requests.' },
  { field: 'max_concurrent_requests', path: 'concurrency-limit', label: 'Concurrent requests', maximum: 10_000, help: 'Counts unresolved dispatched requests. Disconnecting does not release an unresolved request.' },
  { field: 'tokens_per_minute', path: 'token-rate-limit', label: 'Tokens per minute', maximum: 1_000_000_000_000, help: 'Counts known usage and unresolved estimates. A finite limit requires supported text requests with an explicit output-token maximum; video requests are blocked.' },
];
function valueOf(policy: Policy, field: Field): number | null { return (policy as unknown as Record<Field, number | null>)[field]; }
function parseLimit(draft: string, maximum: number): number | null | undefined {
  if (!draft.trim()) return null;
  if (!/^\d+$/.test(draft.trim())) return undefined;
  const value = Number(draft.trim());
  return Number.isSafeInteger(value) && value <= maximum ? value : undefined;
}
export default function KeyLimits({ token, endpoint, canWrite, active }: { token: string; endpoint: string; canWrite: boolean; active: boolean }) {
  return <Card><CardHeader><CardTitle>Limits</CardTitle><CardDescription>Throughput limits for this API key.</CardDescription></CardHeader><CardContent className="divide-y">{definitions.map(definition => <LimitPolicy key={`${token}:${endpoint}:${definition.path}`} token={token} endpoint={`${endpoint}/${definition.path}`} definition={definition} canWrite={canWrite && active} />)}</CardContent></Card>;
}
function LimitPolicy({ token, endpoint, definition, canWrite }: { token: string; endpoint: string; definition: Definition; canWrite: boolean }) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [editError, setEditError] = useState('');
  const [notice, setNotice] = useState('');
  const write = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);setError('');
    void keyRequest<{ data: Policy }>(token, endpoint, 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) {
        const value = valueOf(result.data, definition.field);
        if ((value !== null && (!Number.isSafeInteger(value) || value < 0 || value > definition.maximum)) || (result.data.revision !== null && !/^[1-9]\d*$/.test(result.data.revision))) throw new Error('The saved limit could not be read.');
        if ('committed_tokens' in result.data && ((result.data.committed_tokens !== null && !/^\d+$/.test(result.data.committed_tokens)) || !Number.isSafeInteger(result.data.unbounded_requests) || result.data.unbounded_requests < 0)) throw new Error('The saved usage could not be read.');
        if ('active_requests' in result.data && (!Number.isSafeInteger(result.data.active_requests) || result.data.active_requests < 0)) throw new Error('The saved usage could not be read.');
        setPolicy(result.data);setDraft(value === null ? '' : String(value));setConflict(false);setEditError('');
      } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load this limit.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, endpoint, definition, reload]);
  useEffect(() => () => write.current?.abort(), []);
  const parsed = parseLimit(draft, definition.maximum);
  const changed = policy && parsed !== undefined && parsed !== valueOf(policy, definition.field);
  async function save() {
    if (!canWrite || !policy || !changed || saving || conflict || loading || error || parsed === undefined) return;
    const controller = new AbortController();write.current = controller;setSaving(true);setEditError('');
    try {
      const result = await keyRequest<{ data: { revision: string } }>(token, endpoint, 'PUT', { [definition.field]: parsed, expected_revision: policy.revision ?? '0' }, controller.signal);
      if (controller.signal.aborted) return;
      setPolicy({ ...policy, [definition.field]: parsed, revision: result.data.revision });
      setOpen(false);setNotice('Limit saved.');setReload(value => value + 1);
    } catch (cause) {
      if (!controller.signal.aborted) {
        const stale = cause instanceof KeyRequestError && cause.status === 409;
        setConflict(stale);setEditError(stale ? 'This limit changed. Reload the saved limit before trying again.' : cause instanceof Error ? cause.message : 'Could not save this limit.');
      }
    } finally { if (!controller.signal.aborted) setSaving(false); }
  }
  return <div className="py-4 first:pt-0 last:pb-0">
    <div className="flex items-center justify-between gap-3"><div className="min-w-0"><h3 className="text-sm font-medium">{definition.label}</h3><p className="mt-1 text-sm text-muted-foreground">{loading ? 'Loading…' : error ? 'Unavailable' : policy ? valueOf(policy, definition.field) === null ? 'Unlimited' : valueOf(policy, definition.field) === 0 ? '0 · New requests blocked' : valueOf(policy, definition.field)?.toLocaleString() : 'Unavailable'}</p></div>
    {!loading && !error && policy && canWrite && <Button variant="outline" aria-label={`Edit ${definition.label.toLowerCase()}`} onClick={() => {setDraft(valueOf(policy, definition.field) === null ? '' : String(valueOf(policy, definition.field)));if (!conflict) setEditError('');setNotice('');setOpen(true);}}>Edit</Button>}
    {error && <Button variant="outline" aria-label={`Retry ${definition.label.toLowerCase()}`} onClick={() => setReload(value => value + 1)}>Retry</Button>}</div>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    {!loading && !error && policy && 'active_requests' in policy && <p className="mt-2 text-xs text-muted-foreground">{policy.active_requests.toLocaleString()} unresolved requests at last refresh.</p>}
    {!loading && !error && policy && 'committed_tokens' in policy && <p className="mt-2 text-xs text-muted-foreground">{policy.committed_tokens === null ? 'Committed usage unknown' : `${BigInt(policy.committed_tokens).toLocaleString()} tokens committed`} at last refresh.{policy.unbounded_requests > 0 ? ` ${policy.unbounded_requests} requests have unbounded usage.` : ''}</p>}
    {notice && <p role="status" className="mt-2 text-sm text-muted-foreground">{notice}</p>}
    <Dialog open={open} onOpenChange={next => {if (!saving) setOpen(next);}}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{definition.label}</DialogTitle><DialogDescription>{definition.help}</DialogDescription></DialogHeader>
      <form onSubmit={event => {event.preventDefault();void save();}} className="grid gap-4">
        <div className="grid gap-2"><Label htmlFor={`${definition.path}-value`}>Limit</Label><Input id={`${definition.path}-value`} inputMode="numeric" value={draft} placeholder="Unlimited" disabled={saving || conflict || loading || Boolean(error)} onChange={event => setDraft(event.target.value)} /><p className="text-sm text-muted-foreground">Leave blank for unlimited. Zero blocks new requests. Maximum {definition.maximum.toLocaleString()}.</p></div>
        {parsed === undefined && <p role="alert" className="text-sm text-destructive">Enter a whole number from 0 to {definition.maximum.toLocaleString()}, or leave blank.</p>}
        {editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>{conflict || error ? <Button type="button" disabled={loading} onClick={() => setReload(value => value + 1)}>{loading ? 'Reloading…' : 'Reload limit'}</Button> : <Button type="submit" disabled={!changed || saving || loading || !canWrite}>{saving ? 'Saving…' : 'Save limit'}</Button>}</DialogFooter>
      </form>
    </DialogContent></Dialog>
  </div>;
}
