import { requestJson, type GatewayClient } from "./gateway.js";
// Kept aligned with the handler schema by a contract parity test.
const configuration = {
  "type": "object",
  "properties": {
    "slug": {
      "type": "string",
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
      "maxLength": 80
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "endpoint": {
      "type": "string",
      "format": "uri",
      "maxLength": 2048,
      "description": "Public HTTPS URL, port 443 only, no username/password/query/fragment. Public-address validation and pinning apply at delivery."
    },
    "event_types": {
      "type": "array",
      "minItems": 1,
      "maxItems": 4,
      "items": {
        "type": "string",
        "enum": [
          "pool.changed",
          "evaluation.recorded",
          "incident.opened",
          "incident.resolved"
        ]
      },
      "uniqueItems": true
    },
    "enabled": {
      "type": "boolean"
    },
    "revision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740990
    }
  },
  "required": [
    "slug",
    "name",
    "endpoint",
    "event_types",
    "enabled",
    "revision"
  ],
  "additionalProperties": false
} as const;
const slugSchema = { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 80 };
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const eventToolDefinitions = [
  { name: "list_event_subscriptions", description: "List workspace subscriptions under events:read. Saved enabled configuration is not verified delivery. No signing secrets are returned.", inputSchema: object({}), annotations: read },
  { name: "get_event_subscription", description: "Read subscription configuration, processed event cursor and current original delegation. Requires events:read. Missing authorization requires an explicitly authorized update under a current grant; no signing secret is returned.", inputSchema: object({ slug: slugSchema }, ["slug"]), annotations: read },
  { name: "set_event_subscription", description: "Create/update an authorized workspace event destination under events:write. Provide configuration and optional rotate_secret. Revision zero creates; otherwise use the current revision. Public HTTPS only; destination changes require rotation. Creation/rotation saves its one-time secret to a private local credential file and returns only that path. Do not print or commit the file. Disabling stops future attempts; in-flight requests cannot be recalled. Read back configuration; never blindly replay an uncertain mutation.", inputSchema: object({ configuration, rotate_secret: { type: "boolean" } }, ["configuration"]), annotations: { ...read, readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } },
  { name: "get_workspace_incident", description: "Reconcile an incident event reference within the current workspace under events:read; no Provider identity, procurement data or other tenant information is returned.", inputSchema: object({ reference: { type: "string", pattern: "^incident-[0-9a-f]{32}$" } }, ["reference"]), annotations: read },
  { name: "list_workspace_events", description: "Read immutable workspace resource events using a decimal sequence cursor under events:read. Follow next_after; stable event identity supports deduplication. This read does not dispatch notifications. No pruning window is enabled.", inputSchema: object({ after: { type: "string", pattern: "^[0-9]+$" } }), annotations: read },
  { name: "get_event_subscription_history", description: "Read immutable subscription configuration revisions under events:read. Follow next_before. No signing secrets are included.", inputSchema: object({ slug: slugSchema, before: { type: "integer", minimum: 1 } }, ["slug"]), annotations: read },
  { name: "get_event_deliveries", description: "Read the latest 100 delivery states, attempts, HTTP outcomes and retry/lease timing under events:read. Expired sending leases are not active network evidence. A 2xx acknowledges receipt, not receiver processing, host wake or task success. Reconcile failures using sequence in list_workspace_events.", inputSchema: object({ slug: slugSchema }, ["slug"]), annotations: read },
  { name: "test_event_subscription", description: "Queue a signed subscription.test notification only to this subscription's authorized destination. Requires events:write, current revision, enabled configuration and current original delegation. No inference. This creates a distinct event each time; inspect deliveries for acknowledgement and do not blindly replay uncertain responses.", inputSchema: object({ slug: slugSchema, revision: { type: "integer", minimum: 1 } }, ["slug", "revision"]), annotations: { ...read, readOnlyHint: false, idempotentHint: false, openWorldHint: true } },
] as const;
const slug = (value: unknown): string => {
  if (typeof value !== "string" || value.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || ["index", "history", "preview", "audit", "new", "log", "deliveries", "test"].includes(value)) throw new Error("Use a readable subscription slug");
  return value;
};
export async function callEventTool(client: GatewayClient, name: string, raw: unknown): Promise<unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Event arguments must be an object");
  const input = raw as Record<string, unknown>;
  if (JSON.stringify(input).length > 65536) throw new Error("Event arguments exceed 64 KiB");
  const fields = name === "get_workspace_incident" ? ["reference"] : name === "list_event_subscriptions" ? [] : name === "set_event_subscription" ? ["configuration", "rotate_secret"] : name === "list_workspace_events" ? ["after"] : name === "get_event_subscription_history" ? ["slug", "before"] : name === "test_event_subscription" ? ["slug", "revision"] : ["slug"];
  if (Object.keys(input).some(key => !fields.includes(key))) throw new Error("Unexpected event argument");
  if (name === "set_event_subscription") {
    if (!input.configuration || typeof input.configuration !== "object" || Array.isArray(input.configuration)) throw new Error("A subscription configuration is required");
    const config = input.configuration as Record<string, unknown>;
    const reference = slug(config.slug);
    if (!Number.isSafeInteger(config.revision) || Number(config.revision) < 0 || (input.rotate_secret !== undefined && typeof input.rotate_secret !== "boolean")) throw new Error("Use a nonnegative expected revision and optional rotate_secret boolean");
    const issue = config.revision === 0 || input.rotate_secret === true;
    // Prepare private storage before a secret-issuing remote mutation. A host
    // without secure persistence must not create a secret it cannot retain.
    const save = issue ? await client.prepareSigningSecret?.(client.baseURL, client.apiKey, reference) : undefined;
    if (issue && !save) throw new Error("This host cannot securely store signing credentials; configure private signing-secret persistence first");
    const result = (await requestJson(client, "PUT", `/events/${reference}`, { configuration: config, rotate_secret: input.rotate_secret === true })).data;
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid subscription response; inspect state before retrying");
    const { signing_secret, ...publicResult } = result as Record<string, unknown>;
    if (issue) {
      if (typeof signing_secret !== "string" || !/^niu_whsec_[A-Za-z0-9_-]{43}$/.test(signing_secret)) throw new Error("Subscription mutation returned no valid signing credential; inspect saved revision and explicitly rotate after recovery");
      try { return { ...publicResult, signing_secret_file: await save!(signing_secret) }; }
      catch { throw new Error("Subscription mutation completed but private secret persistence failed. Inspect the saved revision, repair local storage, then explicitly rotate. The secret is not recoverable from reads; do not blindly replay."); }
    }
    return publicResult;
  }
  let path = "/events";
  let body: unknown;
  if (name === "get_workspace_incident") {
    if (typeof input.reference !== "string" || !/^incident-[0-9a-f]{32}$/.test(input.reference)) throw new Error("Use the workspace incident event reference");
    path = `/incidents/${input.reference}`;
  } else if (name === "list_workspace_events") {
    const after = input.after ?? "0";
    if (typeof after !== "string" || !/^[0-9]+$/.test(after) || after.length > 19 || BigInt(after) > 9223372036854775807n) throw new Error("Use the returned decimal event cursor");
    path += `/log?after=${after}`;
  } else if (name !== "list_event_subscriptions") {
    path += `/${slug(input.slug)}`;
    if (name === "get_event_subscription_history") {
      path += "/history";
      if (input.before !== undefined) {
        if (!Number.isSafeInteger(input.before) || Number(input.before) < 1) throw new Error("Use a positive revision cursor");
        path += `?before=${input.before}`;
      }
    } else if (name === "get_event_deliveries") path += "/deliveries";
    else if (name === "test_event_subscription") {
      if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 1) throw new Error("Use the current subscription revision");
      path += "/test"; body = { revision: input.revision };
    } else if (name !== "get_event_subscription") throw new Error("Unknown event tool");
  }
  return (await requestJson(client, body === undefined ? "GET" : "POST", path, body)).data;
}
