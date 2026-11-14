import { useEffect, useRef, useState } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router';

/** Keep the current composer mounted until its backend draft is confirmed. */
export function useDraftNavigation(draft: {
  hasUnsavedChanges: () => boolean;
  flush: () => Promise<boolean>;
}) {
  const latest = useRef(draft);
  latest.current = draft;
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search)
      && latest.current.hasUnsavedChanges(),
  );
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useBeforeUnload(event => {
    if (!latest.current.hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let active = true;
    setFailed(false);
    void latest.current.flush().then(saved => {
      if (!active) return;
      if (saved) blocker.proceed();
      else setFailed(true);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [blocker, attempt]);
  return {
    pending: blocker.state === 'blocked' && !failed,
    failed: blocker.state === 'blocked' && failed,
    retry: () => setAttempt(value => value + 1),
    stay: () => { if (blocker.state === 'blocked') blocker.reset(); },
    leave: () => { if (blocker.state === 'blocked') blocker.proceed(); },
  };
}
