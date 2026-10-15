import {
  assertUuid,
  getGeneration,
  getPublicBranding,
  getVideoJob,
  getVideoJobBilling,
  getVideoJobResults,
  inspectKey,
  listCatalogModels,
  listMediaCapabilities,
  listModels,
  listVideoModels,
  type GatewayClient,
} from "./gateway.js";

export const resourceDefinitions = [
  {
    uri: "niu://key",
    name: "Workspace API Key & Limits",
    description:
      "Current workspace API key label, model grants, spending limits, rate/token/concurrency limits, 60-second usage window, and IP policy.",
    mimeType: "application/json",
  },
  {
    uri: "niu://models",
    name: "Workspace Models & Customer Pricing",
    description:
      "Models accessible to this workspace API key and their customer selling prices when published.",
    mimeType: "application/json",
  },
  {
    uri: "niu://catalog/models",
    name: "Public Model Catalog & Protocol Capabilities",
    description:
      "Public Niu model catalog with metadata and supported protocol flags (chat_completions, responses, messages, generate_content, embeddings, streaming).",
    mimeType: "application/json",
  },
  {
    uri: "niu://video/models",
    name: "Video Generation Models & Controls",
    description:
      "Configured video generation models, input rules, control schemas, and output billing meters.",
    mimeType: "application/json",
  },
  {
    uri: "niu://media/capabilities",
    name: "Native Media Provider Capabilities",
    description:
      "Authorized native Provider material and human verification capabilities for this workspace key.",
    mimeType: "application/json",
  },
  {
    uri: "niu://branding",
    name: "Public Deployment Branding",
    description: "Public deployment branding and default theme tokens.",
    mimeType: "application/json",
  },
] as const;

export const resourceTemplates = [
  {
    uriTemplate: "niu://generations/{id}",
    name: "Generation Telemetry & Customer Charge",
    description:
      "Token breakdown, latency phases, guardrail outcome, and customer charge for a generation attempt UUID.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "niu://video/jobs/{id}",
    name: "Video Job State, Billing & Result Availability",
    description:
      "Persisted video job state, customer billing, and result availability for a video job UUID.",
    mimeType: "application/json",
  },
] as const;

export async function readResource(
  client: GatewayClient,
  uri: string,
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  if (uri === "niu://key") {
    return jsonResource(uri, await inspectKey(client));
  }
  if (uri === "niu://models") {
    return jsonResource(uri, await listModels(client));
  }
  if (uri === "niu://catalog/models") {
    return jsonResource(uri, await listCatalogModels(client));
  }
  if (uri === "niu://video/models") {
    return jsonResource(uri, await listVideoModels(client));
  }
  if (uri === "niu://media/capabilities") {
    return jsonResource(uri, await listMediaCapabilities(client));
  }
  if (uri === "niu://branding") {
    return jsonResource(uri, await getPublicBranding(client));
  }
  if (uri.startsWith("niu://generations/")) {
    const id = assertUuid(uri.slice("niu://generations/".length), "generation attempt UUID");
    return jsonResource(uri, await getGeneration(client, id));
  }
  if (uri.startsWith("niu://video/jobs/")) {
    const id = assertUuid(uri.slice("niu://video/jobs/".length), "video job UUID");
    const [job, billing, results] = await Promise.all([
      getVideoJob(client, id),
      getVideoJobBilling(client, id),
      getVideoJobResults(client, id),
    ]);
    return jsonResource(uri, { job, billing, results });
  }
  throw new Error(`Unknown resource URI: ${uri}`);
}

function jsonResource(
  uri: string,
  payload: unknown,
): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(payload),
      },
    ],
  };
}
