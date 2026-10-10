import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import KeyPolicyHistory from '@/features/keys/components/KeyPolicyHistory';
import { request, VendorRequestError } from '../api';
import type { VendorRequestRateLimit } from '../../../../../../sdks/javascript/src/admin';

function valid(policy: VendorRequestRateLimit) {
  return typeof policy.revision === 'string' && /^(0|[1-9]\d*)$/.test(policy.revision) &&
    (policy.requests_per_minute === null || Number.isSafeInteger(policy.requests_per_minute) && policy.requests_per_minute >= 0 && policy.requests_per_minute <= 1_000_000);
}
export default function CredentialRequestLimit({ token, vendorId }: { token: string; vendorId: string }) {
  const endpoint = `/admin/v1/vendors/${encodeURIComponent(vendorId)}/request-rate-limit`;
  const [policy, setPolicy] = useState<VendorRequestRateLimit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [editError, setEditError] = useState('');
  const write = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();setLoading(true);setError('');setPolicy(null);
    void request<{data: VendorRequestRateLimit}>(token, endpoint, 'GET', undefined, controller.signal)
      .then(({data}) => {if (!controller.signal.aborted) {
        if (!valid(data)) throw new Error('The saved limit could not be read.');
        setPolicy(data);setDraft(data.requests_per_minute === null ? '' : String(data.requests_per_minute));setConflict(false);setEditError('');
      }})
      .catch(cause => {if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load this limit.');})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [token, endpoint, reload]);
  useEffect(() => () => write.current?.abort(), []);
  const trimmed = draft.trim();
  const parsed = !trimmed ? null : /^\d+$/.test(trimmed) && Number.isSafeInteger(Number(trimmed)) && Number(trimmed) <= 1_000_000 ? Number(trimmed) : undefined;
  const changed = policy && parsed !== undefined && parsed !== policy.requests_per_minute;
  async function save() {
    if (!policy || !changed || saving || loading || error || conflict || parsed === undefined) return;
    const controller = new AbortController();write.current = controller;setSaving(true);setEditError('');
    try {
      const {data} = await request<{data: VendorRequestRateLimit}>(token, endpoint, 'PUT', {requests_per_minute: parsed, expected_revision: policy.revision}, controller.signal);
      if (controller.signal.aborted) return;
      if (!valid(data)) throw new Error('The saved limit could not be read. Reload before trying again.');
      setPolicy(data);setOpen(false);setReload(value => value + 1);
    } catch(cause) {if (!controller.signal.aborted) {
      const stale = cause instanceof VendorRequestError && cause.status === 409;
      setConflict(stale);setEditError(stale ? 'This limit changed. Reload the saved limit before trying again.' : cause instanceof Error ? cause.message : 'Could not save this limit.');
    }} finally {if (!controller.signal.aborted) setSaving(false);}
  }
  return <div className="mt-4 border-t pt-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-medium">Requests per minute</h3><p className="mt-1 text-sm text-muted-foreground">{loading ? 'Loading…' : error || !policy ? 'Unavailable' : policy.requests_per_minute === null ? 'Unlimited' : policy.requests_per_minute === 0 ? '0 · New requests blocked' : policy.requests_per_minute.toLocaleString()}</p></div><div className="flex gap-1"><KeyPolicyHistory token={token} endpoint={endpoint} label="Requests per minute" field="requests_per_minute" />{policy && !loading && !error && <Button variant="outline" onClick={() => {setDraft(policy.requests_per_minute === null ? '' : String(policy.requests_per_minute));setEditError('');setOpen(true);}}>Edit limit</Button>}{error && <Button variant="outline" onClick={() => setReload(value => value + 1)}>Retry limit</Button>}</div></div>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    <Dialog open={open} onOpenChange={next => {if (!saving) setOpen(next);}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Requests per minute</DialogTitle><DialogDescription>Counts dispatched requests through this Supplier API key across workspaces in a rolling 60-second window, including failed requests.</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={event => {event.preventDefault();void save();}}><div className="grid gap-2"><Label htmlFor="credential-request-limit">Limit</Label><Input id="credential-request-limit" inputMode="numeric" placeholder="Unlimited" value={draft} disabled={saving || conflict || loading || Boolean(error)} onChange={event => setDraft(event.target.value)} /><p className="text-sm text-muted-foreground">Leave blank for unlimited. Zero blocks new requests. Maximum 1,000,000.</p></div>{parsed === undefined && <p role="alert" className="text-sm text-destructive">Enter a whole number from 0 to 1,000,000, or leave blank.</p>}{editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>{conflict || error ? <Button type="button" disabled={loading} onClick={() => setReload(value => value + 1)}>Reload limit</Button> : <Button type="submit" disabled={!changed || saving || loading}>Save limit</Button>}</DialogFooter></form></DialogContent></Dialog>
  </div>;
}
