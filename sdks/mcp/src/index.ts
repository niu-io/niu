import { readHostedBaseURL, resolveConfig } from "./config.js";
import type { GatewayFetch } from "./gateway.js";
import { dispatch } from "./rpc.js";

export {
  resolveConfig,
  normalizeBaseURL,
  gatewayOriginBase,
  HOSTED_BASE_URL,
  type McpConfig,
  type CredentialHeaderMode,
} from "./config.js";
export {
  GatewayError,
  type GatewayClient,
  type GatewayFetch,
  type GatewayResponse,
  type GatewayHeaders,
} from "./gateway.js";
export { dispatch } from "./rpc.js";
export { callTool, toolDefinitions, type ToolResult, type ToolContentItem } from "./tools.js";
export { readResource, resourceDefinitions, resourceTemplates } from "./resources.js";
export { getPrompt, promptDefinitions } from "./prompts.js";

export async function start(
  args: readonly string[],
  env: Record<string, string | undefined>,
  io: {
    hostedSource: string;
    resolveEnvironment?: () => Promise<Record<string, string | undefined>>;
    lines: AsyncIterable<string>;
    write(line: string): void;
    fetch: GatewayFetch;
    prepareSigningSecret?: (baseURL: string, credential: string, subscription: string) => Promise<(secret: string) => Promise<string>>;
    writeBinaryFile?: (path: string, bytes: Uint8Array) => Promise<string>;
  },
): Promise<void> {
  const config = resolveConfig(env, args, readHostedBaseURL(io.hostedSource));
  const client = {
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    keyId: config.keyId,
    credentialHeader: config.credentialHeader,
    logPayloads: config.logPayloads,
    taskId: config.taskId,
    fetch: io.fetch,
    writeBinaryFile: io.writeBinaryFile,
    prepareSigningSecret: io.prepareSigningSecret,
  };
  const maxConcurrency = 16;
  const inFlight = new Set<Promise<void>>();
  for await (const line of io.lines) {
    if (line.trim() === "") continue;
    while (inFlight.size >= maxConcurrency) {
      await Promise.race(inFlight);
    }
    const task = (async () => {
      let active = client;
      if (io.resolveEnvironment) {
        try {
          const latest = resolveConfig(await io.resolveEnvironment(), args, readHostedBaseURL(io.hostedSource));
          active = { ...client, baseURL: latest.baseURL, apiKey: latest.apiKey, keyId: latest.keyId, credentialHeader: latest.credentialHeader, logPayloads: latest.logPayloads, taskId: latest.taskId };
        } catch {
          // Keep protocol discovery available before login, but never dispatch
          // an upstream request with a placeholder or stale credential.
          active = { ...client, fetch: async () => { throw new Error("Niu login is required. Use niu-connect, then retry this operation."); } };
        }
      }
      return dispatch(active, line);
    })()
      .then((response) => {
        if (response !== null) io.write(response);
      })
      .finally(() => {
        inFlight.delete(task);
      });
    inFlight.add(task);
  }
  if (inFlight.size > 0) {
    await Promise.all(inFlight);
  }
}
