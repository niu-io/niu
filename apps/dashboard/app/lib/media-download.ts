// Leave capacity for other clients while a session loads several saved results.
// A slot covers the entire body read, not just receipt of response headers.
const MAX_DOWNLOADS = 2;
let active = 0;
const waiting: Array<() => void> = [];

export async function downloadMedia<T>(signal: AbortSignal, read: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      const index = waiting.indexOf(start);
      if (index >= 0) waiting.splice(index, 1);
      reject(signal.reason);
    };
    const start = () => {
      signal.removeEventListener('abort', abort);
      active += 1;
      resolve();
    };
    if (active < MAX_DOWNLOADS) start();
    else {
      waiting.push(start);
      signal.addEventListener('abort', abort, { once: true });
    }
  });
  try {
    signal.throwIfAborted();
    return await read();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}
