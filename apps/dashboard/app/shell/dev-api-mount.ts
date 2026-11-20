// A prefixed local development server shares its origin with other applications.
// Only same-origin gateway requests are mounted; production keeps canonical URLs.
export function mountDevelopmentApi(base: string): void {
  const prefix = base.replace(/\/+$/, '');
  if (!prefix) return;

  const originalFetch = window.fetch.bind(window);
  const gatewayPath = /^\/(?:api\/v1|api\/plugins\/v1|admin\/v1|v1|v1beta|enterprise)(?:\/|$)/;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = input instanceof Request ? input.url : input.toString();
    let url: URL;
    try {
      url = new URL(raw, window.location.href);
    } catch {
      return originalFetch(input, init);
    }
    if (url.origin !== window.location.origin || !gatewayPath.test(url.pathname)) {
      return originalFetch(input, init);
    }
    url.pathname = prefix + url.pathname;
    return originalFetch(input instanceof Request ? new Request(url, input) : url, init);
  };
}
