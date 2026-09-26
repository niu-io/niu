import { defineMiddleware } from 'astro:middleware';

// Development-only bridge; packaged catalog traffic is served by the Gateway.
export const onRequest = defineMiddleware(async ({ request, url }, next) => {
  if (!import.meta.env.DEV || url.pathname !== '/catalog/v1/models') return next();
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  try {
    const upstream = await fetch('http://127.0.0.1:2555/catalog/v1/models', {
      signal: AbortSignal.timeout(5000),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return Response.json({ error: 'Local gateway unavailable' }, { status: 502 });
  }
});
