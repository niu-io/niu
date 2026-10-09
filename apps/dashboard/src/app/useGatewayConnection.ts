import { useCallback, useEffect, useRef, useState } from 'react';
import type { Health } from './dashboard-context';

/** Observe availability without replaying writes or discarding the verified session. */
export function useGatewayConnection(route: string) {
  const [health, setHealth] = useState<Health | null>(null);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [detail, setDetail] = useState('');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [everConnected, setEverConnected] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);
  const check = useCallback((): Promise<boolean> => {
    if (pending.current) return pending.current;
    const request = new AbortController();
    controller.current = request;
    setChecking(true);
    const timer = window.setTimeout(() => request.abort(), 5000);
    pending.current = (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}healthz`, { signal: request.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`Health check returned HTTP ${response.status}.`);
        const value = await response.json() as Health;
        if (value.status !== 'ok') throw new Error('The gateway is responding but is not ready.');
        if (mounted.current && controller.current === request) { setHealth(value); setDetail(''); setEverConnected(true); }
        return true;
      } catch (cause) {
        if (mounted.current && controller.current === request) {
          setHealth(null);
          setDetail(request.signal.aborted ? 'The health check timed out after 5 seconds.' : cause instanceof TypeError ? 'The health check could not reach the server.' : cause instanceof Error ? cause.message : 'The health check failed.');
        }
        return false;
      } finally {
        window.clearTimeout(timer);
        if (controller.current === request) pending.current = null;
        if (mounted.current && controller.current === request) { setChecked(true); setChecking(false); setLastChecked(new Date()); }
      }
    })();
    return pending.current;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      controller.current = null;
      pending.current = null;
    };
  }, []);
  useEffect(() => { void check(); }, [check, route]);
  useEffect(() => {
    const onReturn = () => { if (document.visibilityState !== 'hidden') void check(); };
    const interval = window.setInterval(onReturn, health?.status === 'ok' ? 15000 : 5000);
    window.addEventListener('online', onReturn);
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', onReturn);
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [check, health?.status]);
  return { health, checked, checking, detail, lastChecked, everConnected, check };
}
