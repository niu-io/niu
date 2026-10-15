import { gatewayOriginBase, type CredentialHeaderMode } from "./config.js";

export type GatewayHeaders = {
  get(name: string): string | null;
};

export type GatewayResponse = {
  ok: boolean;
  status: number;
  headers?: GatewayHeaders;
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
};

export type GatewayMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type GatewayFetch = (
  url: string,
  init: { method: GatewayMethod; headers: Record<string, string>; body?: string },
) => Promise<GatewayResponse>;

export type GatewayClient = {
  baseURL: string;
  apiKey: string;
  keyId?: string;
  credentialHeader?: CredentialHeaderMode;
  logPayloads?: boolean;
  taskId?: string;
  fetch: GatewayFetch;
  sleep?: (ms: number) => Promise<void>;
  writeBinaryFile?: (path: string, bytes: Uint8Array) => Promise<string>;
};

export type GatewayMeta = {
  attempt_id?: string;
  operation_id?: string;
  request_id?: string;
};

export type GatewayResult<T = unknown> = {
  data: T;
  meta: GatewayMeta;
};

export type GatewayBinaryResult = {
  bytes: Uint8Array;
  contentType: string | null;
  meta: GatewayMeta;
};

export type GatewayRequestOptions = {
  logPayloads?: boolean;
  taskId?: string;
  idempotencyKey?: string;
  basePrefix?: "v1" | "v1beta" | "catalog";
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TASK_ID_PATTERN = /^[!-~]{1,200}$/;
const VIDEO_IDEMPOTENCY_PATTERN = /^[\x21-\x7e]{1,128}$/;

export class GatewayError extends Error {
  readonly status: number;
  readonly gatewayCode?: string;
  readonly retryAfter?: string;
  readonly attemptId?: string;
  readonly operationId?: string;
  readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    details: {
      gatewayCode?: string;
      retryAfter?: string;
      attemptId?: string;
      operationId?: string;
      requestId?: string;
    } = {},
  ) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
    this.gatewayCode = details.gatewayCode;
    this.retryAfter = details.retryAfter;
    this.attemptId = details.attemptId;
    this.operationId = details.operationId;
    this.requestId = details.requestId;
  }

  formatForTool(): string {
    const tags: string[] = [];
    if (this.gatewayCode) tags.push(`code=${this.gatewayCode}`);
    if (this.retryAfter) tags.push(`retry_after=${this.retryAfter}`);
    if (this.attemptId) tags.push(`attempt_id=${this.attemptId}`);
    else if (this.operationId) tags.push(`operation_id=${this.operationId}`);
    if (tags.length === 0) return this.message;
    return `${this.message} (${tags.join(", ")})`;
  }
}

export function assertUuid(value: unknown, label = "UUID"): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`A canonical ${label} is required`);
  }
  return value;
}

export function assertModelName(value: unknown, field = "model"): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > 256 || /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error(`${field} is required`);
  }
  return value;
}

export async function inspectKey(client: GatewayClient): Promise<unknown> {
  const { data } = await requestJson(client, "GET", "/key");
  return data;
}

export async function listModels(client: GatewayClient): Promise<unknown> {
  const { data } = await requestJson(client, "GET", "/models");
  return data;
}

export async function listCatalogModels(client: GatewayClient): Promise<unknown> {
  const { data } = await requestJson(client, "GET", "/models", undefined, { basePrefix: "catalog" });
  return data;
}

export async function getPublicBranding(client: GatewayClient): Promise<unknown> {
  const { data } = await requestJson(client, "GET", "/branding");
  return data;
}

export async function getGeneration(client: GatewayClient, id: string): Promise<unknown> {
  const validId = assertUuid(id, "generation attempt UUID");
  const { data } = await requestJson(client, "GET", `/generations/${encodeURIComponent(validId)}`);
  return data;
}

export async function createChatCompletion(
  client: GatewayClient,
  body: Record<string, unknown>,
  options?: GatewayRequestOptions,
): Promise<GatewayResult> {
  return requestJson(client, "POST", "/chat/completions", body, options);
}

