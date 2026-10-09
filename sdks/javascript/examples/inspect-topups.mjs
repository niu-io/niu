import { NiuAdminClient, NiuAPIError } from '../dist/index.js';

const required = name => {
  const value = process.env[name];
  if (!value) throw new Error('Missing configuration');
  return value;
};
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
try {
  const all = process.argv.slice(2).includes('--all');
  if (process.argv.slice(2).some(value => value !== '--all')) throw new Error('Unknown option');
  const client = new NiuAdminClient({adminToken:required('NIU_ADMIN_TOKEN'),baseURL:required('NIU_ADMIN_BASE_URL')});
  const organization = required('NIU_ORGANIZATION_ID');
  const {data:availability} = await client.getCustomerPaymentMethods(organization);
  if (availability?.currency !== 'CNY' || typeof availability.available !== 'boolean'
    || !Array.isArray(availability.payment_methods)
    || availability.payment_methods.some(value => typeof value !== 'string' || !/^[A-Za-z0-9.-]{1,64}$/.test(value))
    || (availability.available ? availability.unavailable_reason !== null || availability.payment_methods.length === 0
      : !['integration_unavailable','currency_account_missing'].includes(availability.unavailable_reason) || availability.payment_methods.length !== 0)) throw new Error('Invalid availability');
  const history = [], entries = new Set(), cursors = new Set();
  let before;
  do {
    const page = await client.listCustomerTopups(organization, before ? {before} : undefined);
    if (!Array.isArray(page.data) || page.data.length > 100 || (page.next_cursor !== null && !uuid(page.next_cursor))) throw new Error('Invalid history');
    for (const entry of page.data) {
      if (!uuid(entry.id) || entries.has(entry.id) || typeof entry.currency !== 'string' || !/^[A-Z]{3}$/.test(entry.currency)
        || typeof entry.amount_nanos !== 'string' || !/^\d{1,19}$/.test(entry.amount_nanos)
        || BigInt(entry.amount_nanos) <= 0n || BigInt(entry.amount_nanos) > 9223372036854775807n
        || !['reconciliation_required','pending','paid','closed'].includes(entry.status)
        || typeof entry.created_at !== 'string' || !Number.isFinite(Date.parse(entry.created_at))) throw new Error('Invalid order');
      if (entry.checkout_url !== null) {
        if (entry.status !== 'pending' || typeof entry.checkout_url !== 'string') throw new Error('Invalid checkout');
        const url = new URL(entry.checkout_url);
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Invalid checkout');
      } else if (entry.status === 'pending') throw new Error('Missing checkout');
      entries.add(entry.id);
      history.push({date:new Date(entry.created_at).toISOString(),currency:entry.currency,amount_nanos:entry.amount_nanos,status:entry.status,checkout_available:entry.checkout_url !== null});
    }
    if (page.next_cursor !== null && (page.data.length === 0 || page.next_cursor !== page.data.at(-1)?.id)) throw new Error('Invalid continuation');
    before = page.next_cursor;
    if (before !== null && (cursors.has(before) || cursors.size >= 10000)) throw new Error('Invalid continuation');
    if (before !== null) cursors.add(before);
  } while (all && before !== null);
  // Saved status is a live view, not proof of external settlement or reconciliation.
  const checkout = {currency:availability.currency,available:availability.available,payment_methods:availability.payment_methods,unavailable_reason:availability.unavailable_reason};
  console.log(JSON.stringify({checkout,history_coverage:all ? 'all_pages_live_view' : 'latest_100',topups:history},null,2));
} catch (error) {
  console.error(error instanceof NiuAPIError ? `Top-up request failed (HTTP ${error.status}).` : 'Could not inspect top-ups. Check configuration and saved payment responses.');
  process.exitCode = 1;
}
