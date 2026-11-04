import { useEffect, useState } from 'react';
import { invalidateQueries, peekQuery, primeQuery } from '@/lib/query-cache';

type ReadinessPayload = { ready: boolean; reason: string | null };
type State = {
  scope: string;
  retainContent: boolean;
  status: 'loading' | 'ready' | 'blocked' | 'error';
  reason: string | null;
};

function readinessCacheKey(organization?: string | null, authorityKey?: string): string {
  return `GET:/api/v1/payments/readiness:${authorityKey ?? ''}:${organization ?? 'default'}`;
}

/** Fail closed across unverified scopes, cache verified scopes across SPA transitions, and clear cache on failure. */
export function usePaymentReadiness(token: string, organization?: string | null, authorityKey?: string) {
  const enabled = Boolean(token);
  const scope = JSON.stringify([token, authorityKey ?? '', organization ?? null]);
  const cacheKey = readinessCacheKey(organization, authorityKey);

  const [state, setState] = useState<State>(() => {
    if (!enabled) return { scope: '', retainContent: false, status: 'loading', reason: null };
    const cached = peekQuery<ReadinessPayload>(token, cacheKey);
    if (cached) {
      return {
        scope,
        retainContent: cached.ready,
        status: cached.ready ? 'ready' : 'blocked',
        reason: cached.reason,
      };
    }
    return { scope: '', retainContent: false, status: 'loading', reason: null };
  });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState({ scope: '', retainContent: false, status: 'loading', reason: null });
      return;
    }
    let alive = true;
    let pending: AbortController | undefined;

    const cached = peekQuery<ReadinessPayload>(token, cacheKey);
    if (cached) {
      setState({
        scope,
        retainContent: cached.ready,
        status: cached.ready ? 'ready' : 'blocked',
        reason: cached.reason,
      });
    }

    const refresh = async () => {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      try {
        const response = await fetch(
          '/api/v1/payments/readiness' + (organization ? '?organization=' + encodeURIComponent(organization) : ''),
          { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', signal: controller.signal },
        );
        if (!response.ok) throw new Error('Readiness unavailable');
        const { data } = await response.json();
        if (typeof data?.ready !== 'boolean' || (data.reason !== null && typeof data.reason !== 'string')) {
          throw new Error('Invalid readiness');
        }
        if (alive && !controller.signal.aborted) {
          primeQuery(token, cacheKey, { ready: data.ready, reason: data.reason });
          setState({
            scope,
            retainContent: data.ready,
            status: data.ready ? 'ready' : 'blocked',
            reason: data.reason,
          });
        }
      } catch {
        if (alive && !controller.signal.aborted) {
          invalidateQueries(full => full === `${token}::${cacheKey}`, { remove: true });
          setState(previous => ({
            scope,
            retainContent: previous.scope === scope && previous.retainContent,
            status: 'error',
            reason: null,
          }));
        }
      }
    };

    void refresh();
    window.addEventListener('niu:payment-mode', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      alive = false;
      pending?.abort();
      window.removeEventListener('niu:payment-mode', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [enabled, token, organization, scope, cacheKey, revision]);

  const cachedForCurrent =
    enabled && state.scope !== scope ? peekQuery<ReadinessPayload>(token, cacheKey) : undefined;
  const resolved: Omit<State, 'scope'> =
    state.scope === scope
      ? state
      : cachedForCurrent
        ? {
            retainContent: cachedForCurrent.ready,
            status: cachedForCurrent.ready ? 'ready' : 'blocked',
            reason: cachedForCurrent.reason,
          }
        : { retainContent: false, status: 'loading', reason: null };

  return {
    ...resolved,
    retry: () => {
      if (enabled) {
        invalidateQueries(full => full === `${token}::${cacheKey}`, { remove: true });
      }
      setState(previous => ({ ...previous, scope, status: 'loading', reason: null }));
      setRevision(value => value + 1);
    },
  };
}
