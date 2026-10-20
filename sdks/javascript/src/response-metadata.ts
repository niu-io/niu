import type { RequestOptions, ResponseMetadata } from './index.js';

export function responseMetadata(response: Response): ResponseMetadata {
  return {
    status: response.status,
    requestId: response.headers.get('x-request-id'),
    attemptId: response.headers.get('x-niu-attempt-id'),
    operationId: response.headers.get('x-niu-operation-id'),
  };
}

/** Observe headers before any transport consumes the body, including on errors. */
export async function notifyResponse(response: Response, options: RequestOptions): Promise<void> {
  if (!options.onResponse) return;
  try {
    options.onResponse(responseMetadata(response));
  } catch (error) {
    await response.body?.cancel().catch(() => {});
    throw error;
  }
}
