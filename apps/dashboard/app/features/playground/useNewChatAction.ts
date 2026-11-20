import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

type DraftControl = { ready: boolean; error: string; flush: () => Promise<boolean> };
type SavedKey = { id: string; slug?: string | null };

/** Reset on the committed action route, then confirm the fresh draft before consuming it. */
export function useNewChatAction(requested: boolean, draft: DraftControl, keys: SavedKey[], reset: () => void) {
  const location = useLocation();
  const navigate = useNavigate();
  const [initialized, setInitialized] = useState(false);
  const resetRef = useRef(reset);
  const flushRef = useRef(draft.flush);
  resetRef.current = reset;
  flushRef.current = draft.flush;
  useEffect(() => {
    if (!requested) { setInitialized(false); return; }
    if (initialized) return;
    // The previous saved-session route must not restore itself after this reset.
    resetRef.current();
    setInitialized(true);
  }, [requested, initialized]);
  useEffect(() => {
    if (!requested || !initialized || !draft.ready || draft.error) return;
    let cancelled = false;
    void flushRef.current().then(saved => {
      if (!saved || cancelled) return;
      const params = new URLSearchParams(location.search);
      params.delete('new');
      params.delete('session');
      const key = keys.find(item => item.id === params.get('key') || item.slug === params.get('key'));
      if (key?.slug) params.set('key', key.slug);
      const query = params.toString();
      const basePath = location.pathname.startsWith('/generations/') ? '/generations' : location.pathname;
      navigate(`${basePath}${query ? `?${query}` : ''}${location.hash}`, { replace: true });
    });
    return () => { cancelled = true; };
  }, [requested, initialized, draft.ready, draft.error, location.pathname, location.search, location.hash, navigate, keys]);
}
