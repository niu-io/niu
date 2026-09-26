export type ChatMessage = {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  content: string | Array<Record<string, unknown>> | null;
  [key: string]: unknown;
};

export type ChatFunctionTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
};

export type ChatToolChoice = 'none' | 'auto' | 'required' | {
  type: 'function';
  function: { name: string };
};

export type ChatResponseFormat =
  | { type: 'text' }
  | { type: 'json_object' }
  | { type: 'json_schema'; json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean; description?: string } };

export type ChatToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type ChatCompletionResponse = {
  id: string;
  object: string;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage & { tool_calls?: ChatToolCall[]; refusal?: string | null };
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens?: number };
};

export { NiuExecutionRecorder } from './execution.js';
export type {
  ExecutionCoverage,
  ExecutionLinkKind,
  ExecutionLinkV1,
  ExecutionOutcomeAuthority,
  ExecutionOutcomeResult,
  ExecutionOutcomeV1,
  ExecutionRecordV1,
  ExecutionRecorderOptions,
  ExecutionSpanKind,
  ExecutionSpanStatus,
  ExecutionSpanV1,
  StartExecutionSpanOptions,
} from './execution.js';

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ChatFunctionTool[];
  tool_choice?: ChatToolChoice;
  response_format?: ChatResponseFormat;
  stream?: false;
  [key: string]: unknown;
};

export type ChatStreamRequest = Omit<ChatCompletionRequest, 'stream'> & {
  model: string;
  messages: ChatMessage[];
  stream?: true;
};

export type Model = {
  id: string;
  object: 'model' | string;
  owned_by?: string;
};

export type ModelList = {
  object?: 'list' | string;
  data: Model[];
};

export type EmbeddingRequest = {
  model: string;
  input: string | string[];
  encoding_format?: 'float' | 'base64';
  dimensions?: number;
  user?: string;
};

export type EmbeddingResponse = {
  object: 'list' | string;
  data: Array<{
    object?: 'embedding' | string;
    embedding: number[] | string;
    index?: number;
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens?: number;
    completion_tokens?: number;
  };
};

export type ResponsesRequest = {
  model: string;
  input: string;
  instructions?: string;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  metadata?: Record<string, string>;
  user?: string;
  stream?: false;
};

export type ResponsesOutputText = {
  type: 'output_text';
  text: string;
  annotations?: unknown[];
} | {
  type: 'refusal';
  refusal: string;
};

export type ResponsesMessage = {
  id?: string;
  type: 'message';
  role: 'assistant';
  status?: string;
  content: ResponsesOutputText[];
};

export type ResponsesReasoning = {
  id?: string;
  type: 'reasoning';
  summary?: unknown[];
};

export type ResponsesResponse = {
  id: string;
  object: 'response';
  status: 'completed' | 'incomplete';
  model: string;
  output: Array<ResponsesMessage | ResponsesReasoning>;
  usage?: { input_tokens: number; output_tokens: number; total_tokens?: number };
};

export type NiuClientOptions = {
  apiKey: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
  defaultHeaders?: HeadersInit;
};

export class NiuAPIError extends Error {
  readonly status: number;
  readonly requestId?: string;
  readonly responseBody: unknown;

  constructor(status: number, responseBody: unknown, requestId?: string) {
    super(errorMessage(responseBody, status));
    this.name = 'NiuAPIError';
    this.status = status;
    this.responseBody = responseBody;
    this.requestId = requestId;
  }
}

export class NiuClient {
  readonly models: { list: (options?: RequestOptions) => Promise<ModelList> };
  readonly embeddings: { create: (request: EmbeddingRequest, options?: RequestOptions) => Promise<EmbeddingResponse> };
  readonly responses: { create: (request: ResponsesRequest, options?: RequestOptions) => Promise<ResponsesResponse> };
  readonly chat: {
    completions: (request: ChatCompletionRequest, options?: RequestOptions) => Promise<ChatCompletionResponse>;
    stream: (request: ChatStreamRequest, options?: RequestOptions) => AsyncGenerator<unknown>;
  };

  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly requestFetch: typeof globalThis.fetch;
  private readonly defaultHeaders: HeadersInit;

