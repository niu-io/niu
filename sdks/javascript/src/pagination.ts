/** Internal wire adapters keep cursor names out of item iteration. */
export async function* iterateCursorItems<T>(
  fetchPage: (cursor?: string) => Promise<{ data: T[]; nextCursor: string | null; hasMore?: boolean }>,
  cursor?: string,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  const seen = new Set<string>(cursor === undefined ? [] : [cursor]);
  for (;;) {
    signal?.throwIfAborted();
    const page = await fetchPage(cursor);
    signal?.throwIfAborted();
    const next = page.nextCursor;
    if (!Array.isArray(page.data) || (next !== null && (typeof next !== 'string' || next.length === 0))) {
      throw new Error('Invalid pagination response: data and an explicit continuation are required');
    }
    if (page.hasMore !== undefined && page.hasMore !== (next !== null)) {
      throw new Error('Invalid pagination response: has_more disagrees with continuation');
    }
    if (next !== null && seen.has(next)) throw new Error('Repeated pagination cursor');
    if (next !== null) seen.add(next);
    for (const item of page.data) {
      signal?.throwIfAborted();
      yield item;
    }
    if (next === null) return;
    cursor = next;
  }
}