export async function createResponse(
  client: GatewayClient,
  body: Record<string, unknown>,
  options?: GatewayRequestOptions,
): Promise<GatewayResult> {
  return requestJson(client, "POST", "/responses", body, options);
}

export async function createMessage(
  client: GatewayClient,
  body: Record<string, unknown>,
  options?: GatewayRequestOptions,
): Promise<GatewayResult> {
  return requestJson(client, "POST", "/messages", body, options);
}

export async function generateContent(
  client: GatewayClient,
  model: string,
  body: Record<string, unknown>,
  options?: GatewayRequestOptions,
): Promise<GatewayResult> {
  const validModel = assertModelName(model);
  return requestJson(
    client,
    "POST",
    `/models/${encodeURIComponent(validModel)}:generateContent`,
    body,
    { ...options, basePrefix: "v1beta" },
  );
}

export async function createEmbeddings(
  client: GatewayClient,
  body: Record<string, unknown>,
  options?: GatewayRequestOptions,
): Promise<GatewayResult> {
  return requestJson(client, "POST", "/embeddings", body, options);
}

export async function listVideoModels(client: GatewayClient): Promise<unknown> {
  const { data } = await requestJson(client, "GET", "/video/models");
  return data;
}

export async function estimateVideo(
  client: GatewayClient,
  body: Record<string, unknown>,
): Promise<unknown> {
  const { data } = await requestJson(client, "POST", "/video/estimate", body);
  return data;
}

export async function createVideoJob(
  client: GatewayClient,
  body: Record<string, unknown>,
  options?: GatewayRequestOptions,
): Promise<GatewayResult> {
  if (options?.idempotencyKey !== undefined && !VIDEO_IDEMPOTENCY_PATTERN.test(options.idempotencyKey)) {
    throw new Error("idempotency_key for video creation must be 1 to 128 printable ASCII characters");
  }
  return requestJson(client, "POST", "/video/jobs", body, options);
}

export async function listVideoJobs(
  client: GatewayClient,
  query: { before?: string; limit?: number } = {},
): Promise<unknown> {
  const params = new URLSearchParams();
  if (query.before !== undefined) {
    params.set("before", assertUuid(query.before, "video history cursor UUID"));
  }
  if (query.limit !== undefined) {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) {
      throw new Error("limit must be an integer between 1 and 100");
    }
    params.set("limit", String(query.limit));
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const { data } = await requestJson(client, "GET", `/video/jobs${suffix}`);
  return data;
}

export async function getVideoJob(client: GatewayClient, id: string): Promise<unknown> {
  const validId = assertUuid(id, "video job UUID");
  const { data } = await requestJson(client, "GET", `/video/jobs/${encodeURIComponent(validId)}`);
  return data;
}

export async function refreshVideoJob(client: GatewayClient, id: string): Promise<unknown> {
  const validId = assertUuid(id, "video job UUID");
  const { data } = await requestJson(client, "POST", `/video/jobs/${encodeURIComponent(validId)}/refresh`, {});
  return data;
}

export async function waitForVideoJob(
  client: GatewayClient,
  id: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<unknown> {
  const validId = assertUuid(id, "video job UUID");
  const timeoutMs = options.timeoutMs ?? 600_000;
  const intervalMs = options.intervalMs ?? 5_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
    throw new Error("timeout_ms must be an integer between 1 and 2147483647");
  }
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 2_147_483_647) {
    throw new Error("interval_ms must be an integer between 1000 and 2147483647");
  }
  const sleep = client.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.now() + timeoutMs;

  let state = (await getVideoJob(client, validId)) as { status?: unknown };
  if (state?.status === "unknown") {
    if (Date.now() >= deadline) throw new Error("Video job wait deadline exceeded");
    state = (await refreshVideoJob(client, validId)) as { status?: unknown };
  }
  while (state?.status === "queued" || state?.status === "running") {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Video job wait deadline exceeded");
    await sleep(Math.min(intervalMs, remaining));
    if (Date.now() >= deadline) throw new Error("Video job wait deadline exceeded");
    state = (await refreshVideoJob(client, validId)) as { status?: unknown };
  }
  return state;
}

