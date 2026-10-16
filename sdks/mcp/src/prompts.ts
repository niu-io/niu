export const promptDefinitions = [
  {
    name: "consult_model",
    description:
      "Ask an explicit Niu model for a second opinion, code review, or debugging analysis, then inspect its generation telemetry.",
    arguments: [
      { name: "model", description: "Exact model ID from list_models", required: true },
      { name: "prompt", description: "Question, code review request, or task for the model", required: true },
      { name: "system", description: "Optional system instruction", required: false },
      { name: "context", description: "Optional code or file context", required: false },
    ],
  },
  {
    name: "compare_models",
    description:
      "Send the same prompt to multiple explicit Niu models in parallel using compare_models and compare their responses, latency, and usage.",
    arguments: [
      {
        name: "models",
        description: "Comma-separated model IDs from list_models (e.g. model-a,model-b)",
        required: true,
      },
      { name: "prompt", description: "Prompt to evaluate across the selected models", required: true },
      { name: "criteria", description: "Optional evaluation criteria", required: false },
    ],
  },
  {
    name: "check_key_budget",
    description:
      "Inspect the workspace API key's remaining spending allowance, rate-limit headroom, and accessible priced models.",
    arguments: [
      { name: "search", description: "Optional substring filter for model IDs", required: false },
    ],
  },
  {
    name: "generate_video_workflow",
    description:
      "Discover video model controls, estimate cost before submission, submit a video generation job, wait for completion, and download the result.",
    arguments: [
      { name: "model", description: "Video model ID from list_video_models", required: true },
      { name: "prompt", description: "Text prompt for video generation", required: true },
      { name: "output_path", description: "Optional local file path to save the MP4 result", required: false },
    ],
  },
] as const;

export function getPrompt(
  name: string,
  rawArgs: unknown,
): {
  description: string;
  messages: Array<{ role: "user"; content: { type: "text"; text: string } }>;
} {
  const args =
    rawArgs !== null && typeof rawArgs === "object" && !Array.isArray(rawArgs)
      ? (rawArgs as Record<string, unknown>)
      : {};

  if (name === "consult_model") {
    const model = requireStringArg(args, "model");
    const prompt = requireStringArg(args, "prompt");
    const system = optionalStringArg(args, "system");
    const context = optionalStringArg(args, "context");
    const parts = [
      `Call Niu's create_chat_completion tool with model "${model}".`,
      system ? `Include a system message: ${JSON.stringify(system)}.` : null,
      context ? `Include this context in the user message:\n\n${context}` : null,
      `User prompt:\n${prompt}`,
      `After receiving the completion, if an attempt_id is returned, you may call get_generation with that attempt_id to report latency and customer charge.`,
    ].filter(Boolean);
    return {
      description: `Consult Niu model ${model}`,
      messages: [{ role: "user", content: { type: "text", text: parts.join("\n\n") } }],
    };
  }

  if (name === "compare_models") {
    const modelsRaw = requireStringArg(args, "models");
    const models = modelsRaw
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (models.length === 0) throw new Error("models must contain at least one model ID");
    const prompt = requireStringArg(args, "prompt");
    const criteria = optionalStringArg(args, "criteria");
    const text = [
      `Call Niu's compare_models tool with models ${JSON.stringify(models)} and the following user message:`,
      prompt,
      criteria ? `Evaluate and compare the responses using these criteria: ${criteria}` : null,
      "Summarize each model's answer, finish_reason, latency (duration_ms), and reported token usage without substituting any model.",
    ]
      .filter(Boolean)
      .join("\n\n");
    return {
      description: `Compare Niu models: ${models.join(", ")}`,
      messages: [{ role: "user", content: { type: "text", text } }],
    };
  }

  if (name === "check_key_budget") {
    const search = optionalStringArg(args, "search");
    const text = [
      "1. Call inspect_key to read label, allowed_models, expires_at_ms (Unix milliseconds), spending_limits (limit_nanos, committed_nanos, remaining_nanos), rate_limits (requests_per_minute, tokens_per_minute, max_concurrent_requests, active_requests), usage_window and allowed_cidrs.",
      search
        ? `2. Call list_models with {"search": ${JSON.stringify(search)}} to inspect matching models and their customer_pricing.`
        : "2. Call list_models to inspect accessible models and their customer_pricing.",
      "3. Report spending by currency and distinguish null unlimited limits from known zero. A null expires_at_ms means no automatic expiration. Report rate policies and known usage without inferring complete RPM/TPM headroom when pending or unknown usage is not available. Keep customer charges distinct from unpriced models; a missing price is not zero.",
    ].join("\n");
    return {
      description: "Inspect workspace key limits, budget, and accessible models",
      messages: [{ role: "user", content: { type: "text", text } }],
    };
  }

  if (name === "generate_video_workflow") {
    const model = requireStringArg(args, "model");
    const prompt = requireStringArg(args, "prompt");
    const outputPath = optionalStringArg(args, "output_path");
    const text = [
      `1. Call list_video_models and verify the supported controls and output specifications for "${model}".`,
      `2. Call estimate_video with model "${model}" and prompt ${JSON.stringify(prompt)} to check the estimated quantity and customer charge before submitting.`,
      `3. Call create_video_job with model "${model}", prompt ${JSON.stringify(prompt)}, and wait: true (or call wait_for_video_job with the returned job id).`,
      outputPath
        ? `4. Once the job status is "succeeded", call download_video_result with the job id, kind "video", and output_path ${JSON.stringify(outputPath)}.`
        : `4. Once the job status is "succeeded", call get_video_job_results and get_video_job_billing to report result availability and customer billing.`,
    ].join("\n");
    return {
      description: `Video generation workflow for ${model}`,
      messages: [{ role: "user", content: { type: "text", text } }],
    };
  }

  throw new Error(`Unknown prompt: ${name}`);
}

function requireStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Prompt argument ${key} is required`);
  }
  return value.trim();
}

function optionalStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`Prompt argument ${key} must be a string`);
  return value.trim() === "" ? undefined : value;
}
