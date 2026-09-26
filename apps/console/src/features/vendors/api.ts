export type VendorAdapter = 'openrouter' | 'openai';

export type Vendor = {
  id: string;
  name: string;
  adapter: VendorAdapter;
  api_base: string;
  enabled: boolean;
  revision: number;
  has_credential: boolean;
};

export type ModelCapabilities = {
  supports_tool_calls: boolean;
  supports_streaming_tool_calls: boolean;
  supports_structured_output: boolean;
  supports_embeddings: boolean;
  supports_embedding_dimensions: boolean;
  supports_embedding_base64: boolean;
  supports_responses: boolean;
};

export type VendorModel = {
  alias: string;
  vendor_id: string;
  upstream_model: string;
  public_catalog: boolean;
  enabled: boolean;
  capabilities: ModelCapabilities;
  pricing: Record<string, unknown> | null;
  revision: number;
};

export type VendorWrite = {
  name: string;
  api_base: string;
  enabled: boolean;
  api_key?: string;
  expected_revision: number;
};

export type ModelWrite = Omit<VendorModel, 'vendor_id' | 'revision' | 'pricing'> & {
  pricing?: Record<string, unknown> | null;
  expected_revision: number | null;
};

export class VendorRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'VendorRequestError';
  }
}

export async function request<T>(
  token: string,
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    signal,
    cache: 'no-store',
    headers: {
      authorization: 'Bearer ' + token,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new VendorRequestError(payload?.error?.message ?? 'Request failed (' + response.status + ')', response.status);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function defaultApiBase(adapter: VendorAdapter) {
  return adapter === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1';
}

export function emptyCapabilities(): ModelCapabilities {
  return {
    supports_tool_calls: false,
    supports_streaming_tool_calls: false,
    supports_structured_output: false,
    supports_embeddings: false,
    supports_embedding_dimensions: false,
    supports_embedding_base64: false,
    supports_responses: false,
  };
}