export async function getVideoJobBilling(client: GatewayClient, id: string): Promise<unknown> {
  const validId = assertUuid(id, "video job UUID");
  const { data } = await requestJson(client, "GET", `/video/jobs/${encodeURIComponent(validId)}/billing`);
  return data;
}

export async function getVideoJobTimings(client: GatewayClient, id: string): Promise<unknown> {
  const validId = assertUuid(id, "video job UUID");
  const { data } = await requestJson(client, "GET", `/video/jobs/${encodeURIComponent(validId)}/timings`);
  return data;
}

export async function getVideoJobObservations(
  client: GatewayClient,
  id: string,
  query: { before?: string; limit?: number } = {},
): Promise<unknown> {
  const validId = assertUuid(id, "video job UUID");
  const params = new URLSearchParams();
  if (query.before !== undefined) {
    params.set("before", assertUuid(query.before, "video observation cursor UUID"));
  }
  if (query.limit !== undefined) {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) {
      throw new Error("limit must be an integer between 1 and 100");
    }
    params.set("limit", String(query.limit));
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const { data } = await requestJson(
    client,
    "GET",
    `/video/jobs/${encodeURIComponent(validId)}/observations${suffix}`,
  );
  return data;
}

export async function getVideoJobResults(client: GatewayClient, id: string): Promise<unknown> {
  const validId = assertUuid(id, "video job UUID");
  const { data } = await requestJson(client, "GET", `/video/jobs/${encodeURIComponent(validId)}/results`);
  return data;
}

export async function retrieveVideoResult(
  client: GatewayClient,
  id: string,
  kind: "video" | "last_frame",
  refresh = false,
): Promise<GatewayBinaryResult> {
  const validId = assertUuid(id, "video job UUID");
  if (kind !== "video" && kind !== "last_frame") {
    throw new Error("kind must be video or last_frame");
  }
  const path = refresh
    ? `/video/jobs/${encodeURIComponent(validId)}/results/${kind}/refresh`
    : `/video/jobs/${encodeURIComponent(validId)}/results/${kind}`;
  return requestBinary(
    client,
    refresh ? "POST" : "GET",
    path,
    "video/mp4,video/webm,image/png,image/jpeg",
  );
}

export async function deleteVideoResults(client: GatewayClient, id: string): Promise<unknown> {
  const validId = assertUuid(id, "video job UUID");
  const { data } = await requestJson(client, "DELETE", `/video/jobs/${encodeURIComponent(validId)}/results`);
  return data;
}

export async function listMediaCapabilities(client: GatewayClient, model?: string): Promise<unknown> {
  let suffix = "";
  if (model !== undefined) {
    const valid = assertModelName(model);
    if (valid.trim() !== valid) throw new Error("An exact model alias without outer whitespace is required");
    suffix = `?${new URLSearchParams({ model: valid }).toString()}`;
  }
  const { data } = await requestJson(client, "GET", `/media/capabilities${suffix}`);
  return data;
}

export async function requestMediaEndpoint(
  client: GatewayClient,
  method: GatewayMethod,
  path: string,
  body?: unknown,
  options?: GatewayRequestOptions,
): Promise<unknown> {
  if (options?.idempotencyKey !== undefined) {
    assertUuid(options.idempotencyKey, "idempotency_key UUID");
    if (
      path.startsWith("/media/asset-operations/") &&
      options.idempotencyKey === "00000000-0000-0000-0000-000000000000"
    ) {
      throw new Error("A non-nil idempotency_key UUID is required for media asset operation preparation/dispatch");
    }
  }
  const { data } = await requestJson(client, method, path, body, options);
  return data;
}

export async function requestJson(
  client: GatewayClient,
  method: GatewayMethod,
  path: string,
  body?: unknown,
  options: GatewayRequestOptions = {},
): Promise<GatewayResult> {
  const url = resolveTargetUrl(client.baseURL, path, options.basePrefix ?? "v1");
  const headers = buildHeaders(client, "application/json", body !== undefined, options);
  const response = await client.fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const meta = extractMeta(response.headers);
  if (!response.ok) {
    throw toGatewayError(text, response.status, response.headers);
  }
  if (text === "") return { data: null, meta };
  try {
    return { data: JSON.parse(text) as unknown, meta };
  } catch {
    throw new GatewayError("Niu returned a response that was not JSON", response.status, {
      attemptId: meta.attempt_id,
      operationId: meta.operation_id,
      requestId: meta.request_id,
    });
  }
}

