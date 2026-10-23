// Documentation metadata only. Authorization remains operation-specific.
// Ordered rules classify the existing API; they do not rename wire contracts.
const groups = [
  ['Model APIs', [
    ['Model discovery', 'Discover models and their published capabilities.', '^/(?:v1/models|catalog/v1/models|api/v1/models)$'],
    ['Chat completions', 'OpenAI-compatible Chat requests, including dashboard-key invocation.', '/chat/completions$'],
    ['Responses', 'Responses API requests.', '^/v1/responses$'],
    ['Messages and GenerateContent', 'Native protocol compatibility. Read each operation’s supported subset.', '^/(?:v1/messages|v1beta/)'],
    ['Embeddings', 'Embedding requests and supported response encodings.', '^/v1/embeddings$'],
    ['Video generation', 'Discover video models, estimate a request, submit a job, and retrieve its status and results.', '/video/(?:models|estimate|jobs)'],
  ]],
  ['Providers and routing', [
    ['Providers', 'Provider identities, model purchase offers, usage and settlements. Each operation documents its actual authority and current constraints.', '^/api/v1/(?:providers|provider-memberships)'],
    ['Provider API connections', 'Upstream endpoints, stored credentials, model mappings, discovery and connection diagnostics.', '^/api/v1/vendors(?!/[^/]+/asset-management)'],
    ['Model routing', 'Published routing snapshots and candidate pools.', '^/api/v1/(?:routing-registry|pools)'],
  ]],
  ['Authentication and access', [
    ['Authentication', 'Sign-in configuration, browser sessions, profile, password and appearance. Credential requirements differ by operation.', '^/api/v1/(?:auth/|session$)'],
    ['Users and sessions', 'User identities, roles, sessions and authentication events.', '^/api/v1/operators'],
    ['API keys', 'Workspace inference keys, key self-introspection, rotation, grants, access policies and limits.', '(?:^/v1/key$|/keys/requests/[^/]+$|/keys(?:/[^/]+)?(?:/(?:rotate|token-rate-limit|token-usage-window|spending-limit|ip-policy|request-rate-limit|concurrency-limit|capacity|guardrail)(?:/.*)?)?$)'],
  ]],
  ['Workspaces and content', [
    ['Companies and workspaces', 'Company and workspace discovery and lifecycle. Legacy project path segments refer to workspaces.', '^/api/v1/(?:workspaces(?:$|/[^/]+$|/by-route/[^/]+$)|setup/default-workspace|organizations(?:/[^/]+/projects(?:/[^/]+)?)?$)'],
    ['Chat sessions', 'Saved conversations, drafts, exports and archive state. Saving content does not invoke a model.', '/chats(?:/|$)'],
    ['Generation history', 'Durable generation sessions, saved tasks, artifacts and video request drafts.', '/(?:projects|workspaces)/[^/]+/(?:generations(?:/|$)|sessions(?:/|$)|tasks(?:/|$)|artifacts(?:/|$)|video/(?:draft|intents))'],
    ['Workspace assets', 'Saved workspace assets and their content.', '/(?:projects|workspaces)/[^/]+/assets(?:/|$)'],
    ['Media assets and verification', 'Upstream-specific asset groups, materials, operations and verification sessions. These are distinct from Provider onboarding.', '/(?:media/(?:asset|group|operation|verification|capabilities)|asset-group-intents|asset-management)'],
    ['Image ingestion', 'Image sources, inspection, ingestion and readiness reads.', '^/v1/media/(?:image-|sources/)'],
  ]],
  ['Usage and billing', [
    ['Request logs and usage', 'Generation lookups, request history, exports, diagnostics, timing and captured usage reconciliation.', '(?:^/v1/generations/|/(?:requests|metrics)(?:/|$))'],
    ['Guardrails', 'Policy configuration, previews, history, key bindings and recorded denials.', '/guardrail'],
    ['Financial reports', 'Financial summaries and Provider commercial positions. These are privileged reports, not customer account lifecycle APIs.', '^/api/v1/(?:financial-summary|commercial-position)$'],
    ['Customer balances', 'Company currency balances, limits, reservations, credit, adjustments and transaction history. Amounts are customer-facing, not Provider costs.', '(?:/platform/customer-accounts$|/billing/(?:accounts|balance|transactions|entries|reservations|charge-reconciliation|funding)|/spending-limit)'],
    ['Customer payments', 'Top-up methods, checkout history, payment callbacks and payment gateway integrations. Checkout creation is not confirmation of funding.', '(?:/billing/(?:topups|payment-methods)|^/payments/|^/api/v1/payments/readiness$|/platform/payments)'],
    ['Customer prices and statements', 'Customer selling prices, price enrollment, invoices and statements. Prices are independent of Provider purchase rates.', '(?:^/api/v1/pricing|/billing(?:/|$))'],
  ]],
  ['Service and compatibility', [
    ['Branding and settings', 'Public branding, theme configuration and runtime settings.', '^/(?:v1/(?:branding|currency)|api/v1/platform/(?:branding|configuration|currency))$'],
    ['Audit and recovery', 'Audit events and financial recovery controls.', '^/api/v1/platform/(?:audit-events|financial-recovery)$'],
    ['Service health', 'Process health, readiness and composed extension readiness.', '^/(?:healthz|readyz|enterprise/readyz)$'],
    ['Legacy account and cost APIs', 'Compatibility APIs for upstream account metadata and upstream accounting. These are not customer billing accounts or customer charges.', '/(?:accounts|budget|costs)(?:/|$)'],
  ]],
];
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

