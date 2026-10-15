import {
  assertModelName,
  assertUuid,
  createChatCompletion,
  createEmbeddings,
  createMessage,
  createResponse,
  createVideoJob,
  deleteVideoResults,
  estimateVideo,
  GatewayError,
  generateContent,
  getGeneration,
  getVideoJob,
  getVideoJobBilling,
  getVideoJobObservations,
  getVideoJobResults,
  getVideoJobTimings,
  inspectKey,
  listCatalogModels,
  listMediaCapabilities,
  listModels,
  listVideoJobs,
  listVideoModels,
  refreshVideoJob,
  requestMediaEndpoint,
  retrieveVideoResult,
  waitForVideoJob,
  type GatewayClient,
  type GatewayMeta,
  type GatewayRequestOptions,
} from "./gateway.js";

export type ToolContentItem =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export type ToolResult = { content: ToolContentItem[]; isError?: boolean };

const MAX_ARGUMENTS = 1_000_000;
const MAX_INLINE_IMAGE_ARGUMENTS = 13_000_000;

export async function callTool(
  client: GatewayClient,
  name: string,
  raw: unknown,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "inspect_key": {
        rejectUnknownKeys(raw, [], "inspect_key");
        return text(JSON.stringify(await inspectKey(client)));
      }
      case "list_models": {
        const filter = parseListModelsArgs(raw);
        const result = await listModels(client);
        return text(JSON.stringify(filterModelsResult(result, filter)));
      }
      case "list_catalog_models": {
        const filter = parseListCatalogModelsArgs(raw);
        const result = await listCatalogModels(client);
        return text(JSON.stringify(filterCatalogModelsResult(result, filter)));
      }
      case "get_generation": {
        const input = parseObjectArgs(raw, ["id"], "get_generation");
        const id = assertUuid(input.id, "generation attempt UUID");
        return text(JSON.stringify(await getGeneration(client, id)));
      }
      case "create_chat_completion": {
        const { body, options } = parseChatArgs(raw, "create_chat_completion");
        const { data, meta } = await createChatCompletion(client, body, options);
        return text(JSON.stringify(publicChat(data, meta)));
      }
      case "compare_models": {
        return text(JSON.stringify(await runCompareModels(client, raw)));
      }
      case "create_response": {
        const { body, options } = parseResponsesArgs(raw);
        const { data, meta } = await createResponse(client, body, options);
        return text(JSON.stringify(publicResponse(data, meta)));
      }
      case "create_message": {
        const { body, options } = parseMessagesArgs(raw);
        const { data, meta } = await createMessage(client, body, options);
        return text(JSON.stringify(attachMeta(data, meta)));
      }
      case "generate_content": {
        const { model, body, options } = parseGenerateContentArgs(raw);
        const { data, meta } = await generateContent(client, model, body, options);
        return text(JSON.stringify(attachMeta(data, meta)));
      }
      case "create_embeddings": {
        const { body, options } = parseEmbeddingsArgs(raw);
        const { data, meta } = await createEmbeddings(client, body, options);
        return text(JSON.stringify(attachMeta(data, meta)));
      }
      case "list_video_models": {
        rejectUnknownKeys(raw, [], "list_video_models");
        return text(JSON.stringify(await listVideoModels(client)));
      }
      case "estimate_video": {
        const { body } = parseVideoGenerationArgs(raw, "estimate_video", false);
        return text(JSON.stringify(await estimateVideo(client, body)));
      }
      case "create_video_job": {
        const { body, options, wait, timeoutMs, intervalMs } = parseVideoGenerationArgs(
          raw,
          "create_video_job",
          true,
        );
        const { data, meta } = await createVideoJob(client, body, options);
        if (
          wait &&
          data !== null &&
          typeof data === "object" &&
          typeof (data as { id?: unknown }).id === "string"
        ) {
          const waited = await waitForVideoJob(client, (data as { id: string }).id, {
            timeoutMs,
            intervalMs,
          });
          return text(JSON.stringify(attachMeta(waited, meta)));
        }
        return text(JSON.stringify(attachMeta(data, meta)));
      }
      case "list_video_jobs": {
        const input = parseObjectArgs(raw, ["before", "limit"], "list_video_jobs");
        return text(
          JSON.stringify(
            await listVideoJobs(client, {
              before: input.before === undefined ? undefined : String(input.before),
              limit: input.limit === undefined ? undefined : Number(input.limit),
            }),
          ),
        );
      }
      case "get_video_job": {
        const input = parseObjectArgs(
          raw,
          ["id", "refresh", "include_billing", "include_timings", "include_results"],
          "get_video_job",
        );
        const id = assertUuid(input.id, "video job UUID");
        const refresh = optionalBoolean(input.refresh, "refresh") ?? false;
        const includeBilling = optionalBoolean(input.include_billing, "include_billing") ?? false;
        const includeTimings = optionalBoolean(input.include_timings, "include_timings") ?? false;
        const includeResults = optionalBoolean(input.include_results, "include_results") ?? false;
        const job = refresh ? await refreshVideoJob(client, id) : await getVideoJob(client, id);
        if (!includeBilling && !includeTimings && !includeResults) {
          return text(JSON.stringify(job));
        }
        const [billing, timings, results] = await Promise.all([
          includeBilling ? getVideoJobBilling(client, id) : Promise.resolve(undefined),
          includeTimings ? getVideoJobTimings(client, id) : Promise.resolve(undefined),
          includeResults ? getVideoJobResults(client, id) : Promise.resolve(undefined),
        ]);
        return text(
          JSON.stringify({
            job,
            ...(includeBilling ? { billing } : {}),
            ...(includeTimings ? { timings } : {}),
            ...(includeResults ? { results } : {}),
          }),
        );
      }
      case "refresh_video_job": {
        const input = parseObjectArgs(raw, ["id"], "refresh_video_job");
        const id = assertUuid(input.id, "video job UUID");
        return text(JSON.stringify(await refreshVideoJob(client, id)));
      }
      case "wait_for_video_job": {
        const input = parseObjectArgs(
          raw,
          ["id", "timeout_ms", "interval_ms"],
          "wait_for_video_job",
        );
        const id = assertUuid(input.id, "video job UUID");
        const timeoutMs =
          input.timeout_ms === undefined ? undefined : Number(input.timeout_ms);
        const intervalMs =
          input.interval_ms === undefined ? undefined : Number(input.interval_ms);
        return text(
          JSON.stringify(await waitForVideoJob(client, id, { timeoutMs, intervalMs })),
        );
      }
      case "get_video_job_billing": {
        const input = parseObjectArgs(raw, ["id"], "get_video_job_billing");
        const id = assertUuid(input.id, "video job UUID");
        return text(JSON.stringify(await getVideoJobBilling(client, id)));
      }
      case "get_video_job_diagnostics": {
        const input = parseObjectArgs(
          raw,
          ["id", "include_timings", "include_observations", "before", "limit"],
          "get_video_job_diagnostics",
        );
        const id = assertUuid(input.id, "video job UUID");
        const includeTimings = optionalBoolean(input.include_timings, "include_timings") ?? true;
        const includeObservations =
          optionalBoolean(input.include_observations, "include_observations") ?? true;
        const [timings, observations] = await Promise.all([
          includeTimings ? getVideoJobTimings(client, id) : Promise.resolve(undefined),
          includeObservations
            ? getVideoJobObservations(client, id, {
                before: input.before === undefined ? undefined : String(input.before),
                limit: input.limit === undefined ? undefined : Number(input.limit),
              })
            : Promise.resolve(undefined),
        ]);
        return text(
          JSON.stringify({
            id,
            ...(includeTimings ? { timings } : {}),
            ...(includeObservations ? { observations } : {}),
          }),
        );
      }
      case "get_video_job_results": {
        const input = parseObjectArgs(raw, ["id"], "get_video_job_results");
        const id = assertUuid(input.id, "video job UUID");
        return text(JSON.stringify(await getVideoJobResults(client, id)));
      }
      case "download_video_result": {
        return await handleDownloadVideoResult(client, raw);
      }
      case "delete_video_results": {
        const input = parseObjectArgs(raw, ["id"], "delete_video_results");
        const id = assertUuid(input.id, "video job UUID");
        return text(JSON.stringify(await deleteVideoResults(client, id)));
      }
      case "list_media_capabilities": {
        const input = parseObjectArgs(raw, ["model"], "list_media_capabilities");
        const model =
          input.model === undefined ? undefined : assertModelName(input.model, "model");
        return text(JSON.stringify(await listMediaCapabilities(client, model)));
      }
      case "media_asset_groups": {
        return text(JSON.stringify(await handleMediaAssetGroups(client, raw)));
      }
      case "media_assets": {
        return text(JSON.stringify(await handleMediaAssets(client, raw)));
      }
      case "media_asset_operations": {
        return text(JSON.stringify(await handleMediaAssetOperations(client, raw)));
      }
      case "media_verification_sessions": {
        return text(JSON.stringify(await handleMediaVerificationSessions(client, raw)));
      }
      case "media_image_ingestions": {
        return text(JSON.stringify(await handleMediaImageIngestions(client, raw)));
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof GatewayError) {
      return { content: [{ type: "text", text: error.formatForTool() }], isError: true };
    }
    const message = error instanceof Error ? error.message : "Niu request failed";
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

function text(value: string): ToolResult {
  return { content: [{ type: "text", text: value }] };
}

function attachMeta(value: unknown, meta: GatewayMeta): unknown {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (!meta.attempt_id && !meta.operation_id && !meta.request_id)
  ) {
    return value;
  }
  return {
    ...(value as Record<string, unknown>),
    ...(meta.attempt_id ? { attempt_id: meta.attempt_id } : {}),
    ...(meta.operation_id ? { operation_id: meta.operation_id } : {}),
    ...(meta.request_id ? { request_id: meta.request_id } : {}),
  };
}