export async function requestBinary(
  client: GatewayClient,
  method: GatewayMethod,
  path: string,
  accept: string,
  options: GatewayRequestOptions = {},
): Promise<GatewayBinaryResult> {
  const url = resolveTargetUrl(client.baseURL, path, options.basePrefix ?? "v1");
  const headers = buildHeaders(client, accept, false, options);
  const response = await client.fetch(url, {
    method,
    headers,
  });
  const meta = extractMeta(response.headers);
  if (!response.ok) {
    const text = await response.text();
    throw toGatewayError(text, response.status, response.headers);
  }
  const contentType = response.headers?.get("content-type") ?? null;
  if (typeof response.arrayBuffer === "function") {
    const buffer = await response.arrayBuffer();
    return { bytes: new Uint8Array(buffer), contentType, meta };
  }
  const fallbackText = await response.text();
  return { bytes: new TextEncoder().encode(fallbackText), contentType, meta };
}

function resolveTargetUrl(
  baseURL: string,
  path: string,
  basePrefix: "v1" | "v1beta" | "catalog",
): string {
  if (basePrefix === "v1") return `${baseURL}${path}`;
  const origin = gatewayOriginBase(baseURL);
  if (basePrefix === "v1beta") return `${origin}/v1beta${path}`;
  return `${origin}/catalog/v1${path}`;
}

function buildHeaders(
  client: GatewayClient,
  accept: string,
  hasJsonBody: boolean,
  options: GatewayRequestOptions,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (client.credentialHeader === "x-niu-api-key") {
    headers["x-niu-api-key"] = client.apiKey;
  } else {
    headers.authorization = `Bearer ${client.apiKey}`;
  }
  headers.accept = accept;
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  if (client.keyId !== undefined) {
    headers["x-niu-key-id"] = client.keyId;
  }
  const logPayloads = options.logPayloads ?? client.logPayloads;
  if (logPayloads !== undefined) {
    headers["x-niu-log-payloads"] = String(logPayloads);
  }
  const taskId = options.taskId ?? client.taskId;
  if (taskId !== undefined) {
    if (!TASK_ID_PATTERN.test(taskId)) {
      throw new Error("task_id must be 1 to 200 printable ASCII characters");
    }
    headers["x-niu-task-id"] = taskId;
  }
  if (options.idempotencyKey !== undefined) {
    headers["idempotency-key"] = options.idempotencyKey;
  }
  return headers;
}

function extractMeta(headers?: GatewayHeaders): GatewayMeta {
  if (!headers || typeof headers.get !== "function") return {};
  const attemptId = headers.get("x-niu-attempt-id") ?? undefined;
  const operationId = headers.get("x-niu-operation-id") ?? undefined;
  const requestId = headers.get("x-request-id") ?? undefined;
  return {
    ...(attemptId ? { attempt_id: attemptId } : {}),
    ...(operationId ? { operation_id: operationId } : {}),
    ...(requestId ? { request_id: requestId } : {}),
  };
}

function toGatewayError(text: string, status: number, headers?: GatewayHeaders): GatewayError {
  const meta = extractMeta(headers);
  const gatewayCode = headers?.get?.("x-niu-error-code") ?? undefined;
  const retryAfter = headers?.get?.("retry-after") ?? undefined;
  return new GatewayError(errorMessage(text, status), status, {
    gatewayCode,
    retryAfter,
    attemptId: meta.attempt_id,
    operationId: meta.operation_id,
    requestId: meta.request_id,
  });
}

function errorMessage(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown }; message?: unknown };
    if (typeof parsed.error?.message === "string" && parsed.error.message.trim() !== "") {
      return parsed.error.message;
    }
    if (typeof parsed.message === "string" && parsed.message.trim() !== "") {
      return parsed.message;
    }
  } catch {
    // Fall through to the status. Do not return an unstructured upstream body.
  }
  return `Niu returned HTTP ${status}`;
}
