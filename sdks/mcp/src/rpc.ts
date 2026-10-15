import { callTool, toolDefinitions, type ToolResult } from "./tools.js";
import { readResource, resourceDefinitions, resourceTemplates } from "./resources.js";
import { getPrompt, promptDefinitions } from "./prompts.js";
import type { GatewayClient } from "./gateway.js";

const SUPPORTED_PROTOCOLS = ["2024-11-05", "2025-03-26", "2025-06-18"];

type RpcMessage = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

export async function dispatch(
  client: GatewayClient,
  line: string,
): Promise<string | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return respond(null, error(-32700, "Parse error"));
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return respond(null, error(-32600, "Invalid request"));
  }
  const message = parsed as RpcMessage;
  const validId = typeof message.id === "string" ||
    (typeof message.id === "number" && Number.isFinite(message.id));
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string" ||
      (message.id !== undefined && !validId)) {
    return respond(validId ? message.id : null, error(-32600, "Invalid request"));
  }
  if (message.id === undefined) return null;
  try {
    const result = await method(client, message.method, message.params);
    return respond(message.id, { result });
  } catch (failure) {
    if (failure instanceof RpcError) {
      return respond(message.id, error(failure.code, failure.message));
    }
    const text = failure instanceof Error ? failure.message : "MCP request failed";
    return respond(message.id, error(-32603, text));
  }
}

async function method(client: GatewayClient, name: string, params: unknown): Promise<unknown> {
  if (name === "initialize") return initialize(params);
  if (name === "ping") return {};
  if (name === "logging/setLevel") return {};
  if (name === "completion/complete") {
    return { completion: { values: [], total: 0, hasMore: false } };
  }
  if (name === "tools/list") return { tools: toolDefinitions };
  if (name === "tools/call") return toolCall(client, params);
  if (name === "resources/list") return { resources: resourceDefinitions };
  if (name === "resources/templates/list") return { resourceTemplates };
  if (name === "resources/read") return resourceRead(client, params);
  if (name === "prompts/list") return { prompts: promptDefinitions };
  if (name === "prompts/get") return promptGet(params);
  throw new RpcError(-32601, `Method not found: ${name}`);
}

function initialize(params: unknown): unknown {
  const requested =
    params !== null && typeof params === "object" && "protocolVersion" in params
      ? (params as { protocolVersion?: unknown }).protocolVersion
      : undefined;
  const protocolVersion =
    typeof requested === "string" && SUPPORTED_PROTOCOLS.includes(requested)
      ? requested
      : "2025-03-26";
  return {
    protocolVersion,
    capabilities: {
      tools: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
      prompts: { listChanged: false },
    },
    serverInfo: { name: "niu", version: "0.1.0" },
    instructions:
      "Use inspect_key, list_models, and list_catalog_models to inspect workspace permissions, model capabilities, and customer pricing. Call create_chat_completion, compare_models, create_response, create_message, generate_content, or create_embeddings with an explicit model id. Use get_generation with attempt_id to inspect token breakdowns, latency phases, and customer charges. Use list_video_models, estimate_video, create_video_job, wait_for_video_job, and download_video_result for video workflows. Each model call is a billed Niu request; the server never chooses or substitutes a model.",
  };
}

async function toolCall(client: GatewayClient, params: unknown): Promise<ToolResult> {
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throw new RpcError(-32602, "tools/call requires a name");
  }
  const name = (params as { name?: unknown }).name;
  const args = (params as { arguments?: unknown }).arguments;
  if (typeof name !== "string" || name === "") {
    throw new RpcError(-32602, "tools/call requires a name");
  }
  return callTool(client, name, args);
}

async function resourceRead(client: GatewayClient, params: unknown): Promise<unknown> {
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throw new RpcError(-32602, "resources/read requires a uri");
  }
  const uri = (params as { uri?: unknown }).uri;
  if (typeof uri !== "string" || uri.trim() === "") {
    throw new RpcError(-32602, "resources/read requires a uri");
  }
  return readResource(client, uri);
}

function promptGet(params: unknown): unknown {
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throw new RpcError(-32602, "prompts/get requires a name");
  }
  const name = (params as { name?: unknown }).name;
  const args = (params as { arguments?: unknown }).arguments;
  if (typeof name !== "string" || name.trim() === "") {
    throw new RpcError(-32602, "prompts/get requires a name");
  }
  try {
    return getPrompt(name, args);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid prompt arguments";
    throw new RpcError(-32602, message);
  }
}

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

function error(code: number, message: string): { error: { code: number; message: string } } {
  return { error: { code, message } };
}

function respond(
  id: unknown,
  payload: { result: unknown } | { error: { code: number; message: string } },
): string {
  return JSON.stringify({ jsonrpc: "2.0", id, ...payload });
}
