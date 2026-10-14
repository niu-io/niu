import { request } from '@/features/vendors/api';
/** Registration supports price preparation; never infer supply from this list. */
export async function registeredRetailModels(token: string, signal: AbortSignal): Promise<string[]> {
  let after: string | null = null; const names = new Set<string>(), seen = new Set<string>();
  do {
    const page: { data: { model_alias: string }[]; next_after: string | null } = await request(token, '/admin/v1/pricing/standard-prices/models?limit=100' + (after ? '&after=' + encodeURIComponent(after) : ''), 'GET', undefined, signal);
    if (!Array.isArray(page.data) || (page.next_after !== null && (typeof page.next_after !== 'string' || !page.next_after || seen.has(page.next_after)))) throw new Error('Model pagination did not advance. Close and refresh.');
    for (const row of page.data) { if (!row.model_alias?.trim()) throw new Error('Registered model name unavailable.'); names.add(row.model_alias); }
    after = page.next_after; if (after) seen.add(after);
  } while (after);
  return [...names];
}
