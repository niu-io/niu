import type { VideoOutputSchema } from '../../../../../sdks/javascript/src/admin';
// Versioned request constraints for one exact model/channel; not qualification.
export type VideoControl =
  | { kind: 'integer'; minimum: number; maximum: number; default: number | null }
  | { kind: 'choice'; values: string[]; default: string | null }
  | { kind: 'boolean'; default: boolean | null }
  | { kind: 'https_url'; maximum_bytes: number };
export type VideoInputRule = { maximum_items: number; maximum_bytes: number; https: boolean; data_mime_types: string[]; roles: string[]; role_required: boolean };
export type VideoSchema = {
  output?: VideoOutputSchema;
  version: 1; revision: string; model_alias: string; upstream_model: string; channel: string;
  maximum_body_bytes: number; maximum_content_items: number;
  inputs: Partial<Record<'text' | 'image_url' | 'video_url' | 'audio_url', VideoInputRule>>;
  controls: Partial<Record<VideoControlName, VideoControl>>;
  required_controls: VideoControlName[]; exclusive_controls: [VideoControlName, VideoControlName][]; callbacks_qualified: boolean;
};
export const videoControls = {
  duration: { label: 'Duration', kind: 'integer' },
  resolution: { label: 'Resolution', kind: 'choice' },
  ratio: { label: 'Aspect ratio', kind: 'choice' },
  seed: { label: 'Seed', kind: 'integer' },
  watermark: { label: 'Watermark', kind: 'boolean' },
  camera_fixed: { label: 'Fixed camera', kind: 'boolean' },
  return_last_frame: { label: 'Return last frame', kind: 'boolean' },
  frames_per_second: { label: 'Frames per second', kind: 'integer' },
  callback_url: { label: 'Callback URL', kind: 'https_url' },
} as const;
export type VideoControlName = keyof typeof videoControls;

export function schemaInteger(value: string, label: string, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!/^-?\d+$/.test(value.trim()) || !Number.isSafeInteger(n) || n < minimum || n > maximum) throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  return n;
}
export function schemaNames(value: string, label: string, maximum = 16) {
  const values = value.trim() ? value.split(',').map(item => item.trim()) : [];
  if (values.length > maximum || values.some(item => !item || new TextEncoder().encode(item).length > 256 || /[\u0000-\u001f\u007f]/.test(item)) || new Set(values).size !== values.length) throw new Error(`${label} needs distinct comma-separated values (up to ${maximum}).`);
  return values;
}
