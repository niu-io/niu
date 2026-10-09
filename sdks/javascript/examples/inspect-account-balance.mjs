import { NiuAdminClient, NiuAPIError } from '../dist/index.js';

const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const amount = value => {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) throw new Error('Invalid exact amount');
  return BigInt(value);
};
const currency = value => {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) throw new Error('Invalid currency');
  return value;
};
const names = {funding:'Top-up',charge:'Request charge',refund:'Refund',funding_reversal:'Payment reversal',adjustment:'Balance adjustment'};
try {
  const client = new NiuAdminClient({adminToken:required('NIU_ADMIN_TOKEN'),baseURL:required('NIU_ADMIN_BASE_URL')});
  const organization = required('NIU_ORGANIZATION_ID');
  const allHistory = process.argv.slice(2).includes('--all');
  if (process.argv.slice(2).some(value => value !== '--all')) throw new Error('Unknown option');
  const [{data:accounts},firstPage] = await Promise.all([
    client.getCustomerBalance(organization),client.getCustomerBalanceTransactions(organization),
  ]);
  const entries = [...(firstPage.data ?? [])];
  if (!Array.isArray(accounts) || !Array.isArray(firstPage.data)) throw new Error('Invalid account response');
  const balances = accounts.map(account => {
    const balance = amount(account.balance_nanos), reserved = amount(account.reserved_nanos), credit = amount(account.credit_limit_nanos), available = amount(account.available_nanos);
    if (reserved < 0n || credit < 0n || available !== balance + credit - reserved || typeof account.low_balance !== 'boolean') throw new Error('Inconsistent account balance');
    return {currency:currency(account.currency),balance_nanos:balance.toString(),reserved_nanos:reserved.toString(),credit_limit_nanos:credit.toString(),available_nanos:available.toString(),lowBalance:account.low_balance,paidRequestsPaused:available <= 0n};
  });
  if (allHistory) {
    let cursor = firstPage.next_cursor;
    const seen = new Set();
    const seenEntries = new Set(entries.map(entry => entry.id));
    while (cursor !== null) {
      if (typeof cursor !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(cursor) || seen.has(cursor) || seen.size >= 10000) throw new Error('Invalid or excessive history continuation');
      seen.add(cursor);
      const page = await client.getCustomerBalanceTransactions(organization,{before:cursor});
      if (!Array.isArray(page.data) || page.data.length > 100) throw new Error('Invalid history page');
      for (const entry of page.data) {
        if (typeof entry.id !== 'string' || seenEntries.has(entry.id)) throw new Error('Duplicate history entry');
        seenEntries.add(entry.id); entries.push(entry);
      }
      cursor = page.next_cursor;
    }
  }
  const transactions = entries.map(entry => {
    if (!Object.hasOwn(names,entry.kind)) throw new Error('Invalid transaction kind');
    if (typeof entry.created_at !== 'string') throw new Error('Invalid transaction date');
    const date = new Date(entry.created_at);
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid transaction date');
    const value = amount(entry.amount_nanos);
    if (['charge','funding_reversal'].includes(entry.kind) && value >= 0n || ['funding','refund'].includes(entry.kind) && value <= 0n) throw new Error('Invalid transaction direction');
    return {type:names[entry.kind],currency:currency(entry.currency),amount_nanos:value.toString(),date:date.toISOString()};
  });
  // Account and history reads are a live traversal, not an atomic reconciliation snapshot.
  console.log(JSON.stringify({balances,transactionHistoryCoverage:allHistory ? 'all_pages_live_view' : 'latest_100',transactions},null,2));
} catch (error) {
  console.error(error instanceof NiuAPIError ? `Account billing request failed (HTTP ${error.status}).` : 'Could not inspect account billing. Check configuration and the account response.');
  process.exitCode = 1;
}
