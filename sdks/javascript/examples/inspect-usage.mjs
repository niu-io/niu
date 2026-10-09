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
const query = { limit: 100 };
if (process.env.NIU_MODEL_ALIAS) query.modelAlias = process.env.NIU_MODEL_ALIAS;
if (process.env.NIU_REQUEST_STATUS) query.status = process.env.NIU_REQUEST_STATUS;
let page = await admin.listGatewayActivity(scope, query);
const summary = page.summary;
let observed = 0;
const cursors = new Set();
for (;;) {
  observed += page.data.length;
  if (!page.next_cursor) break;
  if (cursors.has(page.next_cursor)) throw new Error('Gateway activity returned a repeated cursor');
  cursors.add(page.next_cursor);
  page = await admin.listGatewayActivity(scope, {...query,after:page.next_cursor});
}
console.log(JSON.stringify({
  requestsAtFirstPage: summary.request_count,
  requestsTraversed: observed,
  reportedUsageRequests: summary.usage_count,
  promptTokens: summary.prompt_tokens,
  outputTokens: summary.completion_tokens,
  customerCharges: summary.customer_charges,
  unpricedRequests: summary.unpriced_request_count,
  unresolvedCharges: summary.unresolved_customer_charge_count,
  deliveryStatuses: summary.delivery_statuses ?? null,
  gatewayLatency: summary.latency_percentiles ?? null,
  tokenCategories: summary.token_categories ?? null,
}, null, 2));
