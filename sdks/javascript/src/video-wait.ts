import type { RequestOptions, VideoJobState } from './index.js';

/** Existing saved-job endpoints only; waiting never submits a generation. */
export type VideoJobReader = {
  retrieve(id: string, options?: RequestOptions): Promise<VideoJobState>;
  refresh(id: string, options?: RequestOptions): Promise<VideoJobState>;
};
export type VideoWaitOptions = RequestOptions & {
  /** Overall deadline, including requests and sleeps. Default: ten minutes. */
  timeoutMs?: number;
  /** Delay between observations; at least one second. Default: five seconds. */
  intervalMs?: number;
};

/**
 * Read saved state, then refresh queued/running jobs until completion or deadline.
 * Unknown submission and reconciliation states return for explicit caller action.
 * Transport errors propagate immediately; no automatic retry or resubmission.
 * Cancellation aborts local waiting and requests, not the upstream video job.
 */
export async function waitForVideoJob(
  jobs: VideoJobReader,
  id: string,
  options: VideoWaitOptions = {},
): Promise<VideoJobState> {
  const timeoutMs = options.timeoutMs ?? 600_000;
  const intervalMs = options.intervalMs ?? 5_000;
  for (const [name, value, minimum] of [
    ['timeoutMs', timeoutMs, 1], ['intervalMs', intervalMs, 1_000],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < minimum || value > 2_147_483_647) {
      throw new RangeError(`${name} must be an integer between ${minimum} and 2147483647`);
    }
  }
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const deadline = performance.now() + timeoutMs;
  const timeout = new DOMException('Video job wait deadline exceeded', 'TimeoutError');
  const timer = setTimeout(() => controller.abort(timeout), timeoutMs);
  const requestOptions: RequestOptions = {
    signal: controller.signal,
    ...(options.logPayloads === undefined ? {} : { logPayloads: options.logPayloads }),
  };
  const check = () => {
    if (!controller.signal.aborted && performance.now() >= deadline) controller.abort(timeout);
    controller.signal.throwIfAborted();
  };
  try {
    check();
    let state = await jobs.retrieve(id, requestOptions);
    check();
    while (state.status === 'queued' || state.status === 'running') {
      await delay(Math.min(intervalMs, Math.max(0, deadline - performance.now())), controller.signal);
      check();
      state = await jobs.refresh(id, requestOptions);
      check();
    }
    return state;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
