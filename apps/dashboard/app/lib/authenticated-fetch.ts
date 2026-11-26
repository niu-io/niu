import { readLocale } from '@/shell/locale';
import { isRawTechnicalErrorText, sanitizeUserFacingErrorText } from './user-facing-error';

type UnauthorizedListener = (credential: string) => void;
const listeners = new Set<UnauthorizedListener>();

export function onUnauthorizedRequest(listener: UnauthorizedListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function isSameOriginApiUrl(input: RequestInfo | URL): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    return (
      url.origin === window.location.origin &&
      (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/'))
    );
  } catch {
    return false;
  }
}

async function sanitizeApiErrorResponse(response: Response): Promise<Response> {
  if (!response.headers || typeof response.headers.get !== 'function') return response;
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const locale = readLocale();
  const headerCode = response.headers.get('x-niu-error-code') ?? undefined;

  if (contentType.includes('text/html')) {
    const message = sanitizeUserFacingErrorText('<!DOCTYPE html>', locale, {
      errorType: headerCode ?? 'upstream_error',
      status: response.status,
    });
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json');
    headers.delete('content-length');
    return new Response(
      JSON.stringify({
        error: {
          message,
          type: headerCode ?? 'upstream_error',
          param: null,
          code: response.status,
        },
      }),
      { status: response.status, statusText: response.statusText, headers },
    );
  }

  if (!contentType.includes('application/json') || typeof response.clone !== 'function') {
    return response;
  }

  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }
  if (!payload || typeof payload !== 'object') return response;
  const root = payload as { error?: { message?: unknown; type?: unknown } };
  if (!root.error || typeof root.error !== 'object' || typeof root.error.message !== 'string') {
    return response;
  }
  const rawMessage = root.error.message;
  if (!isRawTechnicalErrorText(rawMessage) && locale !== 'zh-CN') {
    return response;
  }
  const errorType = typeof root.error.type === 'string' ? root.error.type : headerCode;
  const sanitized = sanitizeUserFacingErrorText(rawMessage, locale, {
    errorType,
    status: response.status,
  });
  if (sanitized === rawMessage) return response;

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(
    JSON.stringify({
      ...payload,
      error: {
        ...root.error,
        message: sanitized,
      },
    }),
    { status: response.status, statusText: response.statusText, headers },
  );
}

/** Observe authentication failures and sanitize raw storage/proxy errors without retrying requests. */
export const authenticatedFetch: typeof globalThis.fetch = async (input, init) => {
  const response = await globalThis.fetch(input, init);
  if (typeof window === 'undefined') return response;
  if (response.status === 401) {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.origin === window.location.origin) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const authorization = headers.get('authorization');
      if (authorization?.startsWith('Bearer ')) {
        for (const listener of listeners) listener(authorization.slice(7));
      }
    }
  }
  if (!response.ok && isSameOriginApiUrl(input)) {
    return sanitizeApiErrorResponse(response);
  }
  return response;
};
