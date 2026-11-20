type UnauthorizedListener = (credential: string) => void;
const listeners = new Set<UnauthorizedListener>();

export function onUnauthorizedRequest(listener: UnauthorizedListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Observe authentication failures without consuming responses or retrying requests. */
export const authenticatedFetch: typeof globalThis.fetch = async (input, init) => {
  const response = await globalThis.fetch(input, init);
  if (response.status !== 401 || typeof window === 'undefined') return response;
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
  if (url.origin !== window.location.origin) return response;
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const authorization = headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    for (const listener of listeners) listener(authorization.slice(7));
  }
  return response;
};
