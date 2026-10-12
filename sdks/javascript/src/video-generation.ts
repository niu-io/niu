import type { VideoCreateRequest } from './index.js';

/** Niu domain inputs; model-specific capabilities remain server-validated. */
export type NiuVideoGenerationInput = {
  model: string;
  prompt?: string;
  references?: Array<
    | { kind: 'image' | 'audio' | 'video'; url: string; role?: string; assetId?: never }
    | { assetId: string; role?: string; kind?: never; url?: never }
  >;
  durationSeconds?: number;
  resolution?: string;
  aspectRatio?: string;
  seed?: number;
  watermark?: boolean;
  cameraFixed?: boolean;
  returnLastFrame?: boolean;
  framesPerSecond?: number;
  /** Additional model-specific controls; cannot override named fields. */
  controls?: Record<string, unknown>;
};

const fields = {
  durationSeconds: 'duration', resolution: 'resolution', aspectRatio: 'ratio',
  seed: 'seed', watermark: 'watermark', cameraFixed: 'camera_fixed',
  returnLastFrame: 'return_last_frame', framesPerSecond: 'frames_per_second',
} as const;
const reserved = new Set(['model', 'content', ...Object.keys(fields), ...Object.values(fields)]);

/**
 * Normalize a generation request without fetching references or submitting it.
 * No universal model ranges, price estimates or usage quantities are inferred.
 * Existing jobs.create remains available for direct protocol-level requests.
 */
export function normalizeVideoGeneration(input: NiuVideoGenerationInput): VideoCreateRequest {
  if (typeof input.model !== 'string' || !input.model.trim()) {
    throw new TypeError('model must be a nonempty string');
  }
  const content: VideoCreateRequest['content'] = [];
  if (input.prompt !== undefined) {
    if (typeof input.prompt !== 'string' || !input.prompt.trim()) {
      throw new TypeError('prompt must be a nonempty string when provided');
    }
    content.push({ type: 'text', text: input.prompt });
  }
  if (input.references !== undefined && !Array.isArray(input.references)) {
    throw new TypeError('references must be an array');
  }
  for (const reference of input.references ?? []) {
    if (!reference || (reference.role !== undefined && (typeof reference.role !== 'string' || !reference.role.trim()))) {
      throw new TypeError('references require an optional nonempty role');
    }
    const role = reference.role === undefined ? {} : { role: reference.role };
    if (reference.assetId !== undefined) {
      if (typeof reference.assetId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(reference.assetId)
        || reference.url !== undefined || reference.kind !== undefined) {
        throw new TypeError('asset references require one canonical Niu asset ID; kind is resolved by the backend');
      }
      content.push({ type: 'provider_asset', provider_asset: { id: reference.assetId }, ...role });
      continue;
    }
    if (typeof reference.url !== 'string' || !reference.url.trim()) {
      throw new TypeError('URL references require a nonempty URL');
    }
    switch (reference.kind) {
      case 'image': content.push({ type: 'image_url', image_url: { url: reference.url }, ...role }); break;
      case 'audio': content.push({ type: 'audio_url', audio_url: { url: reference.url }, ...role }); break;
      case 'video': content.push({ type: 'video_url', video_url: { url: reference.url }, ...role }); break;
      default: throw new TypeError('reference kind must be image, audio or video');
    }
  }
  if (content.length === 0) throw new TypeError('provide a prompt or at least one reference');
  const request: VideoCreateRequest = { model: input.model, content };
  if (input.controls !== undefined) {
    if (input.controls === null || typeof input.controls !== 'object' || Array.isArray(input.controls)) {
      throw new TypeError('controls must be an object');
    }
    for (const [name, value] of Object.entries(input.controls)) {
      if (reserved.has(name) || name === '__proto__' || name === 'constructor' || name === 'prototype') {
        throw new TypeError(`control ${name} conflicts with a named generation field`);
      }
      request[name] = value;
    }
  }
  for (const [name, target] of Object.entries(fields) as Array<[keyof typeof fields, string]>) {
    const value = input[name];
    if (value === undefined) continue;
    const expected = name === 'watermark' || name === 'cameraFixed' || name === 'returnLastFrame'
      ? 'boolean' : name === 'resolution' || name === 'aspectRatio' ? 'string' : 'number';
    if (typeof value !== expected || (typeof value === 'number' && !Number.isFinite(value))
      || (typeof value === 'string' && !value.trim())) {
      throw new TypeError(`${name} must be a finite number, nonempty string or boolean of its declared type`);
    }
    request[target] = value;
  }
  return request;
}
