import { request } from '@/features/providers/api';
export type RetailModelChoice = { model_alias: string; media: { channel: string; resolutions: string[]; reference_video: boolean; meter: string } | null };
/** Registration supports price preparation; never infer supply from this list. */
export async function registeredRetailModelChoices(token: string, signal: AbortSignal): Promise<RetailModelChoice[]> {
  let after: string | null = null; const choices = new Map<string,RetailModelChoice>(), seen = new Set<string>();
  do {
    const page: { data: RetailModelChoice[]; next_after: string | null } = await request(token, '/api/v1/pricing/standard-prices/models?limit=100' + (after ? '&after=' + encodeURIComponent(after) : ''), 'GET', undefined, signal);
    if (!Array.isArray(page.data) || (page.next_after !== null && (typeof page.next_after !== 'string' || !page.next_after || seen.has(page.next_after)))) throw new Error('Model pagination did not advance. Close and refresh.');
    for (const row of page.data) {
      if (!row.model_alias?.trim()) throw new Error('Registered model name unavailable.');
      if (row.media && (!row.media.channel?.trim() || !row.media.meter?.trim() || !Array.isArray(row.media.resolutions) || !row.media.resolutions.length || row.media.resolutions.some(value=>typeof value!=='string'||!value.trim()) || typeof row.media.reference_video!=='boolean')) throw new Error('Media specifications could not be verified. Close and refresh.');
      choices.set(row.model_alias, {...row,media:row.media ?? null});
    }
    after = page.next_after; if (after) seen.add(after);
  } while (after);
  return [...choices.values()];
}
export async function registeredRetailModels(token: string, signal: AbortSignal): Promise<string[]> {
  return (await registeredRetailModelChoices(token,signal)).map(row=>row.model_alias);
}

export type RetailCustomer = { organization_id: string; organization_name: string; created_at: string };
export async function retailCustomers(token: string, signal: AbortSignal): Promise<RetailCustomer[]> {
  let after: string | null = null; const rows = new Map<string, RetailCustomer>(), seen = new Set<string>();
  do {
    const page: { data: RetailCustomer[]; next_after: string | null } = await request(token, '/api/v1/pricing/customers?limit=100' + (after ? '&after=' + encodeURIComponent(after) : ''), 'GET', undefined, signal);
    if (!Array.isArray(page.data) || (page.next_after !== null && (typeof page.next_after !== 'string' || !page.next_after || seen.has(page.next_after)))) throw new Error('Customer pagination did not advance. Close and refresh.');
    for (const row of page.data) { if (!row.organization_id || !row.organization_name?.trim() || !Number.isFinite(Date.parse(row.created_at))) throw new Error('Customer details unavailable.'); rows.set(row.organization_id, row); }
    after = page.next_after; if (after) seen.add(after);
  } while (after);
  return [...rows.values()];
}