function enforceMaxArguments(raw: unknown, toolName: string, limit = MAX_ARGUMENTS): void {
  if (JSON.stringify(raw ?? {}).length > limit) {
    throw new Error(`${toolName} arguments exceed size limit`);
  }
}

function rejectUnknownKeys(
  raw: unknown,
  allowedKeys: readonly string[],
  toolName: string,
): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    if (allowedKeys.length === 0) {
      throw new Error(`${toolName} does not accept arguments`);
    }
    throw new Error(`${toolName} requires an object argument`);
  }
  const input = raw as Record<string, unknown>;
  if (allowedKeys.length === 0 && Object.keys(input).length > 0) {
    throw new Error(`${toolName} does not accept arguments`);
  }
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new Error(`${toolName} does not accept ${key}`);
    }
  }
  return input;
}

function parseObjectArgs(
  raw: unknown,
  allowedKeys: readonly string[],
  toolName: string,
  limit = MAX_ARGUMENTS,
): Record<string, unknown> {
  enforceMaxArguments(raw, toolName, limit);
  return rejectUnknownKeys(raw, allowedKeys, toolName);
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function parseListModelsArgs(raw: unknown): { search?: string; pricedOnly?: boolean } {
  const input = parseObjectArgs(raw, ["search", "priced_only"], "list_models");
  const search = optionalString(input.search, "search")?.toLowerCase();
  const pricedOnly = optionalBoolean(input.priced_only, "priced_only");
  return { search, pricedOnly };
}

function filterModelsResult(
  result: unknown,
  filter: { search?: string; pricedOnly?: boolean },
): unknown {
  if (!filter.search && !filter.pricedOnly) return result;
  if (result === null || typeof result !== "object" || Array.isArray(result)) return result;
  const record = result as { object?: unknown; data?: unknown };
  if (!Array.isArray(record.data)) return result;
  const filtered = record.data.filter((item) => {
    if (item === null || typeof item !== "object") return false;
    const model = item as { id?: unknown; customer_pricing?: unknown };
    if (filter.search) {
      const id = typeof model.id === "string" ? model.id.toLowerCase() : "";
      if (!id.includes(filter.search)) return false;
    }
    if (filter.pricedOnly && (model.customer_pricing === null || model.customer_pricing === undefined)) {
      return false;
    }
    return true;
  });
  return { ...record, data: filtered };
}

function parseListCatalogModelsArgs(raw: unknown): { search?: string; capability?: string } {
  const input = parseObjectArgs(raw, ["search", "capability"], "list_catalog_models");
  const search = optionalString(input.search, "search")?.toLowerCase();
  const capability = optionalString(input.capability, "capability");
  if (
    capability !== undefined &&
    ![
      "chat_completions",
      "streaming",
      "embeddings",
      "messages",
      "messages_streaming",
      "generate_content",
      "responses",
    ].includes(capability)
  ) {
    throw new Error(
      "capability must be one of chat_completions, streaming, embeddings, messages, messages_streaming, generate_content, responses",
    );
  }
  return { search, capability };
}

function filterCatalogModelsResult(
  result: unknown,
  filter: { search?: string; capability?: string },
): unknown {
  if (!filter.search && !filter.capability) return result;
  if (result === null || typeof result !== "object" || Array.isArray(result)) return result;
  const record = result as { object?: unknown; data?: unknown };
  if (!Array.isArray(record.data)) return result;
  const filtered = record.data.filter((item) => {
    if (item === null || typeof item !== "object") return false;
    const model = item as {
      id?: unknown;
      catalog?: unknown;
      capabilities?: Record<string, unknown>;
    };
    if (filter.search) {
      const haystack = JSON.stringify({ id: model.id, catalog: model.catalog }).toLowerCase();
      if (!haystack.includes(filter.search)) return false;
    }
    if (filter.capability) {
      if (model.capabilities?.[filter.capability] !== true) return false;
    }
    return true;
  });
  return { ...record, data: filtered };
}

const CHAT_BODY_KEYS = [
  "model",
  "messages",
  "temperature",
  "top_p",
  "max_tokens",
  "max_completion_tokens",
  "stop",
  "presence_penalty",
  "frequency_penalty",
  "seed",
  "user",
  "response_format",
  "reasoning",
  "reasoning_effort",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
] as const;

const CHAT_OPTION_KEYS = ["log_payloads", "task_id"] as const;

function parseChatArgs(
  raw: unknown,
  toolName: string,
): { body: Record<string, unknown>; options: GatewayRequestOptions } {
  enforceMaxArguments(raw, toolName);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${toolName} requires model and messages`);
  }
  const input = rejectUnknownKeys(
    raw,
    [...CHAT_BODY_KEYS, ...CHAT_OPTION_KEYS],
    toolName,
  );
  const model = assertModelName(input.model, "model");
  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    throw new Error("messages are required");
  }
  const body: Record<string, unknown> = { model, messages: input.messages };
  for (const key of CHAT_BODY_KEYS) {
    if (key === "model" || key === "messages") continue;
    if (input[key] !== undefined) {
      body[key] = input[key];
    }
  }
  const options: GatewayRequestOptions = {
    logPayloads: optionalBoolean(input.log_payloads, "log_payloads"),
    taskId: optionalString(input.task_id, "task_id"),
  };
  return { body, options };
}

async function runCompareModels(client: GatewayClient, raw: unknown): Promise<unknown> {
  enforceMaxArguments(raw, "compare_models");
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("compare_models requires models and messages");
  }
  const input = rejectUnknownKeys(
    raw,
    [
      "models",
      "messages",
      "temperature",
      "top_p",
      "max_tokens",
      "max_completion_tokens",
      "response_format",
      "reasoning",
      "reasoning_effort",
      "log_payloads",
      "task_id",
    ],
    "compare_models",
  );
  if (!Array.isArray(input.models) || input.models.length === 0 || input.models.length > 5) {
    throw new Error("models must be an array of 1 to 5 model IDs");
  }
  const models = input.models.map((item) => assertModelName(item, "model"));
  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    throw new Error("messages are required");
  }
  const sharedFields: Record<string, unknown> = {};
  for (const key of [
    "temperature",
    "top_p",
    "max_tokens",
    "max_completion_tokens",
    "response_format",
    "reasoning",
    "reasoning_effort",
  ] as const) {
    if (input[key] !== undefined) sharedFields[key] = input[key];
  }
  const options: GatewayRequestOptions = {
    logPayloads: optionalBoolean(input.log_payloads, "log_payloads"),
    taskId: optionalString(input.task_id, "task_id"),
  };

  const results = await Promise.all(
    models.map(async (model) => {
      const started = Date.now();
      try {
        const { data, meta } = await createChatCompletion(
          client,
          { model, messages: input.messages, ...sharedFields },
          options,
        );
        return {
          model,
          ok: true,
          duration_ms: Date.now() - started,
          response: publicChat(data, meta),
        };
      } catch (error) {
        const message =
          error instanceof GatewayError
            ? error.formatForTool()
            : error instanceof Error
              ? error.message
              : "Niu request failed";
        return {
          model,
          ok: false,
          duration_ms: Date.now() - started,
          error: message,
          ...(error instanceof GatewayError && error.status ? { status: error.status } : {}),
          ...(error instanceof GatewayError && error.gatewayCode
            ? { gateway_code: error.gatewayCode }
            : {}),
        };
      }
    }),
  );
  return { results };
}

function publicChat(value: unknown, meta: GatewayMeta = {}): unknown {
  if (value === null || typeof value !== "object") {
    return attachMeta({ model: null, choices: [], usage: null }, meta);
  }
  const response = value as {
    id?: unknown;
    object?: unknown;
    model?: unknown;
    choices?: Array<{ index?: unknown; message?: unknown; finish_reason?: unknown }>;
    usage?: unknown;
  };
  return attachMeta(
    {
      ...(typeof response.id === "string" ? { id: response.id } : {}),
      ...(typeof response.object === "string" ? { object: response.object } : {}),
      model: typeof response.model === "string" ? response.model : null,
      choices: Array.isArray(response.choices)
        ? response.choices.map((choice) => ({
            ...(typeof choice.index === "number" ? { index: choice.index } : {}),
            message: choice.message ?? null,
            finish_reason: choice.finish_reason ?? null,
          }))
        : [],
      usage: response.usage ?? null,
    },
    meta,
  );
}

function parseResponsesArgs(
  raw: unknown,
): { body: Record<string, unknown>; options: GatewayRequestOptions } {
  const input = parseObjectArgs(
    raw,
    [
      "model",
      "input",
      "instructions",
      "max_output_tokens",
      "temperature",
      "top_p",
      "metadata",
      "user",
      "log_payloads",
      "task_id",
    ],
    "create_response",
  );
  const model = assertModelName(input.model, "model");
  const textInput = optionalString(input.input, "input");
  if (!textInput) throw new Error("input is required");
  const body: Record<string, unknown> = { model, input: textInput };
  for (const key of [
    "instructions",
    "max_output_tokens",
    "temperature",
    "top_p",
    "metadata",
    "user",
  ] as const) {
    if (input[key] !== undefined) body[key] = input[key];
  }
  return {
    body,
    options: {
      logPayloads: optionalBoolean(input.log_payloads, "log_payloads"),
      taskId: optionalString(input.task_id, "task_id"),
    },
  };
}

function publicResponse(value: unknown, meta: GatewayMeta): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return attachMeta(value, meta);
  }
  const response = value as {
    output?: Array<{
      type?: unknown;
      content?: Array<{ type?: unknown; text?: unknown }>;
    }>;
  };
  const texts: string[] = [];
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item?.type === "message" && Array.isArray(item.content)) {
        for (const block of item.content) {
          if (block?.type === "output_text" && typeof block.text === "string") {
            texts.push(block.text);
          }
        }
      }
    }
  }
  return attachMeta(
    {
      ...(value as Record<string, unknown>),
      ...(texts.length > 0 ? { output_text: texts.join("") } : {}),
    },
    meta,
  );
}

function parseMessagesArgs(
  raw: unknown,
): { body: Record<string, unknown>; options: GatewayRequestOptions } {
  const input = parseObjectArgs(
    raw,
    [
      "model",
      "max_tokens",
      "messages",
      "system",
      "temperature",
      "top_p",
      "stop_sequences",
      "tools",
      "tool_choice",
      "log_payloads",
      "task_id",
    ],
    "create_message",
  );
  const model = assertModelName(input.model, "model");
  if (typeof input.max_tokens !== "number" || !Number.isInteger(input.max_tokens) || input.max_tokens < 1) {
    throw new Error("max_tokens must be a positive integer");
  }
  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    throw new Error("messages are required");
  }
  const body: Record<string, unknown> = {
    model,
    max_tokens: input.max_tokens,
    messages: input.messages,
  };
  for (const key of [
    "system",
    "temperature",
    "top_p",
    "stop_sequences",
    "tools",
    "tool_choice",
  ] as const) {
    if (input[key] !== undefined) body[key] = input[key];
  }
  return {
    body,
    options: {
      logPayloads: optionalBoolean(input.log_payloads, "log_payloads"),
      taskId: optionalString(input.task_id, "task_id"),
    },
  };
}

function parseGenerateContentArgs(raw: unknown): {
  model: string;
  body: Record<string, unknown>;
  options: GatewayRequestOptions;
} {
  const input = parseObjectArgs(
    raw,
    ["model", "contents", "systemInstruction", "generationConfig", "log_payloads", "task_id"],
    "generate_content",
  );
  const model = assertModelName(input.model, "model");
  if (!Array.isArray(input.contents) || input.contents.length === 0) {
    throw new Error("contents are required");
  }
  if (
    input.generationConfig === null ||
    typeof input.generationConfig !== "object" ||
    Array.isArray(input.generationConfig)
  ) {
    throw new Error("generationConfig is required");
  }
  const body: Record<string, unknown> = {
    contents: input.contents,
    generationConfig: input.generationConfig,
    ...(input.systemInstruction !== undefined
      ? { systemInstruction: input.systemInstruction }
      : {}),
  };
  return {
    model,
    body,
    options: {
      logPayloads: optionalBoolean(input.log_payloads, "log_payloads"),
      taskId: optionalString(input.task_id, "task_id"),
    },
  };
}

function parseEmbeddingsArgs(
  raw: unknown,
): { body: Record<string, unknown>; options: GatewayRequestOptions } {
  const input = parseObjectArgs(
    raw,
    ["model", "input", "encoding_format", "dimensions", "user", "log_payloads", "task_id"],
    "create_embeddings",
  );
  const model = assertModelName(input.model, "model");
  const embInput = input.input;
  const validString = typeof embInput === "string" && embInput.trim() !== "";
  const validArray =
    Array.isArray(embInput) &&
    embInput.length > 0 &&
    embInput.every((item) => typeof item === "string" && item.trim() !== "");
  if (!validString && !validArray) {
    throw new Error("input must be a non-empty string or non-empty array of strings");
  }
  const body: Record<string, unknown> = { model, input: embInput };
  for (const key of ["encoding_format", "dimensions", "user"] as const) {
    if (input[key] !== undefined) body[key] = input[key];
  }
  return {
    body,
    options: {
      logPayloads: optionalBoolean(input.log_payloads, "log_payloads"),
      taskId: optionalString(input.task_id, "task_id"),
    },
  };
}

const VIDEO_DOMAIN_CONTROL_MAP = {
  duration_seconds: "duration",
  resolution: "resolution",
  aspect_ratio: "ratio",
  seed: "seed",
  watermark: "watermark",
  camera_fixed: "camera_fixed",
  return_last_frame: "return_last_frame",
  frames_per_second: "frames_per_second",
} as const;

function parseVideoGenerationArgs(
  raw: unknown,
  toolName: string,
  allowCreateOptions: boolean,
): {
  body: Record<string, unknown>;
  options: GatewayRequestOptions;
  wait?: boolean;
  timeoutMs?: number;
  intervalMs?: number;
} {
  const allowedKeys = [
    "model",
    "prompt",
    "references",
    "content",
    "duration_seconds",
    "resolution",
    "aspect_ratio",
    "seed",
    "watermark",
    "camera_fixed",
    "return_last_frame",
    "frames_per_second",
    "controls",
    ...(allowCreateOptions
      ? ["idempotency_key", "log_payloads", "wait", "timeout_ms", "interval_ms"]
      : []),
  ];
  const input = parseObjectArgs(raw, allowedKeys, toolName, MAX_INLINE_IMAGE_ARGUMENTS);
  const model = assertModelName(input.model, "model");

  const content: Array<Record<string, unknown>> = [];
  if (input.content !== undefined) {
    if (input.prompt !== undefined || input.references !== undefined) {
      throw new Error("Specify either content or prompt/references, not both");
    }
    if (!Array.isArray(input.content) || input.content.length === 0) {
      throw new Error("content must be a non-empty array");
    }
    for (const item of input.content) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        throw new Error("Each content item must be an object");
      }
      content.push(item as Record<string, unknown>);
    }
  } else {
    if (input.prompt !== undefined) {
      const prompt = optionalString(input.prompt, "prompt");
      if (prompt) content.push({ type: "text", text: prompt });
    }
    if (input.references !== undefined) {
      if (!Array.isArray(input.references)) {
        throw new Error("references must be an array");
      }
      for (const ref of input.references) {
        if (ref === null || typeof ref !== "object" || Array.isArray(ref)) {
          throw new Error("Each reference must be an object");
        }
        const refObj = ref as {
          kind?: unknown;
          url?: unknown;
          asset_id?: unknown;
          role?: unknown;
        };
        const role =
          refObj.role === undefined ? {} : { role: optionalString(refObj.role, "reference.role") };
        if (refObj.asset_id !== undefined) {
          const assetId = assertUuid(refObj.asset_id, "Niu asset UUID");
          content.push({
            type: "provider_asset",
            provider_asset: { id: assetId },
            ...role,
          });
          continue;
        }
        const url = optionalString(refObj.url, "reference.url");
        if (!url) throw new Error("reference.url is required");
        if (refObj.kind === "image") {
          content.push({ type: "image_url", image_url: { url }, ...role });
        } else if (refObj.kind === "audio") {
          content.push({ type: "audio_url", audio_url: { url }, ...role });
        } else if (refObj.kind === "video") {
          content.push({ type: "video_url", video_url: { url }, ...role });
        } else {
          throw new Error("reference.kind must be image, audio, or video");
        }
      }
    }
  }
  if (content.length === 0) {
    throw new Error("Provide a prompt, references, or content");
  }

  const body: Record<string, unknown> = { model, content };
  const reservedControlNames = new Set([
    "model",
    "content",
    ...Object.keys(VIDEO_DOMAIN_CONTROL_MAP),
    ...Object.values(VIDEO_DOMAIN_CONTROL_MAP),
  ]);

  if (input.controls !== undefined) {
    if (
      input.controls === null ||
      typeof input.controls !== "object" ||
      Array.isArray(input.controls)
    ) {
      throw new Error("controls must be an object");
    }
    for (const [key, value] of Object.entries(input.controls as Record<string, unknown>)) {
      if (
        reservedControlNames.has(key) ||
        key === "__proto__" ||
        key === "constructor" ||
        key === "prototype"
      ) {
        throw new Error(`control ${key} conflicts with a named generation field`);
      }
      body[key] = value;
    }
  }

  for (const [sourceKey, targetKey] of Object.entries(VIDEO_DOMAIN_CONTROL_MAP)) {
    const val = input[sourceKey];
    if (val === undefined) continue;
    body[targetKey] = val;
  }

  return {
    body,
    options: {
      idempotencyKey: optionalString(input.idempotency_key, "idempotency_key"),
      logPayloads: optionalBoolean(input.log_payloads, "log_payloads"),
    },
    wait: optionalBoolean(input.wait, "wait"),
    timeoutMs: input.timeout_ms === undefined ? undefined : Number(input.timeout_ms),
    intervalMs: input.interval_ms === undefined ? undefined : Number(input.interval_ms),
  };
}

async function handleDownloadVideoResult(
  client: GatewayClient,
  raw: unknown,
): Promise<ToolResult> {
  const input = parseObjectArgs(
    raw,
    ["id", "kind", "refresh", "output_path", "include_base64_image"],
    "download_video_result",
  );
  const id = assertUuid(input.id, "video job UUID");
  if (input.kind !== "video" && input.kind !== "last_frame") {
    throw new Error("kind must be video or last_frame");
  }
  const kind = input.kind;
  const refresh = optionalBoolean(input.refresh, "refresh") ?? false;
  const outputPath = optionalString(input.output_path, "output_path");
  const includeBase64Image =
    optionalBoolean(input.include_base64_image, "include_base64_image") ?? false;

  if (kind === "video" && !outputPath) {
    throw new Error("output_path is required when downloading a video result");
  }

  const { bytes, contentType, meta } = await retrieveVideoResult(client, id, kind, refresh);
  let savedTo: string | undefined;
  if (outputPath) {
    if (!client.writeBinaryFile) {
      throw new Error("Local file writing is not configured on this MCP client");
    }
    savedTo = await client.writeBinaryFile(outputPath, bytes);
  }

  const summary = attachMeta(
    {
      id,
      kind,
      refreshed: refresh,
      content_type: contentType,
      bytes: bytes.byteLength,
      ...(savedTo ? { saved_to: savedTo } : {}),
    },
    meta,
  );

  const content: ToolContentItem[] = [{ type: "text", text: JSON.stringify(summary) }];
  if (kind === "last_frame" && (includeBase64Image || !outputPath)) {
    const mimeType =
      contentType && contentType.startsWith("image/")
        ? contentType.split(";")[0]!.trim()
        : "image/png";
    content.push({
      type: "image",
      data: bytesToBase64(bytes),
      mimeType,
    });
  }
  return { content };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function mediaQuery(input: {
  model: string;
  after?: string;
  limit?: number;
  group_id?: string;
  expected_revision?: string;
}): string {
  const model = assertModelName(input.model, "model");
  const params = new URLSearchParams({ model });
  if (input.after !== undefined) {
    params.set("after", assertUuid(input.after, "cursor UUID"));
  }
  if (input.group_id !== undefined) {
    params.set("group_id", assertUuid(input.group_id, "group_id UUID"));
  }
  if (input.limit !== undefined) {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw new Error("limit must be an integer between 1 and 100");
    }
    params.set("limit", String(input.limit));
  }
  if (input.expected_revision !== undefined) {
    if (!/^[1-9][0-9]*$/.test(input.expected_revision)) {
      throw new Error("expected_revision must be a positive decimal integer string");
    }
    params.set("expected_revision", input.expected_revision);
  }
  return `?${params.toString()}`;
}

async function handleMediaAssetGroups(client: GatewayClient, raw: unknown): Promise<unknown> {
  const input = parseObjectArgs(
    raw,
    [
      "action",
      "model",
      "id",
      "name",
      "description",
      "expected_revision",
      "after",
      "limit",
      "idempotency_key",
    ],
    "media_asset_groups",
  );
  const action = optionalString(input.action, "action");
  const model = assertModelName(input.model, "model");
  const idempotencyKey = optionalString(input.idempotency_key, "idempotency_key");

  switch (action) {
    case "list":
      return requestMediaEndpoint(
        client,
        "GET",
        `/media/asset-groups${mediaQuery({
          model,
          after: optionalString(input.after, "after"),
          limit: input.limit === undefined ? undefined : Number(input.limit),
        })}`,
      );
    case "create": {
      const name = optionalString(input.name, "name");
      if (!name) throw new Error("name is required to create an asset group");
      return requestMediaEndpoint(
        client,
        "POST",
        "/media/asset-groups",
        {
          model,
          name,
          ...(input.description !== undefined ? { description: String(input.description) } : {}),
        },
        { idempotencyKey },
      );
    }
    case "get": {
      const id = assertUuid(input.id, "asset group UUID");
      return requestMediaEndpoint(
        client,
        "GET",
        `/media/asset-groups/${encodeURIComponent(id)}${mediaQuery({ model })}`,
      );
    }
    case "update": {
      const id = assertUuid(input.id, "asset group UUID");
      return requestMediaEndpoint(
        client,
        "PATCH",
        `/media/asset-groups/${encodeURIComponent(id)}`,
        {
          model,
          ...(input.name !== undefined ? { name: String(input.name) } : {}),
          ...(input.description !== undefined ? { description: String(input.description) } : {}),
          ...(input.expected_revision !== undefined
            ? { expected_revision: String(input.expected_revision) }
            : {}),
        },
        { idempotencyKey },
      );
    }
    case "delete": {
      const id = assertUuid(input.id, "asset group UUID");
      return requestMediaEndpoint(
        client,
        "DELETE",
        `/media/asset-groups/${encodeURIComponent(id)}${mediaQuery({
          model,
          expected_revision: optionalString(input.expected_revision, "expected_revision"),
        })}`,
        undefined,
        { idempotencyKey },
      );
    }
    case "refresh": {
      const id = assertUuid(input.id, "asset group UUID");
      return requestMediaEndpoint(
        client,
        "POST",
        `/media/asset-groups/${encodeURIComponent(id)}/refresh${mediaQuery({ model })}`,
      );
    }
    default:
      throw new Error("action must be list, create, get, update, delete, or refresh");
  }
}

async function handleMediaAssets(client: GatewayClient, raw: unknown): Promise<unknown> {
  const input = parseObjectArgs(
    raw,
    [
      "action",
      "model",
      "id",
      "group_id",
      "url",
      "name",
      "kind",
      "expected_revision",
      "after",
      "limit",
      "idempotency_key",
    ],
    "media_assets",
  );
  const action = optionalString(input.action, "action");
  const model = assertModelName(input.model, "model");
  const idempotencyKey = optionalString(input.idempotency_key, "idempotency_key");

  switch (action) {
    case "list":
      return requestMediaEndpoint(
        client,
        "GET",
        `/media/assets${mediaQuery({
          model,
          group_id: optionalString(input.group_id, "group_id"),
          after: optionalString(input.after, "after"),
          limit: input.limit === undefined ? undefined : Number(input.limit),
        })}`,
      );
    case "create": {
      const groupId = assertUuid(input.group_id, "group_id UUID");
      const url = optionalString(input.url, "url");
      if (!url) throw new Error("url is required to create a media asset");
      if (input.kind !== "image" && input.kind !== "video" && input.kind !== "audio") {
        throw new Error("kind must be image, video, or audio");
      }
      return requestMediaEndpoint(
        client,
        "POST",
        "/media/assets",
        {
          model,
          group_id: groupId,
          url,
          kind: input.kind,
          ...(input.name !== undefined ? { name: String(input.name) } : {}),
        },
        { idempotencyKey },
      );
    }
    case "get": {
      const id = assertUuid(input.id, "media asset UUID");
      return requestMediaEndpoint(
        client,
        "GET",
        `/media/assets/${encodeURIComponent(id)}${mediaQuery({ model })}`,
      );
    }
    case "rename": {
      const id = assertUuid(input.id, "media asset UUID");
      const name = optionalString(input.name, "name");
      if (!name) throw new Error("name is required to rename a media asset");
      return requestMediaEndpoint(
        client,
        "PATCH",
        `/media/assets/${encodeURIComponent(id)}`,
        {
          model,
          name,
          ...(input.expected_revision !== undefined
            ? { expected_revision: String(input.expected_revision) }
            : {}),
        },
        { idempotencyKey },
      );
    }
    case "delete": {
      const id = assertUuid(input.id, "media asset UUID");
      return requestMediaEndpoint(
        client,
        "DELETE",
        `/media/assets/${encodeURIComponent(id)}${mediaQuery({
          model,
          expected_revision: optionalString(input.expected_revision, "expected_revision"),
        })}`,
        undefined,
        { idempotencyKey },
      );
    }
    case "refresh": {
      const id = assertUuid(input.id, "media asset UUID");
      return requestMediaEndpoint(
        client,
        "POST",
        `/media/assets/${encodeURIComponent(id)}/refresh${mediaQuery({ model })}`,
      );
    }
    default:
      throw new Error("action must be list, create, get, rename, delete, or refresh");
  }
}

async function handleMediaAssetOperations(client: GatewayClient, raw: unknown): Promise<unknown> {
  const input = parseObjectArgs(
    raw,
    ["action", "model", "id", "idempotency_key", "operation", "after", "limit"],
    "media_asset_operations",
  );
  const action = optionalString(input.action, "action");
  const model = assertModelName(input.model, "model");

  switch (action) {
    case "list":
      return requestMediaEndpoint(
        client,
        "GET",
        `/media/asset-operations${mediaQuery({
          model,
          after: optionalString(input.after, "after"),
          limit: input.limit === undefined ? undefined : Number(input.limit),
        })}`,
      );
    case "get": {
      const id = assertUuid(input.id, "asset operation UUID");
      return requestMediaEndpoint(
        client,
        "GET",
        `/media/asset-operations/${encodeURIComponent(id)}${mediaQuery({ model })}`,
      );
    }
    case "get_by_idempotency": {
      const key = assertUuid(input.idempotency_key, "idempotency_key UUID");
      return requestMediaEndpoint(
        client,
        "GET",
        `/media/asset-operations/by-idempotency/${encodeURIComponent(key)}${mediaQuery({ model })}`,
      );
    }
    case "prepare": {
      const key = assertUuid(input.idempotency_key, "idempotency_key UUID");
      if (input.operation === null || typeof input.operation !== "object" || Array.isArray(input.operation)) {
        throw new Error("operation object is required for prepare");
      }
      return requestMediaEndpoint(
        client,
        "POST",
        "/media/asset-operations/prepare",
        { ...(input.operation as Record<string, unknown>), model },
        { idempotencyKey: key },
      );
    }
    case "dispatch": {
      const id = assertUuid(input.id, "asset operation UUID");
      const key = assertUuid(input.idempotency_key, "idempotency_key UUID");
      if (input.operation === null || typeof input.operation !== "object" || Array.isArray(input.operation)) {
        throw new Error("operation object is required for dispatch");
      }
      return requestMediaEndpoint(
        client,
        "POST",
        `/media/asset-operations/${encodeURIComponent(id)}/dispatch`,
        { ...(input.operation as Record<string, unknown>), model },
        { idempotencyKey: key },
      );
    }
    case "cancel": {
      const id = assertUuid(input.id, "asset operation UUID");
      return requestMediaEndpoint(
        client,
        "POST",
        `/media/asset-operations/${encodeURIComponent(id)}/cancel${mediaQuery({ model })}`,
      );
    }
    default:
      throw new Error(
        "action must be list, get, get_by_idempotency, prepare, dispatch, or cancel",
      );
  }
}

async function handleMediaVerificationSessions(
  client: GatewayClient,
  raw: unknown,
): Promise<unknown> {
  const input = parseObjectArgs(
    raw,
    [
      "action",
      "model",
      "id",
      "subject_name",
      "return_url",
      "after",
      "limit",
      "idempotency_key",
    ],
    "media_verification_sessions",
  );
  const action = optionalString(input.action, "action");
  const model = assertModelName(input.model, "model");
  const idempotencyKey = optionalString(input.idempotency_key, "idempotency_key");

  switch (action) {
    case "list":
      return requestMediaEndpoint(
        client,
        "GET",
        `/media/verification-sessions${mediaQuery({
          model,
          after: optionalString(input.after, "after"),
          limit: input.limit === undefined ? undefined : Number(input.limit),
        })}`,
      );
    case "create":
      return requestMediaEndpoint(
        client,
        "POST",
        "/media/verification-sessions",
        {
          model,
          ...(input.subject_name !== undefined
            ? { subject_name: String(input.subject_name) }
            : {}),
          ...(input.return_url !== undefined ? { return_url: String(input.return_url) } : {}),
        },
        { idempotencyKey },
      );
    case "get": {
      const id = assertUuid(input.id, "verification session UUID");
      return requestMediaEndpoint(
        client,
        "GET",
        `/media/verification-sessions/${encodeURIComponent(id)}${mediaQuery({ model })}`,
      );
    }
    case "refresh": {
      const id = assertUuid(input.id, "verification session UUID");
      return requestMediaEndpoint(
        client,
        "POST",
        `/media/verification-sessions/${encodeURIComponent(id)}/refresh${mediaQuery({ model })}`,
      );
    }
    case "link": {
      const id = assertUuid(input.id, "verification session UUID");
      return requestMediaEndpoint(
        client,
        "GET",
        `/media/verification-sessions/${encodeURIComponent(id)}/link${mediaQuery({ model })}`,
      );
    }
    default:
      throw new Error("action must be list, create, get, refresh, or link");
  }
}

async function handleMediaImageIngestions(
  client: GatewayClient,
  raw: unknown,
): Promise<unknown> {
  const input = parseObjectArgs(
    raw,
    [
      "action",
      "id",
      "read_id",
      "image",
      "valid_for_seconds",
      "source_id",
      "group_intent_id",
      "authorization_id",
      "confirm_ingestion",
      "before",
    ],
    "media_image_ingestions",
    MAX_INLINE_IMAGE_ARGUMENTS,
  );
  const action = optionalString(input.action, "action");

  switch (action) {
    case "prepare_source": {
      const image = optionalString(input.image, "image");
      if (!image || !image.startsWith("data:image/")) {
        throw new Error("image must be a data:image/ data URL");
      }
      const validForSeconds = Number(input.valid_for_seconds);
      if (!Number.isInteger(validForSeconds) || validForSeconds < 1 || validForSeconds > 900) {
        throw new Error("valid_for_seconds must be an integer from 1 to 900");
      }
      return requestMediaEndpoint(client, "POST", "/media/image-sources", {
        image,
        valid_for_seconds: validForSeconds,
      });
    }
    case "erase_source": {
      const id = assertUuid(input.id, "image source UUID");
      await requestMediaEndpoint(
        client,
        "DELETE",
        `/media/image-sources/${encodeURIComponent(id)}`,
      );
      return { erased: true, id };
    }
    case "list": {
      const before =
        input.before === undefined
          ? undefined
          : assertUuid(input.before, "image ingestion cursor UUID");
      const suffix = before ? `?before=${encodeURIComponent(before)}` : "";
      return requestMediaEndpoint(client, "GET", `/media/image-ingestions${suffix}`);
    }
    case "prepare_consent": {
      const id = assertUuid(input.id, "image ingestion consent UUID");
      const sourceId = assertUuid(input.source_id, "source_id UUID");
      const groupIntentId = assertUuid(input.group_intent_id, "group_intent_id UUID");
      const authorizationId = assertUuid(input.authorization_id, "authorization_id UUID");
      const validForSeconds = Number(input.valid_for_seconds);
      if (
        input.confirm_ingestion !== true ||
        !Number.isInteger(validForSeconds) ||
        validForSeconds < 1 ||
        validForSeconds > 900
      ) {
        throw new Error(
          "confirm_ingestion must be true and valid_for_seconds must be an integer from 1 to 900",
        );
      }
      return requestMediaEndpoint(
        client,
        "PUT",
        `/media/image-ingestions/${encodeURIComponent(id)}`,
        {
          source_id: sourceId,
          group_intent_id: groupIntentId,
          authorization_id: authorizationId,
          valid_for_seconds: validForSeconds,
          confirm_ingestion: true,
        },
      );
    }
    case "get_consent": {
      const id = assertUuid(input.id, "image ingestion consent UUID");
      return requestMediaEndpoint(
        client,
        "GET",
        `/media/image-ingestions/${encodeURIComponent(id)}`,
      );
    }
    case "revoke_consent": {
      const id = assertUuid(input.id, "image ingestion consent UUID");
      await requestMediaEndpoint(
        client,
        "DELETE",
        `/media/image-ingestions/${encodeURIComponent(id)}`,
      );
      return { revoked: true, id };
    }
    case "dispatch": {
      const id = assertUuid(input.id, "image ingestion consent UUID");
      return requestMediaEndpoint(
        client,
        "POST",
        `/media/image-ingestions/${encodeURIComponent(id)}/dispatch`,
        {},
      );
    }
    case "get_readiness": {
      const id = assertUuid(input.id, "image ingestion consent UUID");
      const readId = assertUuid(input.read_id, "read_id UUID");
      return requestMediaEndpoint(
        client,
        "GET",
        `/media/image-ingestions/${encodeURIComponent(id)}/readiness/${encodeURIComponent(readId)}`,
      );
    }
    case "refresh_readiness": {
      const id = assertUuid(input.id, "image ingestion consent UUID");
      const readId = assertUuid(input.read_id, "read_id UUID");
      return requestMediaEndpoint(
        client,
        "POST",
        `/media/image-ingestions/${encodeURIComponent(id)}/readiness/${encodeURIComponent(readId)}`,
        {},
      );
    }
    default:
      throw new Error(
        "action must be prepare_source, erase_source, list, prepare_consent, get_consent, revoke_consent, dispatch, get_readiness, or refresh_readiness",
      );
  }
}

export const toolDefinitions = [
  {
    name: "inspect_key",
    description:
      "Inspect the current workspace API key: label, allowed_models, expiration, spending_limits (with remaining_allowance_nanos), request/token/concurrency rate limits, 60-second usage_window, and ip_policy. Never exposes the secret token or Provider procurement costs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_models",
    description:
      "List the models available to this workspace API key, including customer prices when Niu publishes them. Prices are customer charges. Provider cost and platform margin are not available.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        search: {
          type: "string",
          description: "Optional case-insensitive substring filter on model id.",
        },
        priced_only: {
          type: "boolean",
          description: "When true, only return models that have a published customer_pricing schedule.",
        },
      },
    },
  },
  {
    name: "list_catalog_models",
    description:
      "List public Niu catalog models along with customer metadata and supported protocol capabilities (chat_completions, streaming, embeddings, messages, messages_streaming, generate_content, responses).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        search: {
          type: "string",
          description: "Optional case-insensitive substring filter on model id or catalog metadata.",
        },
        capability: {
          type: "string",
          enum: [
            "chat_completions",
            "streaming",
            "embeddings",
            "messages",
            "messages_streaming",
            "generate_content",
            "responses",
          ],
          description: "Optional protocol capability filter.",
        },
      },
    },
  },
  {
    name: "get_generation",
    description:
      "Retrieve token breakdown (prompt, completion, cached input, cache write, reasoning), phase latency timings, guardrail outcome, and customer charge for a generation attempt UUID (returned as attempt_id on inference calls).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: {
          type: "string",
          description: "Canonical generation attempt UUID (from x-niu-attempt-id / attempt_id).",
        },
      },
    },
  },
  {
    name: "create_chat_completion",
    description:
      "Send an OpenAI-compatible chat completion to Niu using a model id returned by list_models. The model is required and is sent unchanged. Supports sampling controls, structured JSON response_format, reasoning budget, function tools, payload retention opt-out (log_payloads), and task correlation (task_id). Returns choices, usage, and attempt_id.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["model", "messages"],
      properties: {
        model: { type: "string", minLength: 1 },
        messages: {
          type: "array",
          minItems: 1,
          items: { type: "object" },
        },
        temperature: { type: "number" },
        top_p: { type: "number" },
        max_tokens: { type: "integer", minimum: 1 },
        max_completion_tokens: { type: "integer", minimum: 1 },
        stop: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
        },
        presence_penalty: { type: "number" },
        frequency_penalty: { type: "number" },
        seed: { type: "integer" },
        user: { type: "string" },
        response_format: {
          type: "object",
          description: "Structured output format: {type: 'text'}, {type: 'json_object'}, or {type: 'json_schema', json_schema: {name, schema, strict?}}.",
        },
        reasoning: {
          type: "object",
          description: "Reasoning token configuration: {max_tokens: number, exclude?: boolean}.",
        },
        reasoning_effort: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
        tools: {
          type: "array",
          items: { type: "object" },
          description: "Function tool definitions forwarded to the model; Niu returns tool_calls without executing them.",
        },
        tool_choice: {
          oneOf: [{ type: "string" }, { type: "object" }],
        },
        parallel_tool_calls: { type: "boolean" },
        log_payloads: {
          type: "boolean",
          description: "Set false to send x-niu-log-payloads: false and opt out of 24h request/response payload retention.",
        },
        task_id: {
          type: "string",
          description: "Optional X-Niu-Task-ID correlation tag (1-200 printable ASCII chars) to group related requests in workspace activity.",
        },
      },
    },
  },
  {
    name: "compare_models",
    description:
      "Send the same chat messages concurrently to 1-5 explicit Niu models and return each model's completion, latency (duration_ms), usage, and attempt_id side-by-side. Every model is required to be explicitly listed; the server never chooses or substitutes a model.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["models", "messages"],
      properties: {
        models: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: { type: "string", minLength: 1 },
          description: "Explicit list of 1 to 5 model IDs from list_models.",
        },
        messages: {
          type: "array",
          minItems: 1,
          items: { type: "object" },
        },
        temperature: { type: "number" },
        top_p: { type: "number" },
        max_tokens: { type: "integer", minimum: 1 },
        max_completion_tokens: { type: "integer", minimum: 1 },
        response_format: { type: "object" },
        reasoning: { type: "object" },
        reasoning_effort: { type: "string", enum: ["low", "medium", "high"] },
        log_payloads: { type: "boolean" },
        task_id: { type: "string" },
      },
    },
  },
  {
    name: "create_response",
    description:
      "Create a text response via Niu's OpenAI Responses API (/v1/responses) on routes with supports_responses enabled. Requires an explicit model and text input.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["model", "input"],
      properties: {
        model: { type: "string", minLength: 1 },
        input: { type: "string", minLength: 1 },
        instructions: { type: "string" },
        max_output_tokens: { type: "integer", minimum: 1 },
        temperature: { type: "number" },
        top_p: { type: "number" },
        metadata: {
          type: "object",
          additionalProperties: { type: "string" },
        },
        user: { type: "string" },
        log_payloads: { type: "boolean" },
        task_id: { type: "string" },
      },
    },
  },
  {
    name: "create_message",
    description:
      "Create a native Anthropic Message (/v1/messages) on Niu routes with supports_messages enabled. Requires model, max_tokens, and messages.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["model", "max_tokens", "messages"],
      properties: {
        model: { type: "string", minLength: 1 },
        max_tokens: { type: "integer", minimum: 1 },
        messages: {
          type: "array",
          minItems: 1,
          items: { type: "object" },
        },
        system: {
          oneOf: [{ type: "string" }, { type: "array", items: { type: "object" } }],
        },
        temperature: { type: "number" },
        top_p: { type: "number" },
        stop_sequences: { type: "array", items: { type: "string" } },
        tools: { type: "array", items: { type: "object" } },
        tool_choice: { type: "object" },
        log_payloads: { type: "boolean" },
        task_id: { type: "string" },
      },
    },
  },
  {
    name: "generate_content",
    description:
      "Call Niu's native Gemini GenerateContent endpoint (/v1beta/models/{model}:generateContent) on routes with supports_generate_content enabled.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["model", "contents", "generationConfig"],
      properties: {
        model: { type: "string", minLength: 1 },
        contents: {
          type: "array",
          minItems: 1,
          items: { type: "object" },
        },
        systemInstruction: { type: "object" },
        generationConfig: {
          type: "object",
          required: ["maxOutputTokens"],
          properties: {
            maxOutputTokens: { type: "integer", minimum: 1 },
            candidateCount: { type: "integer", enum: [1] },
            temperature: { type: "number" },
            topP: { type: "number" },
            topK: { type: "integer" },
            stopSequences: { type: "array", items: { type: "string" } },
          },
        },
        log_payloads: { type: "boolean" },
        task_id: { type: "string" },
      },
    },
  },
  {
    name: "create_embeddings",
    description:
      "Create OpenAI-compatible text embeddings (/v1/embeddings) on Niu routes with embeddings enabled. Requires an explicit model and string or string[] input.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["model", "input"],
      properties: {
        model: { type: "string", minLength: 1 },
        input: {
          oneOf: [
            { type: "string", minLength: 1 },
            { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
          ],
        },
        encoding_format: { type: "string", enum: ["float", "base64"] },
        dimensions: { type: "integer", minimum: 1 },
        user: { type: "string" },
        log_payloads: { type: "boolean" },
        task_id: { type: "string" },
      },
    },
  },
  {
    name: "list_video_models",
    description:
      "List configured text/multimodal-to-video models accessible to this workspace key, including supported input types, control schemas, output resolutions/ratios, and billing meters.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "estimate_video",
    description:
      "Estimate effective output dimensions, metered quantity, and customer charge for a video generation request (/v1/video/estimate) without creating a job or reserving funds.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["model"],
      properties: {
        model: { type: "string", minLength: 1 },
        prompt: { type: "string" },
        references: {
          type: "array",
          items: { type: "object" },
          description: "Optional media references: {kind: 'image'|'audio'|'video', url, role?} or {asset_id, role?}.",
        },
        content: {
          type: "array",
          items: { type: "object" },
          description: "Raw protocol content array (use either prompt/references or content).",
        },
        duration_seconds: { type: "number" },
        resolution: { type: "string" },
        aspect_ratio: { type: "string" },
        seed: { type: "number" },
        watermark: { type: "boolean" },
        camera_fixed: { type: "boolean" },
        return_last_frame: { type: "boolean" },
        frames_per_second: { type: "number" },
        controls: { type: "object" },
      },
    },
  },
  {
    name: "create_video_job",
    description:
      "Submit a video generation job (/v1/video/jobs). Supports high-level prompt/references/controls or raw content, optional idempotency_key for safe replay, and optional wait=true to poll until completion.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["model"],
      properties: {
        model: { type: "string", minLength: 1 },
        prompt: { type: "string" },
        references: {
          type: "array",
          items: { type: "object" },
          description: "Optional media references: {kind: 'image'|'audio'|'video', url, role?} or {asset_id, role?}.",
        },
        content: {
          type: "array",
          items: { type: "object" },
          description: "Raw protocol content array (use either prompt/references or content).",
        },
        duration_seconds: { type: "number" },
        resolution: { type: "string" },
        aspect_ratio: { type: "string" },
        seed: { type: "number" },
        watermark: { type: "boolean" },
        camera_fixed: { type: "boolean" },
        return_last_frame: { type: "boolean" },
        frames_per_second: { type: "number" },
        controls: { type: "object" },
        idempotency_key: {
          type: "string",
          description: "Optional 1-128 printable ASCII key to safely replay an uncertain text/URL video creation.",
        },
        log_payloads: { type: "boolean" },
        wait: {
          type: "boolean",
          description: "When true, waits for queued/running jobs to finish before returning.",
        },
        timeout_ms: { type: "integer", minimum: 1 },
        interval_ms: { type: "integer", minimum: 1000 },
      },
    },
  },
  {
    name: "list_video_jobs",
    description:
      "List durable workspace video jobs newest-first (/v1/video/jobs) with optional cursor pagination.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        before: { type: "string", description: "Cursor UUID from next_before." },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: "get_video_job",
    description:
      "Read persisted video job state (/v1/video/jobs/{id}). Optionally set refresh=true to poll upstream once, or include_billing / include_timings / include_results to bundle related job details.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", description: "Canonical Niu video job UUID." },
        refresh: { type: "boolean" },
        include_billing: { type: "boolean" },
        include_timings: { type: "boolean" },
        include_results: { type: "boolean" },
      },
    },
  },
  {
    name: "refresh_video_job",
    description:
      "Explicitly refresh one direct-channel video job (/v1/video/jobs/{id}/refresh) from its upstream Provider.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", description: "Canonical Niu video job UUID." },
      },
    },
  },
  {
    name: "wait_for_video_job",
    description:
      "Wait for a video job to reach a terminal state using Niu's safe polling contract (reads persisted state, refreshes initial unknown once, and polls queued/running jobs every interval_ms up to timeout_ms without resubmitting).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", description: "Canonical Niu video job UUID." },
        timeout_ms: { type: "integer", minimum: 1, description: "Overall deadline in ms (default 600000)." },
        interval_ms: { type: "integer", minimum: 1000, description: "Poll interval in ms (default 5000)." },
      },
    },
  },
  {
    name: "get_video_job_billing",
    description:
      "Read saved customer video billing (/v1/video/jobs/{id}/billing), including reservation, estimate, settled usage, and posted charge_nanos.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", description: "Canonical Niu video job UUID." },
      },
    },
  },
  {
    name: "get_video_job_diagnostics",
    description:
      "Read measured gateway video transport timings, lifecycle timestamps (/v1/video/jobs/{id}/timings), and persisted upstream query observations (/v1/video/jobs/{id}/observations).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", description: "Canonical Niu video job UUID." },
        include_timings: { type: "boolean" },
        include_observations: { type: "boolean" },
        before: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: "get_video_job_results",
    description:
      "Read saved video and last_frame result availability (/v1/video/jobs/{id}/results) without downloading media bytes.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", description: "Canonical Niu video job UUID." },
      },
    },
  },
  {
    name: "download_video_result",
    description:
      "Retrieve a generated video or last_frame (/v1/video/jobs/{id}/results/{kind}, or /refresh when refresh=true). Writes media bytes to output_path (required for kind='video') and returns an inline MCP image block for last_frame when requested.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind"],
      properties: {
        id: { type: "string", description: "Canonical Niu video job UUID." },
        kind: { type: "string", enum: ["video", "last_frame"] },
        refresh: {
          type: "boolean",
          description: "When true, calls POST .../refresh to fetch fresh output from the original video task.",
        },
        output_path: {
          type: "string",
          description: "Local filesystem path to save the downloaded MP4/WebM/PNG/JPEG file (required for kind='video').",
        },
        include_base64_image: {
          type: "boolean",
          description: "When true for kind='last_frame', also includes an inline MCP image content block.",
        },
      },
    },
  },
  {
    name: "delete_video_results",
    description:
      "Permanently delete locally saved video result references for a job (/v1/video/jobs/{id}/results) while preserving billing and status records.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", description: "Canonical Niu video job UUID." },
      },
    },
  },
  {
    name: "list_media_capabilities",
    description:
      "Discover authorized model-specific native Provider material and human verification capabilities (/v1/media/capabilities).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        model: { type: "string", description: "Optional exact model alias filter." },
      },
    },
  },
  {
    name: "media_asset_groups",
    description:
      "Manage workspace Provider media asset groups (/v1/media/asset-groups): list, create, get, update, delete, or refresh.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["action", "model"],
      properties: {
        action: {
          type: "string",
          enum: ["list", "create", "get", "update", "delete", "refresh"],
        },
        model: { type: "string", minLength: 1 },
        id: { type: "string", description: "Asset group UUID (for get, update, delete, refresh)." },
        name: { type: "string" },
        description: { type: "string" },
        expected_revision: { type: "string" },
        after: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        idempotency_key: { type: "string", description: "Optional canonical UUID for mutations." },
      },
    },
  },
  {
    name: "media_assets",
    description:
      "Manage workspace Provider media assets (/v1/media/assets): list, create, get, rename, delete, or refresh.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["action", "model"],
      properties: {
        action: {
          type: "string",
          enum: ["list", "create", "get", "rename", "delete", "refresh"],
        },
        model: { type: "string", minLength: 1 },
        id: { type: "string", description: "Media asset UUID (for get, rename, delete, refresh)." },
        group_id: { type: "string", description: "Asset group UUID (required for create, optional filter for list)." },
        url: { type: "string", description: "Source URL (required for create)." },
        name: { type: "string" },
        kind: { type: "string", enum: ["image", "video", "audio"] },
        expected_revision: { type: "string" },
        after: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        idempotency_key: { type: "string", description: "Optional canonical UUID for mutations." },
      },
    },
  },
  {
    name: "media_asset_operations",
    description:
      "Inspect, prepare, dispatch, or cancel durable Provider media asset operations (/v1/media/asset-operations).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["action", "model"],
      properties: {
        action: {
          type: "string",
          enum: ["list", "get", "get_by_idempotency", "prepare", "dispatch", "cancel"],
        },
        model: { type: "string", minLength: 1 },
        id: { type: "string", description: "Operation UUID (for get, dispatch, cancel)." },
        idempotency_key: {
          type: "string",
          description: "Canonical non-nil UUID (for get_by_idempotency, prepare, dispatch).",
        },
        operation: {
          type: "object",
          description: "Typed mutation payload for prepare or dispatch.",
        },
        after: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: "media_verification_sessions",
    description:
      "Create, list, inspect, refresh, or retrieve the handoff link for upstream human verification sessions (/v1/media/verification-sessions).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["action", "model"],
      properties: {
        action: {
          type: "string",
          enum: ["list", "create", "get", "refresh", "link"],
        },
        model: { type: "string", minLength: 1 },
        id: { type: "string", description: "Verification session UUID (for get, refresh, link)." },
        subject_name: { type: "string" },
        return_url: { type: "string" },
        after: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        idempotency_key: { type: "string" },
      },
    },
  },
  {
    name: "media_image_ingestions",
    description:
      "Inspect and manage inline image sources (/v1/media/image-sources) and consented image ingestions (/v1/media/image-ingestions).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: [
            "prepare_source",
            "erase_source",
            "list",
            "prepare_consent",
            "get_consent",
            "revoke_consent",
            "dispatch",
            "get_readiness",
            "refresh_readiness",
          ],
        },
        id: { type: "string", description: "Image source UUID or ingestion consent UUID." },
        read_id: { type: "string", description: "Readiness observation UUID (for get_readiness, refresh_readiness)." },
        image: { type: "string", description: "Inline data:image/ URL (for prepare_source)." },
        valid_for_seconds: { type: "integer", minimum: 1, maximum: 900 },
        source_id: { type: "string" },
        group_intent_id: { type: "string" },
        authorization_id: { type: "string" },
        confirm_ingestion: { type: "boolean" },
        before: { type: "string" },
      },
    },
  },
] as const;
