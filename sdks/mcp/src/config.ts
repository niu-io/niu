export const HOSTED_BASE_URL = "https://niu.io/v1";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TASK_ID_PATTERN = /^[!-~]{1,200}$/;

export function readHostedBaseURL(source: string): string {
  const file = JSON.parse(source) as { deployment?: unknown; baseURL?: unknown };
  if (file.deployment !== "niu.io" || file.baseURL !== HOSTED_BASE_URL) {
    throw new Error(`hosted/niu.io.json must pin ${HOSTED_BASE_URL}`);
  }
  return HOSTED_BASE_URL;
}

export type CredentialHeaderMode = "authorization" | "x-niu-api-key";

export type McpConfig = {
  apiKey: string;
  baseURL: string;
  deployment: "hosted" | "custom";
  keyId?: string;
  credentialHeader: CredentialHeaderMode;
  logPayloads?: boolean;
  taskId?: string;
};

export function resolveConfig(
  env: Record<string, string | undefined>,
  args: readonly string[],
  hostedBaseURL = HOSTED_BASE_URL,
): McpConfig {
  const hosted = args.includes("--hosted");
  if (args.some((arg) => arg !== "--hosted")) {
    throw new Error("niu-mcp accepts only --hosted");
  }
  const apiKey = env.NIU_API_KEY?.trim() ?? "";
  if (apiKey === "") throw new Error("NIU_API_KEY is required");

  const keyIdRaw = env.NIU_KEY_ID?.trim() ?? "";
  if (keyIdRaw !== "" && !UUID_PATTERN.test(keyIdRaw)) {
    throw new Error("NIU_KEY_ID must be a canonical UUID");
  }

  const credHeaderRaw = env.NIU_CREDENTIAL_HEADER?.trim().toLowerCase() ?? "";
  let credentialHeader: CredentialHeaderMode = "authorization";
  if (credHeaderRaw !== "") {
    if (credHeaderRaw !== "authorization" && credHeaderRaw !== "x-niu-api-key") {
      throw new Error("NIU_CREDENTIAL_HEADER must be authorization or x-niu-api-key");
    }
    credentialHeader = credHeaderRaw;
  }

  const logPayloadsRaw = env.NIU_LOG_PAYLOADS?.trim().toLowerCase() ?? "";
  let logPayloads: boolean | undefined;
  if (logPayloadsRaw !== "") {
    if (logPayloadsRaw !== "true" && logPayloadsRaw !== "false") {
      throw new Error("NIU_LOG_PAYLOADS must be true or false");
    }
    logPayloads = logPayloadsRaw === "true";
  }

  const taskIdRaw = env.NIU_TASK_ID?.trim() ?? "";
  if (taskIdRaw !== "" && !TASK_ID_PATTERN.test(taskIdRaw)) {
    throw new Error("NIU_TASK_ID must be 1 to 200 printable ASCII characters");
  }

  const extra = {
    credentialHeader,
    ...(keyIdRaw !== "" ? { keyId: keyIdRaw } : {}),
    ...(logPayloads !== undefined ? { logPayloads } : {}),
    ...(taskIdRaw !== "" ? { taskId: taskIdRaw } : {}),
  };

  const configured = env.NIU_BASE_URL?.trim() ?? "";
  if (hosted) {
    if (configured !== "" && normalizeBaseURL(configured) !== hostedBaseURL) {
      throw new Error(`--hosted uses ${hostedBaseURL}`);
    }
    return { apiKey, baseURL: hostedBaseURL, deployment: "hosted", ...extra };
  }
  if (configured === "") throw new Error("NIU_BASE_URL is required");
  return { apiKey, baseURL: normalizeBaseURL(configured), deployment: "custom", ...extra };
}

export function normalizeBaseURL(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NIU_BASE_URL must be an absolute http(s) URL ending in /v1");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("NIU_BASE_URL must not contain credentials");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("NIU_BASE_URL must use http or https");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error("NIU_BASE_URL must not contain a query or fragment");
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (!path.endsWith("/v1")) {
    throw new Error("NIU_BASE_URL must end in /v1");
  }
  url.pathname = path;
  return url.toString().replace(/\/$/, "");
}

export function gatewayOriginBase(baseURL: string): string {
  const normalized = baseURL.replace(/\/+$/, "");
  if (!normalized.endsWith("/v1")) {
    throw new Error("Gateway baseURL must end in /v1");
  }
  return normalized.slice(0, -3);
}
