// Documentation metadata only. Authorization remains operation-specific.
// Ordered rules classify the existing API; they do not rename wire contracts.
const groups = [
  ['Model APIs', [
    ['Workspace resource events', 'Delegated subscriptions, signed notifications, event reconciliation and delivery evidence.', '^/v1/(?:events|incidents)(?:/|$)'],
    ['Evaluations', 'Attributed task judgments, verified inputs, customer-charge evidence and matched comparisons.', '^/v1/evaluations(?:/|$)'],
    ['Workspace model routing', 'Customer-owned model policies and execution selections. Explicit delegated capabilities are required; these are separate from platform supply routing.', '^/v1/routing(?:/|$)'],
    ['Model discovery', 'Discover models and their published capabilities.', '^/(?:v1/models|catalog/v1/models|api/v1/models)$'],
    ['Chat completions', 'OpenAI-compatible Chat requests, including dashboard-key invocation.', '/chat/completions$'],
    ['Structured decisions', 'Explicit System 1 decisions validated against a closed caller schema. Separate from Chat generation and Auto path selection.', '^/v1/decisions$'],
    ['Responses', 'Responses API requests.', '^/v1/responses$'],
    ['Messages and GenerateContent', 'Native protocol compatibility. Read each operation’s supported subset.', '^/(?:v1/messages|v1beta/)'],
    ['Embeddings', 'Embedding requests and supported response encodings.', '^/v1/embeddings$'],
    ['Video generation', 'Discover video models, estimate a request, submit a job, and retrieve its status and results.', '/video/(?:models|estimate|jobs)'],
  ]],
  ['Providers and routing', [
    ['Connection incidents', 'Qualified upstream access failures and verified operational recovery.', '^/api/v1/incidents(?:/|$)'],
    ['Providers', 'Provider identities, model purchase offers, usage and settlements. Each operation documents its actual authority and current constraints.', '^/api/v1/(?:providers|provider-memberships)'],
    ['Provider API connections', 'Upstream endpoints, stored credentials, model mappings, discovery and connection diagnostics.', '^/api/v1/vendors(?!/[^/]+/asset-management)'],
    ['Model routing', 'Published routing snapshots and candidate pools.', '^/api/v1/(?:routing-registry|routing)'],
  ]],
  ['Authentication and access', [
    ['Member invitations', 'Purpose-bound one-time invitations to join an organization or workspace. Acceptance requires an existing signed-in account with the intended email; no reusable member credential is issued.', '^/api/v1/(?:invitations(?:/|$)|organizations/[^/]+/invitations$|session/invitations$)'],
    ['Registration review', 'Limited Preview account registration policy and platform administrator approval queue.', '^/api/v1/platform/registrations?(?:/|$)'],
    ['Authentication', 'Initial installation setup, sign-in configuration, Limited Preview registration submission, browser sessions, profile, password and appearance. Credential requirements differ by operation.', '^/api/v1/(?:auth/|session(?:/|$)|setup$)'],
    ['Users and sessions', 'User identities, roles, sessions and authentication events.', '^/api/v1/operators'],
    ['API keys', 'Workspace inference keys, key self-introspection, rotation, grants, access policies and limits.', '(?:^/v1/key$|/keys/requests/[^/]+$|/keys(?:/[^/]+)?(?:/(?:rotate|token-rate-limit|token-usage-window|spending-limit|units/limit|ip-policy|request-rate-limit|concurrency-limit|capacity|guardrail)(?:/.*)?)?$)'],
  ]],
  ['Workspaces and content', [
    ['Workspace incidents', 'Active incidents observed in the authorized workspace.', '^/api/v1/workspaces/[^/]+/incidents$'],
    ['Agent management review', 'Member review and management of workspace model routing, event subscriptions and evaluation evidence.', '^/api/v1/workspaces/[^/]+/(?:routing|events|evaluations)(?:/|$)'],
    ['Companies and workspaces', 'Company and workspace discovery and lifecycle. Legacy project path segments refer to workspaces.', '^/api/v1/(?:workspaces(?:$|/[^/]+$|/by-route/[^/]+$)|setup/default-workspace|organizations(?:/by-route/[^/]+|/[^/]+(?:/projects(?:/[^/]+)?)?)?$)'],
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
    ['Branded consumption units', 'Versioned unit definitions, purchase conversion rules, unit tariffs, and unit spending limits. Publication does not activate Credits billing.', '(?:^/api/v1/platform/units(?:/|$)|/billing/units(?:/|$)|/(?:workspaces|projects)/[^/]+/units/limit(?:/|$))'],
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
  if (/^\/v1\/evaluations(?:\/|$)/.test(path)) {
    return { audience: 'model', principals: ['workspace_api_key'], required_capability: method === 'put' || (method === 'post' && path.endsWith('/runs')) ? 'evaluations:write' : 'evaluations:read', scope: 'workspace' };
  }
  if (/^\/v1\/(?:events|incidents)(?:\/|$)/.test(path)) {
    return { audience: 'model', principals: ['workspace_api_key'], required_capability: ['put','post'].includes(method) ? 'events:write' : 'events:read', scope: 'workspace' };
  }
  if (/^\/v1\/routing(?:\/|$)/.test(path)) {
    return { audience: 'model', principals: ['workspace_api_key'], required_capability: method === 'put' ? 'pools:write' : 'pools:read', scope: 'workspace' };
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
  const lowerMethod = String(method || '').toLowerCase();
  if (
    /^\/api\/v1\/(?:platform\/|vendors|incidents|routing-registry|routing|pricing|financial-summary|commercial-position|operators|setup(?:\/|$))/.test(path) ||
    /\/billing\/(?:quotes|units\/(?:grants|refunds|charges\/[^/]+\/refunds|purchases\/[^/]+\/reversals|requests\/[^/]+\/reconciliations)|entries\/[^/]+\/reversal|media-rates|funding\/settled|accounts\/[^/]+\/(?:policy|grants))/.test(path) ||
    (lowerMethod === 'post' && /\/billing\/invoices(?:\/[^/]+\/payment)?$/.test(path)) ||
    /\/(?:projects|workspaces)\/[^/]+\/(?:accounts|budget|costs)(?:\/|$)/.test(path) ||
    /\/(?:tariffs|retail-price-enrollment|media-retail-price-enrollment|usage-reconciliation)/.test(path)
  ) {
    return {
      audience: 'platform',
      principals: ['platform_admin', 'installation_admin'],
      required_capability: isMutation ? 'platform_admin' : 'read',
      scope: 'platform',
    };
  }
  if (/^\/api\/v1\/(?:session\/invitations|invitations(?:\/|$)|organizations\/[^/]+\/invitations$)/.test(path)) {
    return {
      audience: 'console',
      principals: ['operator_session', 'installation_admin'],
      required_capability: isMutation ? 'write' : 'read',
      scope: 'organization',
    };
  }
  if (
    /^\/api\/v1\/(?:auth\/|session(?:\/|$))/.test(path) ||
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

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace']);

function collectOpenApiRefs(value, out) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectOpenApiRefs(item, out);
    return;
  }
  for (const [key, val] of Object.entries(value)) {
    if (key === '$ref' && typeof val === 'string') {
      const match = val.match(/^#\/components\/([^/]+)\/([^/]+)$/);
      if (match) out.push([match[1], match[2]]);
    } else {
      collectOpenApiRefs(val, out);
    }
  }
}

function collectSecurityRefSchemes(securityArray, out) {
  if (!Array.isArray(securityArray)) return;
  for (const requirement of securityArray) {
    if (requirement && typeof requirement === 'object') {
      for (const scheme of Object.keys(requirement)) {
        out.push(['securitySchemes', scheme]);
      }
    }
  }
}

export function pruneOpenApiDocument(document) {
  const reachable = new Map();
  const queue = [];
  const enqueue = ([category, name]) => {
    let set = reachable.get(category);
    if (!set) {
      set = new Set();
      reachable.set(category, set);
    }
    if (!set.has(name) && document.components?.[category]?.[name] !== undefined) {
      set.add(name);
      queue.push([category, name]);
    }
  };

  collectSecurityRefSchemes(document.security, { push: enqueue });
  const initialRefs = [];
  collectOpenApiRefs(document.paths, initialRefs);
  for (const pathItem of Object.values(document.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const key of Object.keys(pathItem)) {
      if (HTTP_METHODS.has(key) && pathItem[key]?.security) {
        collectSecurityRefSchemes(pathItem[key].security, { push: enqueue });
      }
    }
  }
  for (const ref of initialRefs) enqueue(ref);

  while (queue.length > 0) {
    const [category, name] = queue.shift();
    const nested = [];
    collectOpenApiRefs(document.components?.[category]?.[name], nested);
    for (const ref of nested) enqueue(ref);
  }

  const prunedComponents = {};
  for (const [category, entries] of Object.entries(document.components ?? {})) {
    const allowedSet = reachable.get(category);
    if (!allowedSet || allowedSet.size === 0) continue;
    const filtered = {};
    for (const [key, val] of Object.entries(entries)) {
      if (allowedSet.has(key)) filtered[key] = val;
    }
    if (Object.keys(filtered).length > 0) prunedComponents[category] = filtered;
  }

  const usedTags = new Set();
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const [key, op] of Object.entries(pathItem ?? {})) {
      if (HTTP_METHODS.has(key) && Array.isArray(op?.tags)) {
        for (const tag of op.tags) usedTags.add(tag);
      }
    }
  }

  const nextDoc = {
    ...document,
    components: prunedComponents,
  };
  if (Array.isArray(document.tags)) {
    nextDoc.tags = document.tags.filter(t => usedTags.has(t.name));
  }
  if (Array.isArray(document['x-tagGroups'])) {
    nextDoc['x-tagGroups'] = document['x-tagGroups']
      .map(group => ({ ...group, tags: group.tags.filter(t => usedTags.has(t)) }))
      .filter(group => group.tags.length > 0);
  }
  return nextDoc;
}

const PUBLIC_AUDIENCES = new Set(['public', 'model', 'console', 'customer-management']);

export function filterPublicHandlerOperations(document) {
  const filteredPaths = {};
  for (const [route, item] of Object.entries(document.paths ?? {})) {
    const filteredItem = {};
    for (const [key, value] of Object.entries(item ?? {})) {
      if (!HTTP_METHODS.has(key)) {
        filteredItem[key] = value;
      } else {
        const authority = deriveOperationAuthority(route, key, value);
        if (PUBLIC_AUDIENCES.has(authority.audience)) {
          filteredItem[key] = { ...value, 'x-niu-authority': authority };
        }
      }
    }
    if (Object.keys(filteredItem).some(k => HTTP_METHODS.has(k))) {
      filteredPaths[route] = filteredItem;
    }
  }
  return pruneOpenApiDocument({
    ...document,
    paths: filteredPaths,
  });
}
