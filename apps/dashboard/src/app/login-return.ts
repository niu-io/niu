/** Keep authentication destinations within this dashboard's origin and base. */
export function safeLoginReturn(value: unknown, basePrefix = ''): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const parsed = new URL(value, 'http://niu.invalid');
    if (parsed.origin !== 'http://niu.invalid') return null;
    const pathname = parsed.pathname;
    if (basePrefix && !pathname.startsWith(`${basePrefix}/`)) return null;
    const route = basePrefix ? pathname.slice(basePrefix.length) : pathname;
    if (/^\/(?:login|installation)(?:\/|$)/.test(route)) return null;
    return pathname + parsed.search + parsed.hash;
  } catch { return null; }
}