  constructor(options: NiuClientOptions) {
    if (!options.apiKey.trim()) throw new Error('apiKey is required');
    this.apiKey = options.apiKey;
    this.baseURL = (options.baseURL ?? 'http://localhost:2555/v1').replace(/\/+$/, '');
    this.requestFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = options.defaultHeaders ?? {};

    this.models = { list: (requestOptions) => this.request('/models', undefined, requestOptions) };
    this.embeddings = {
      create: (request, requestOptions) => this.request('/embeddings', request, requestOptions),
    };
    this.responses = {
      create: (request, requestOptions) => this.request('/responses', request, requestOptions),
    };
    this.chat = {
      stream: (request, requestOptions) => this.streamChat(request, requestOptions),
      completions: async (request, requestOptions) => {
        if ((request as { stream?: boolean }).stream === true) {
          throw new Error('Use chat.stream() for streaming requests');
        }
        return this.request('/chat/completions', request, requestOptions);
      },
    };
  }

  private async request<T>(
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const response = await this.send(path, body, options, 'application/json');
    return await readPayload(response) as T;
  }

  private async *streamChat(request: ChatStreamRequest, options: RequestOptions = {}): AsyncGenerator<unknown> {
    const response = await this.send('/chat/completions', {
      ...request,
      stream: true,
      stream_options: { ...(request.stream_options as Record<string, unknown> ?? {}), include_usage: true },
    }, options, 'text/event-stream');
    if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'text/event-stream' || !response.body) {
      await response.body?.cancel();
      throw new Error('Expected an event-stream response');
    }
    yield* parseChatStream(response.body);
  }

  private async send(path: string, body: unknown, options: RequestOptions, accept: string): Promise<Response> {
    const headers = new Headers(this.defaultHeaders);
    headers.set('authorization', `Bearer ${this.apiKey}`);
    headers.set('accept', accept);
    if (body !== undefined) headers.set('content-type', 'application/json');

    const response = await this.requestFetch(`${this.baseURL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
    });
    if (!response.ok) {
      throw new NiuAPIError(response.status, await readPayload(response), response.headers.get('x-niu-operation-id') ?? response.headers.get('x-request-id') ?? undefined);
    }
    return response;
  }
}

export type RequestOptions = { signal?: AbortSignal };

function errorMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null) {
    const root = body as { error?: { message?: unknown }; message?: unknown };
    if (typeof root.error?.message === 'string') return root.error.message;
    if (typeof root.message === 'string') return root.message;
  }
  return `Niu API request failed with status ${status}`;
}


async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  try { return text ? JSON.parse(text) : undefined; } catch { return text; }
}

async function* parseChatStream(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let line = '';
  let data = '';
  let skipLF = false;
  let eventSize = 0;
  let errorEvent = false;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      const text = decoder.decode(result.value, { stream: true });
      for (const char of text) {
        if (skipLF) { skipLF = false; if (char === '\n') continue; }
        eventSize += char.length;
        if (eventSize > 65_536) throw new Error('SSE event exceeds client buffer limit');
        if (char !== '\r' && char !== '\n') { line += char; continue; }
        skipLF = char === '\r';
        if (line === '') {
          eventSize = 0;
          if (errorEvent) throw new Error('Upstream returned an SSE error event');
          if (data !== '') {
            const event = data.slice(0, -1);
            data = '';
            if (event === '[DONE]') return;
            const value: unknown = JSON.parse(event);
            if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid chat stream event');
            if ('error' in value) throw new Error(errorMessage(value, 200));
            yield value;
          }
          errorEvent = false;
        } else if (!line.startsWith(':')) {
          const colon = line.indexOf(':');
          const field = colon < 0 ? line : line.slice(0, colon);
          let value = colon < 0 ? '' : line.slice(colon + 1);
          if (value.startsWith(' ')) value = value.slice(1);
          if (field === 'data') data += value + '\n';
          if (field === 'event') errorEvent = value === 'error';
        }
        line = '';
      }
    }
    throw new Error('Stream ended without a terminal event');
  } finally {
    try { await reader.cancel(); } finally { reader.releaseLock(); }
  }
}

export { NiuAdminClient, NiuCollectorClient } from './admin.js';
export type { NiuAdminOptions, NiuCollectorOptions, TenantScope, SupplierAccountInput, SupplierAccount, QuotaObservation, QuotaWindow } from './admin.js';
