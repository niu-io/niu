import { NiuAPIError } from './index.js';

/** Durable local content; this is not Provider ingestion or generation permission. */
export type WorkspaceAssetKind = 'image' | 'video' | 'audio';
export type WorkspaceAsset = {
  id: string; name: string; media_kind: WorkspaceAssetKind; content_type: string;
  content_sha256: string; byte_length: number; revision: string;
  created_at_ms: number; updated_at_ms: number;
};
export type WorkspaceAssetPage = { data: WorkspaceAsset[]; next_cursor: string | null };
export type WorkspaceAssetPageOptions = { kind?: WorkspaceAssetKind; after?: string; limit?: number };

/** Binary transfers use the same fixed credentials and reject redirects. */
export async function assetBinaryRequest(fetcher: typeof globalThis.fetch, base: string, token: string,
  path: string, options: { signal?: AbortSignal }, input?: { contentType: string; bytes: Uint8Array }): Promise<Response> {
  if (input && (input.bytes.byteLength < 1 || input.bytes.byteLength > 8 * 1024 * 1024)) {
    throw new RangeError('Workspace materials require 1 byte to 8 MiB');
  }
  const response = await fetcher(`${base}${path}`, {
    method: input ? 'POST' : 'GET', redirect: 'error', signal: options.signal,
    headers: { authorization: `Bearer ${token}`, accept: input ? 'application/json' : '*/*',
      ...(input ? { 'content-type': input.contentType } : {}) },
    body: input ? new Uint8Array(input.bytes).buffer : undefined,
  });
  if (!response.ok) {
    const text = await response.text(); let payload: unknown;
    try { payload = text ? JSON.parse(text) : undefined; } catch { payload = text; }
    throw NiuAPIError.fromResponse(response, payload);
  }
  return response;
}
