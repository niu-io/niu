import { requestJson, type GatewayClient } from "./gateway.js";

const slugSchema = { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 80 } as const;
const candidate = {
  type: "object", additionalProperties: false,
  required: ["alias", "priority", "weight", "enabled"],
  properties: { alias: { type: "string", minLength: 1, maxLength: 200 }, priority: { type: "integer", minimum: -1000, maximum: 1000 }, weight: { type: "integer", minimum: 1, maximum: 10000 }, enabled: { type: "boolean" } },
} as const;
const conditions = {
  type: "object", additionalProperties: false,
  properties: {
    protocol: { type: "string", enum: ["chat", "messages", "responses"] },
    ...Object.fromEntries(["streaming", "vision", "tools", "structured_output", "reasoning"].map(key => [key, { type: "boolean" }])),
    ...Object.fromEntries(["min_input_tokens", "max_input_tokens", "min_output_tokens", "max_output_tokens"].map(key => [key, { type: "integer", minimum: 0 }])),
  },
} as const;
const autoToken = { type: "string", pattern: "^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$", maxLength: 64 } as const;
const autoPath = {
  type: "object", additionalProperties: false,
  required: ["id", "response_type", "candidates"],
  properties: {
    id: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 64 },
    name: { type: "string", minLength: 1, maxLength: 120 },
    description: { type: "string", minLength: 1, maxLength: 280 },
    response_type: { type: "string", enum: ["text", "structured", "embedding"] },
    candidates: { type: "array", minItems: 1, maxItems: 64, items: { type: "string", minLength: 1, maxLength: 200 } },
    task: { type: "array", maxItems: 16, items: autoToken },
    stage: { type: "array", maxItems: 16, items: autoToken },
  },
} as const;
const autoDecider = {
  type: "object", additionalProperties: false,
  description: "Optional single-round semantic decider. The model must be a visible Chat model granted to the invoking key and have a comparable customer selling price in the declared currency and unit; otherwise no paid call is made and the configured failure action applies. max_calls is fixed at one. max_input_tokens bounds the constructed decision prompt by a character estimate, not exact tokenization. max_output_tokens bounds the decision completion. max_spend_nanos is a customer-charge ceiling verified from the current customer price before the call and from reported usage afterwards. A missing, foreign-currency or non-nanounit customer price leaves the bound unverifiable and prevents the call.",
  required: ["model", "currency", "timeout_ms", "max_calls", "max_input_tokens", "max_output_tokens", "max_spend_nanos", "min_confidence"],
  properties: {
    model: { type: "string", minLength: 1, maxLength: 200 },
    currency: { type: "string", pattern: "^[A-Z]{3}$" },
    timeout_ms: { type: "integer", minimum: 50, maximum: 5000 },
    max_calls: { type: "integer", minimum: 1, maximum: 1 },
    max_input_tokens: { type: "integer", minimum: 1, maximum: 4096 },
    max_output_tokens: { type: "integer", minimum: 1, maximum: 1024 },
    max_spend_nanos: { type: "integer", minimum: 1, maximum: 100000000 },
    min_confidence: { type: "number", minimum: 0, maximum: 1 },
    on_abstain: { type: "string", enum: ["fallback", "reject"] },
    on_failure: { type: "string", enum: ["fallback", "reject"] },
  },
} as const;
const strategy = {
  type: "object", additionalProperties: false,
  description: "Versioned selection strategy. Omitted legacy configurations use version 1 priority/weight. Version 1 supports priority/weight and customer price. Version 2 requires Auto with 2-8 declared response-compatible paths and an optional bounded decider. Auto evaluates caller routing context first and invokes the decider only when no context path matches. The decider may return only a declared, request-compatible path; unknown or incompatible decisions are failures, never silent substitutions. Missing or incomparable customer prices stay unknown and are never treated as free. Provider procurement rates never participate.",
  required: ["version", "mode"],
  properties: {
    version: { type: "integer", enum: [1, 2] },
    mode: { type: "string", enum: ["priority_weight", "customer_price", "auto"] },
    customer_price: {
      type: "object", additionalProperties: false,
      description: "Required exactly when version is 1 and mode is customer_price. Estimates an ordinary request in one explicit currency and unit. Estimates include the selected whole-request context tier, the request fee and the minimum charge; cached and reasoning discounts are never assumed. Ties use higher priority, then higher weight, then alias order.",
      required: ["currency", "unit", "input_tokens", "output_tokens"],
      properties: {
        currency: { type: "string", pattern: "^[A-Z]{3}$" },
        unit: { type: "string", enum: ["nanounits_per_million_tokens"] },
        input_tokens: { type: "integer", minimum: 1, maximum: 10000000 },
        output_tokens: { type: "integer", minimum: 0, maximum: 10000000 },
      },
    },
    auto: {
      type: "object", additionalProperties: false,
      description: "Required exactly when version is 2 and mode is auto. Paths reference top-level candidate aliases so Auto cannot expand the saved model inventory or the caller's grants. Caller context (task/stage) is evaluated before any decider call. The optional decider runs once, with the caller's key, grants and spending authority, under the declared timeout, token and customer-charge bounds. If the decider abstains, fails, times out, is cancelled or returns an unknown or response-incompatible path, the configured action either falls back to deterministic priority/weight or rejects the request before dispatch.",
      required: ["paths"],
      properties: {
        paths: { type: "array", minItems: 2, maxItems: 8, items: autoPath },
        decider: autoDecider,
      },
    },
  },
} as const;
const configuration = {
  type: "object", additionalProperties: false,
  required: ["slug", "name", "description", "enabled", "revision", "candidates"],
  properties: {
    slug: slugSchema, name: { type: "string", minLength: 1, maxLength: 200 }, description: { type: "string", maxLength: 4000 },
    enabled: { type: "boolean" }, revision: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 1 },
    candidates: { type: "array", minItems: 1, maxItems: 64, items: candidate },
    rules: { type: "array", maxItems: 32, items: { type: "object", additionalProperties: false, required: ["id", "name", "candidates"], properties: {
      id: { type: "string" }, name: { type: "string" }, enabled: { type: "boolean" }, conditions, candidates: { type: "array", minItems: 1, maxItems: 64, items: candidate },
    } } }, default_action: { type: "string", enum: ["candidates", "reject"] },
    strategy,
  },
} as const;
const previewContext = {
  type: "object", additionalProperties: false, required: ["protocol"],
  properties: {
    protocol: { type: "string", enum: ["chat", "responses", "messages", "embeddings", "generate_content"] },
    ...Object.fromEntries(["streaming", "vision", "tools", "structured_output", "reasoning", "embedding_dimensions", "embedding_base64"].map(key => [key, { type: "boolean" }])),
    estimated_input_tokens: { type: "integer", minimum: 0, maximum: 10000000 },
    requested_output_tokens: { type: "integer", minimum: 1, maximum: 10000000 },
    task: { ...autoToken, description: "Optional caller task context for Auto preview. It uses the same bounded normalization as x-niu-routing-context. Preview never invokes the decider." },
    stage: { ...autoToken, description: "Optional caller workflow-stage context for Auto preview." },
  },
} as const;
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", additionalProperties: false, properties, required });
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const poolToolDefinitions = [
  { name: "list_pools", description: "List customer-owned workspace model policies. Requires pools:read; paginate with next_after. Does not expose Provider supply pools.", inputSchema: object({ after: slugSchema }), annotations: read },
  { name: "get_pool", description: "Read a workspace model policy and its current revision. Requires pools:read. Invoke it as pool/<slug>; the calling key must permit the concrete selected model.", inputSchema: object({ slug: slugSchema }, ["slug"]), annotations: read },
  { name: "preview_pool", description: "Validate a proposed workspace policy without saving or dispatching inference. Requires pools:read. Optional context simulates the shared policy rule and declared-capability filters. A versioned customer-price strategy ranks eligible candidates by estimated customer selling price with explicit currency/unit/input/output assumptions, reports unknown or incomparable prices explicitly and falls back to priority/weight rather than treating an unknown price as free. Version 2 Auto evaluates optional task/stage context against response-compatible paths and reports whether runtime would select from context, require the bounded decider, fall back or reject; preview never calls the decider and reports zero calls. It does not establish live model access, valid full input, task quality or actual charges.", inputSchema: object({ configuration, context: previewContext }, ["configuration"]), annotations: read },
  { name: "set_pool", description: "Create or replace a workspace policy under pools:write. revision=0 creates; otherwise use the current revision. On conflict, read and reconcile rather than blindly replay. Changes affect subsequent pool calls; this tool performs no inference. Read back the saved revision and retain the prior configuration for rollback.", inputSchema: object({ configuration }, ["configuration"]), annotations: { ...read, readOnlyHint: false, destructiveHint: true, idempotentHint: false } },
  { name: "get_pool_history", description: "Read immutable workspace policy revisions. Requires pools:read; paginate using next_before. Restoring a prior policy requires set_pool with the current expected revision.", inputSchema: object({ slug: slugSchema, before: { type: "integer", minimum: 1 } }, ["slug"]), annotations: read },
  { name: "get_pool_selections", description: "Read the latest 100 pool selections and linked operation/attempt references. Requires pools:read. Auto selections include bounded decision outcome, path, fallback or failure reason, calls, tokens, latency and estimated customer decision charge; the decision is null for other strategies. response_status describes HTTP response, not terminal generation or task acceptance. Use get_generation for usage, terminal state and customer charges; incomplete references remain unknown.", inputSchema: object({ slug: slugSchema }, ["slug"]), annotations: read },
] as const;