export function deriveOperationAuthority(path, method, operation) {
  const security = operation.security ?? [];
  const isMutation = !['get', 'head', 'options'].includes(method);
  if (security.length === 0 || (security.length === 1 && Object.keys(security[0]).length === 0)) {
    return {
      audience: /^\/(?:v1\/models|catalog\/v1\/models)$/.test(path) ? 'model' : 'public',
      principals: ['anonymous'],
      required_capability: 'public',
      scope: 'installation',
    };
  }
  if (/^\/(?:v1|v1beta)(?:\/|$)/.test(path)) {
    return {
      audience: 'model',
      principals: ['workspace_api_key', 'console_key_selection'],
      required_capability: path === '/v1/key' || path.startsWith('/v1/generations/') || !isMutation ? 'read' : 'inference',
      scope: 'workspace',
    };
  }
  if (/^\/api\/v1\/(?:providers|provider-memberships)/.test(path)) {
    return {
      audience: 'provider',
      principals: ['provider_member', 'platform_admin', 'installation_admin'],
      required_capability: isMutation ? 'provider_manage' : 'read',
      scope: 'provider',
    };
  }
  if (
    /^\/api\/v1\/(?:platform\/|vendors|routing-registry|pools|pricing|financial-summary|commercial-position|operators|setup\/)/.test(path) ||
    /\/billing\/(?:media-rates|funding\/settled|accounts\/[^/]+\/(?:policy|grants))/.test(path) ||
    /\/(?:tariffs|retail-price-enrollment|media-retail-price-enrollment|usage-reconciliation)/.test(path)
  ) {
    return {
      audience: 'platform',
      principals: ['platform_admin', 'installation_admin'],
      required_capability: isMutation ? 'platform_admin' : 'read',
      scope: 'platform',
    };
  }
  if (
    /^\/api\/v1\/(?:auth\/|session$)/.test(path) ||
    /\/(?:chats\/draft|video\/(?:draft|intents)|sessions(?:\/|$)|generations(?:\/|$)|codex-connections)/.test(path)
  ) {
    return {
      audience: 'console',
      principals: ['operator_session', 'installation_admin'],
      required_capability: isMutation ? 'write' : 'read',
      scope: path.includes('/workspaces/') || path.includes('/projects/') ? 'workspace' : 'organization',
    };
  }
  return {
    audience: 'customer-management',
    principals: ['operator_session', 'installation_admin'],
    required_capability: isMutation ? 'write' : 'read',
    scope: path.includes('/workspaces/') || path.includes('/projects/') ? 'workspace' : 'organization',
  };
}

export function addOpenApiNavigation(spec) {
  const definitions = groups.flatMap(([, tags]) => tags.map(([name, description, pattern]) => ({name, description, match:new RegExp(pattern)})));
  const used = new Set();
  for (const [path, item] of Object.entries(spec.paths)) for (const [method, operation] of Object.entries(item)) {
    if (!methods.has(method)) continue;
    const tag = definitions.find(tag => tag.match.test(path));
    if (!tag) throw new Error(`OpenAPI documentation group missing for ${method.toUpperCase()} ${path}`);
    operation.tags = [tag.name];
    operation['x-niu-authority'] = deriveOperationAuthority(path, method, operation);
    used.add(tag.name);
  }
  spec.tags = definitions.filter(tag => used.has(tag.name)).map(({name, description}) => ({name, description}));
  spec['x-tagGroups'] = groups.map(([name, tags]) => ({name, tags:tags.map(([name]) => name).filter(name => used.has(name))})).filter(group => group.tags.length);
  return spec;
}
