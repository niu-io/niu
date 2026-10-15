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
    lines: AsyncIterable<string>;
    write(line: string): void;
    fetch: GatewayFetch;
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
  };
  for await (const line of io.lines) {
    if (line.trim() === "") continue;
    const response = await dispatch(client, line);
    if (response !== null) io.write(response);
  }
}