export async function callPoolTool(client: GatewayClient, name: string, raw: unknown): Promise<unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${name} expects an object`);
  const input = raw as Record<string, unknown>;
  if (JSON.stringify(input).length > 65536) throw new Error("Pool arguments exceed 64 KiB");
  const allowed = name === "list_pools" ? ["after"] : name === "preview_pool" ? ["configuration", "context"] : name === "set_pool" ? ["configuration"] : name === "get_pool_history" ? ["slug", "before"] : ["slug"];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error("Unexpected pool argument");
  const slug = (value: unknown) => {
    if (typeof value !== "string" || value.length > 80 || ["index", "history", "preview", "audit", "new"].includes(value) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error("A readable pool slug is required");
    return value;
  };
  let path = "/routing";
  let method: "GET" | "POST" | "PUT" = "GET";
  let body: unknown;
  if (name === "set_pool" || name === "preview_pool") {
    const config = input.configuration;
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("A pool configuration is required");
    const value = config as Record<string, unknown>;
    slug(value.slug);
    if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) throw new Error("A nonnegative expected revision is required");
    path += name === "set_pool" ? `/${slug(value.slug)}` : "/preview";
    method = name === "set_pool" ? "PUT" : "POST";
    body = name === "preview_pool" ? { configuration: config, ...(input.context === undefined ? {} : { context: input.context }) } : config;
  } else if (name === "list_pools") {
    if (input.after !== undefined) path += `?after=${slug(input.after)}`;
  } else {
    path += `/${slug(input.slug)}`;
    if (name === "get_pool_history") {
      path += "/history";
      if (input.before !== undefined) {
        if (!Number.isSafeInteger(input.before) || Number(input.before) <= 0) throw new Error("A positive revision cursor is required");
        path += `?before=${input.before}`;
      }
    } else if (name === "get_pool_selections") path += "/selections";
    else if (name !== "get_pool") throw new Error("Unknown pool tool");
  }
  return (await requestJson(client, method, path, body)).data;
}
