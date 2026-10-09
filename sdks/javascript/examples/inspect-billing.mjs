import { NiuAdminClient } from '../dist/index.js';

const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const admin = new NiuAdminClient({
  adminToken: required('NIU_ADMIN_TOKEN'),
  baseURL: required('NIU_ADMIN_BASE_URL'),
});
const scope = {
  organizationId: required('NIU_ORGANIZATION_ID'),
  // Compatibility API field: this identifies the Niu workspace.
  projectId: required('NIU_WORKSPACE_ID'),
};
const { data: billing } = await admin.getCustomerBilling(scope);
const invoices = [];
for (const invoice of billing.invoices) {
  const { data: lines } = await admin.getCustomerInvoiceLines(scope, invoice.id);
  const total = lines.reduce((sum, line) => {
    if (line.currency !== invoice.currency) throw new Error('Invoice currency mismatch');
    return sum + BigInt(line.amount_nanos);
  }, 0n);
  if (total !== BigInt(invoice.amount_nanos)) throw new Error('Invoice line amounts do not reconcile');
  invoices.push({
    from_ms: invoice.from_ms, to_ms: invoice.to_ms, currency: invoice.currency,
    amount_nanos: total.toString(), status: invoice.status,
    requests: lines.reduce((sum, line) => sum + BigInt(line.requests), 0n).toString(),
    reconciled: true,
  });
}
console.log(JSON.stringify({
  balances: billing.balances,
  unpricedRequests: billing.unpriced,
  unresolvedRequests: billing.unresolved,
  // The billing endpoint returns the latest 100 invoices, not all history.
  invoiceHistoryCoverage: 'latest_100',
  invoices,
}, null, 2));
