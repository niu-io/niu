import { request, VendorRequestError, type Vendor, type VendorModel } from '@/features/vendors/api';
import type { CustomerTariffHistory, CustomerTariffInput, CustomerTariff } from '../../../../../sdks/javascript/src/admin';

export type PricingTarget = { organization_id: string; organization_name: string; workspace_id: string; workspace_name: string };
export type CurrentTariff = CustomerTariff & { created_at: string };
export type PricingPage<T> = { data: T[]; next_after: string | null };
export class PublicationUnconfirmedError extends Error {}
const maximum = 9_223_372_036_854_775_807n;
const maximumTokenRate = 1_000_000_000_000_000n;
const exact = (value: unknown): value is string => typeof value === 'string' && /^\d{1,19}$/.test(value) && BigInt(value) <= maximum;
const tokenRate = (value: unknown): value is string => exact(value) && BigInt(value) <= maximumTokenRate;

/** Selling configuration amounts only; zero is a valid published price. */
export function priceToNanos(value: string): string {
  const match = /^(\d+)(?:\.(\d{1,9}))?$/.exec(value.trim());
  if (!match) throw new Error('Use a nonnegative price with at most nine decimal places.');
  const result = BigInt(match[1]) * 1_000_000_000n + BigInt((match[2] ?? '').padEnd(9, '0'));
  if (result > maximum) throw new Error('Price exceeds the supported range.');
  return result.toString();
}
export function priceFromNanos(value: string): string {
  if (!exact(value)) throw new Error('Invalid selling price.');
  const result = BigInt(value);
  const fraction = (result % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return `${result / 1_000_000_000n}${fraction ? `.${fraction}` : ''}`;
}
function checkedTariff(row: CurrentTariff) {
  if (!row || typeof row.model_alias !== 'string' || !row.model_alias.trim() ||
    typeof row.revision !== 'string' || !row.revision || !/^[A-Z]{3}$/.test(row.currency) ||
    !tokenRate(row.prompt_rate) || !tokenRate(row.completion_rate) ||
    (row.cached_prompt_rate != null && !tokenRate(row.cached_prompt_rate)) ||
    (row.reasoning_completion_rate != null && !tokenRate(row.reasoning_completion_rate)) ||
    (row.request_fee_nanos != null && !exact(row.request_fee_nanos)) ||
    (row.minimum_charge_nanos != null && !exact(row.minimum_charge_nanos)) ||
    typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at)))
    throw new Error('Customer prices could not be read.');
  return row;
}
function checkedPage<T>(page: PricingPage<T>, check: (row: T) => T, cursor?: string): PricingPage<T> {
  if (!page || !Array.isArray(page.data) || !(page.next_after === null || typeof page.next_after === 'string' && !!page.next_after) ||
    cursor !== undefined && page.next_after === cursor) throw new Error('Pricing history did not advance. Refresh and try again.');
  page.data.forEach(check);
  return page;
}
export async function listPricingTargets(token: string, after?: string, signal?: AbortSignal) {
  const page = await request<PricingPage<PricingTarget>>(token, `/admin/v1/pricing/targets?limit=50${after ? `&after=${encodeURIComponent(after)}` : ''}`, 'GET', undefined, signal);
  return checkedPage(page, row => {
    if (!row || !row.organization_id || !row.workspace_id || typeof row.organization_name !== 'string' || !row.organization_name.trim() || typeof row.workspace_name !== 'string' || !row.workspace_name.trim()) throw new Error('Pricing targets could not be read.');
    return row;
  }, after);
}
export const pricingBase = (target: PricingTarget) => `/admin/v1/pricing/organizations/${encodeURIComponent(target.organization_id)}/workspaces/${encodeURIComponent(target.workspace_id)}/tariffs`;
/** Platform route inventory, independent of the administrator's customer workspace. */
export async function listPricingModels(token: string, signal?: AbortSignal): Promise<string[]> {
  const vendors = await request<{data: Vendor[]}>(token, '/admin/v1/vendors', 'GET', undefined, signal);
  if (!Array.isArray(vendors.data)) throw new Error('Pricing models could not be read.');
  const pages = await Promise.all(vendors.data.filter(vendor => vendor.enabled).map(vendor =>
    request<{data: VendorModel[]}>(token, `/admin/v1/vendors/${encodeURIComponent(vendor.id)}/models`, 'GET', undefined, signal)));
  const aliases = new Set<string>();
  for (const page of pages) {
    if (!Array.isArray(page.data)) throw new Error('Pricing models could not be read.');
    for (const model of page.data) {
      if (typeof model.alias !== 'string' || !model.capabilities || typeof model.enabled !== 'boolean') throw new Error('Pricing models could not be read.');
      if (model.enabled && !model.capabilities.video_schema && !model.capabilities.catalog?.output_modalities?.includes('video')) aliases.add(model.alias);
    }
  }
  return [...aliases].sort();
}
export async function listCustomerPrices(token: string, target: PricingTarget, after?: string, signal?: AbortSignal) {
  const page = await request<PricingPage<CurrentTariff>>(token, `${pricingBase(target)}?limit=50${after ? `&after=${encodeURIComponent(after)}` : ''}`, 'GET', undefined, signal);
  return checkedPage(page, checkedTariff, after);
}
export async function readPriceHistory(token: string, target: PricingTarget, model: string, before?: string, signal?: AbortSignal) {
  const page = await request<CustomerTariffHistory>(token, `${pricingBase(target)}/${encodeURIComponent(model)}/history?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`, 'GET', undefined, signal);
  if (!page || !Array.isArray(page.data) || typeof page.has_more !== 'boolean' ||
    !(page.current_revision === null || typeof page.current_revision === 'string' && !!page.current_revision.trim()) ||
    !(page.next_before === null || typeof page.next_before === 'string' && !!page.next_before) ||
    page.has_more !== (page.next_before !== null) || before !== undefined && page.next_before === before)
    throw new Error('Price revisions could not be read.');
  const revisions = new Set<string>();
  page.data.forEach(row => {
    checkedTariff(row);
    if (row.model_alias !== model || typeof row.is_current !== 'boolean' ||
      row.is_current !== (row.revision === page.current_revision) || revisions.has(row.revision))
      throw new Error('Price revisions could not be read.');
    revisions.add(row.revision);
  });
  if (!before && page.current_revision !== null && !page.data.some(row => row.is_current))
    throw new Error('The current price revision is missing. Refresh and try again.');
  return page;
}
export async function publishCustomerPrice(token: string, target: PricingTarget, input: CustomerTariffInput, signal?: AbortSignal) {
  if (!tokenRate(input.prompt_rate) || !tokenRate(input.completion_rate) || input.cached_prompt_rate != null && !tokenRate(input.cached_prompt_rate) || input.reasoning_completion_rate != null && !tokenRate(input.reasoning_completion_rate))
    throw new Error('Token prices cannot exceed 1,000,000 currency units per million tokens.');
  let result: {data:{revision:string}};
  try {
    result = await request<{ data: { revision: string } }>(token,
      `/admin/v1/organizations/${encodeURIComponent(target.organization_id)}/projects/${encodeURIComponent(target.workspace_id)}/billing/tariffs`, 'POST', input, signal);
  } catch (reason) {
    if (signal?.aborted || reason instanceof VendorRequestError && reason.status < 500) throw reason;
    throw new PublicationUnconfirmedError('Publication could not be confirmed. Load the current price before trying again.');
  }
  if (!result || typeof result.data?.revision !== 'string' || !result.data.revision.trim() || result.data.revision === input.expected_revision)
    throw new PublicationUnconfirmedError('Publication could not be confirmed. Load the current price before trying again.');
  return result;
}
