import { request } from '@/features/vendors/api';
import { retailCustomers, type RetailCustomer } from './api';
import type { RetailMediaEnrollment, RetailPriceRecord, RetailTextEnrollment } from '../../../../../sdks/javascript/src/admin';

export type EnrollmentTarget = { organization_id: string; organization_name: string; workspace_id: string; workspace_name: string };
export type EnrollmentDirectory = { customers: RetailCustomer[]; targets: EnrollmentTarget[]; accountCurrencies: Map<string, Set<string>> };
export type WorkspaceEnrollment = RetailTextEnrollment | RetailMediaEnrollment;
const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
export function safeEnrollmentName(value: string): boolean { return !!value?.trim() && !uuid.test(value); }
export function enrollmentError(failure: unknown): string {
  const message = failure instanceof Error ? failure.message : 'Enrollment is unavailable.';
  return message.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[reference]');
}

async function targets(token: string, signal: AbortSignal): Promise<EnrollmentTarget[]> {
  const rows = new Map<string, EnrollmentTarget>(), seen = new Set<string>(); let after: string | null = null;
  do {
    const page: { data: EnrollmentTarget[]; next_after: string | null } = await request(token, '/admin/v1/pricing/targets?limit=100' + (after ? '&after=' + encodeURIComponent(after) : ''), 'GET', undefined, signal);
    if (!Array.isArray(page.data) || (page.next_after !== null && (typeof page.next_after !== 'string' || !page.next_after || seen.has(page.next_after)))) throw new Error('Workspace pagination did not advance. Reload the directory.');
    for (const row of page.data) {
      if (!row.organization_id || !row.workspace_id || typeof row.organization_name !== 'string' || typeof row.workspace_name !== 'string') throw new Error('Workspace metadata is incomplete.');
      const previous = rows.get(row.workspace_id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(row)) throw new Error('Workspace metadata changed while loading. Reload the directory.');
      rows.set(row.workspace_id, row);
    }
    after = page.next_after; if (after) seen.add(after);
  } while (after);
  return [...rows.values()];
}
async function currencies(token: string, signal: AbortSignal): Promise<Map<string, Set<string>>> {
  const rows = new Map<string, Set<string>>(), seen = new Set<string>(); let after: string | null = null;
  do {
    const page: { data: { organization_id: string; accounts: { currency: string }[] }[]; next_after: string | null } = await request(token, '/admin/v1/platform/customer-accounts?limit=100' + (after ? '&after=' + encodeURIComponent(after) : ''), 'GET', undefined, signal);
    if (!Array.isArray(page.data) || (page.next_after !== null && (typeof page.next_after !== 'string' || !page.next_after || seen.has(page.next_after)))) throw new Error('Account pagination did not advance. Reload the directory.');
    for (const row of page.data) {
      if (!row.organization_id || !Array.isArray(row.accounts) || rows.has(row.organization_id)) throw new Error('Account metadata is incomplete or changed while loading.');
      const values = new Set<string>();
      for (const account of row.accounts) { if (!/^[A-Z]{3}$/.test(account.currency)) throw new Error('Account currency is unavailable.'); values.add(account.currency); }
      rows.set(row.organization_id, values);
    }
    after = page.next_after; if (after) seen.add(after);
  } while (after);
  return rows;
}
/** Platform directories contain names and account metadata; no own-company authority is assumed. */
export async function enrollmentDirectory(token: string, signal: AbortSignal): Promise<EnrollmentDirectory> {
  const [customers, workspaces, accountCurrencies] = await Promise.all([retailCustomers(token, signal), targets(token, signal), currencies(token, signal)]);
  return { customers, targets: workspaces, accountCurrencies };
}
export function enrollmentPath(target: EnrollmentTarget, price: RetailPriceRecord): string {
  return '/admin/v1/organizations/' + encodeURIComponent(target.organization_id) + '/projects/' + encodeURIComponent(target.workspace_id) + '/billing/' + (price.schedule.kind === 'text' ? 'retail-price-enrollment' : 'media-retail-price-enrollment');
}
export async function readWorkspaceEnrollment(token: string, target: EnrollmentTarget, price: RetailPriceRecord, signal: AbortSignal): Promise<WorkspaceEnrollment> {
  const schedule = price.schedule;
  const query = schedule.kind === 'text' ? new URLSearchParams({ model_alias: price.model_alias }) : new URLSearchParams({ model: schedule.dimensions.model, channel: schedule.dimensions.channel, resolution: schedule.dimensions.resolution, reference_video: String(schedule.dimensions.reference_video), meter: schedule.meter });
  const result = await request<{ data: WorkspaceEnrollment }>(token, enrollmentPath(target, price) + '?' + query, 'GET', undefined, signal);
  const value = result.data;
  if (!value || typeof value.version !== 'string' || !/^\d+$/.test(value.version) || BigInt(value.version) > 9223372036854775807n || (value.price_id !== null && typeof value.price_id !== 'string')) throw new Error('Saved enrollment could not be confirmed.');
  if (schedule.kind === 'text') {
    if (!('model_alias' in value) || value.model_alias !== price.model_alias) throw new Error('Saved model enrollment does not match this price.');
  } else {
    if (!('dimensions' in value) || value.meter !== schedule.meter || value.dimensions.model !== schedule.dimensions.model || value.dimensions.channel !== schedule.dimensions.channel || value.dimensions.resolution !== schedule.dimensions.resolution || value.dimensions.reference_video !== schedule.dimensions.reference_video) throw new Error('Saved media enrollment does not match these dimensions.');
  }
  if ((value.price_id === null ? value.pricing_source !== 'workspace' : value.pricing_source !== 'platform') || (value.price_id !== null && (!value.effective_price || value.effective_price.price_id !== value.price_id))) throw new Error('Saved pricing source could not be confirmed.');
  if (value.price_id === null && value.effective_price !== null) throw new Error('Legacy pricing selection could not be confirmed.');
  if (value.effective_price) {
    const effective = value.effective_price;
    if (!/^[A-Z]{3}$/.test(effective.currency) || !effective.schedule || effective.schedule.kind !== schedule.kind || !/^\d+$/.test(effective.selected_at)) throw new Error('Applicable customer price is incomplete.');
    if (effective.schedule.kind === 'text') {
      if (!Array.isArray(effective.schedule.context_tiers) || typeof effective.schedule.prompt_rate !== 'string' || typeof effective.schedule.completion_rate !== 'string') throw new Error('Applicable text pricing is incomplete.');
    } else if (!effective.schedule.dimensions || !effective.schedule.per_quantity || !effective.schedule.minimum_quantity || typeof effective.schedule.amount_units !== 'string' || typeof effective.schedule.meter !== 'string') throw new Error('Applicable media pricing is incomplete.');
  }
  return value;
}
