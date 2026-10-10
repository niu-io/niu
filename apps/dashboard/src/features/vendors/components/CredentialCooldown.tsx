import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { request } from '../api';
import type { VendorCooldown } from '../../../../../../sdks/javascript/src/admin';

function readable(value: VendorCooldown) {
  return value.policy_revision === 'openrouter-auth-cooldown-v1' &&
    value.failure_threshold === 3 && value.window_seconds === 60 && value.cooldown_seconds === 60 &&
    typeof value.active === 'boolean' && Number.isSafeInteger(value.qualifying_failures) && value.qualifying_failures >= 0 &&
    (value.cooldown_until === null ? !value.active : typeof value.cooldown_until === 'string' && Number.isFinite(Date.parse(value.cooldown_until)));
}

export default function CredentialCooldown({ token, vendorId }: { token: string; vendorId: string }) {
  const [state, setState] = useState<VendorCooldown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();setState(null);setLoading(true);setError('');
    void request<{data: VendorCooldown}>(token, `/admin/v1/vendors/${encodeURIComponent(vendorId)}/cooldown`, 'GET', undefined, controller.signal)
      .then(({data}) => {if (!controller.signal.aborted) {
        if (!readable(data)) throw new Error('The cooldown status could not be read.');
        setState(data);
      }})
      .catch(cause => {if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load cooldown status.');})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [token, vendorId, refresh]);
  return <div className="mt-4 border-t pt-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h3 className="text-sm font-medium">Temporary cooldown</h3><p className="mt-1 text-sm text-muted-foreground">{loading ? 'Loading…' : error || !state ? 'Unavailable' : state.active ? 'New requests temporarily unavailable' : 'No active cooldown'}</p></div><Button variant="ghost" disabled={loading} aria-label={error ? 'Retry cooldown status' : 'Refresh cooldown status'} onClick={() => setRefresh(value => value + 1)}>{error ? 'Retry' : 'Refresh'}</Button></div>
    {state && !loading && !error && <div className="mt-2 text-sm text-muted-foreground">{state.active && state.cooldown_until && <p>Cooldown until {new Intl.DateTimeFormat(undefined, {dateStyle:'medium',timeStyle:'medium'}).format(new Date(state.cooldown_until))}.</p>}<p>{state.qualifying_failures.toLocaleString()} qualifying authentication failures in the rolling 60-second window.</p>{state.active && <p>Previously dispatched requests and saved video recovery remain available.</p>}</div>}
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </div>;
}
