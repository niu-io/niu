// Hiding the tab also cancels a tick that has already started.
export function pollVisibleVideoJob(check: (signal: AbortSignal) => Promise<void>) {
  let active: AbortController | undefined;
  let timer: number | undefined;
  function stop() {
    window.clearInterval(timer);
    timer = undefined;
    active?.abort();
  }
  function update() {
    if (document.visibilityState === 'hidden') {
      stop();
    } else if (timer === undefined) {
      timer = window.setInterval(async () => {
        if (active || document.visibilityState === 'hidden') return;
        active = new AbortController();
        try {
          await check(active.signal);
        } finally {
          active = undefined;
        }
      }, 5000);
    }
  }
  document.addEventListener('visibilitychange', update);
  update();
  return () => {
    document.removeEventListener('visibilitychange', update);
    stop();
  };
}
