/**
 * Starting templates for the video schema editor. These are not capability
 * claims, qualification, or universal Provider limits: every value remains a
 * draft the administrator must review against the exact model/channel contract.
 */
export type VideoPresetId = 'seedance' | 'kling' | 'veo' | 'sora' | 'generic';
export type PresetInputName = 'text' | 'image_url' | 'video_url' | 'audio_url';
export type PresetInput = {
  enabled: boolean;
  maximumItems: number;
  maximumBytes: number;
  https: boolean;
  dataMimeTypes: string[];
  roles: string[];
  roleRequired: boolean;
};
export type PresetDuration = { minimum: number; maximum: number; default: number };
export type VideoPreset = {
  id: VideoPresetId;
  name: string;
  channel: string;
  maximumBodyBytes: number;
  maximumContentItems: number;
  inputs: Record<PresetInputName, PresetInput>;
  duration: PresetDuration;
  resolutions: string[];
  ratios: string[];
  estimator: 'SeedancePixelsV1' | 'OutputSecondsV1';
  framesPerSecond?: { minimum: number; maximum: number; default: number };
};

export const videoResolutionOptions = ['480p', '720p', '1080p', '4k'] as const;
export const videoRatioOptions = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] as const;
export const videoDurationRanges: ReadonlyArray<PresetDuration> = [
  { minimum: 1, maximum: 4, default: 4 },
  { minimum: 1, maximum: 5, default: 5 },
  { minimum: 1, maximum: 8, default: 5 },
  { minimum: 1, maximum: 60, default: 5 },
  { minimum: 4, maximum: 8, default: 8 },
  { minimum: 4, maximum: 12, default: 5 },
  { minimum: 5, maximum: 10, default: 5 },
];

const shortSides: Record<string, number> = { '480p': 480, '720p': 720, '1080p': 1080, '4k': 2160 };
const ratioShapes: Record<string, [number, number]> = {
  '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:3': [4, 3], '3:4': [3, 4], '21:9': [21, 9],
};

/** Standard even-dimension pixel mapping for a resolution labels and aspect ratio. */
export function standardPixels(resolution: string, ratio: string): { width: number; height: number } | undefined {
  const shortSide = shortSides[resolution];
  const shape = ratioShapes[ratio];
  if (!shortSide || !shape) return undefined;
  const [wide, tall] = shape;
  const roundEven = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  return wide >= tall
    ? { width: roundEven(shortSide * wide / tall), height: shortSide }
    : { width: shortSide, height: roundEven(shortSide * tall / wide) };
}

export function presetOutputMappings(preset: VideoPreset) {
  return preset.resolutions.flatMap(resolution => preset.ratios.flatMap(ratio => {
    const pixels = standardPixels(resolution, ratio);
    return pixels ? [{ resolution, ratio, ...pixels }] : [];
  }));
}

function templateInputs(maximumBodyBytes: number, contentItems: number, imageEnabled: boolean): Record<PresetInputName, PresetInput> {
  const body = Math.max(1, maximumBodyBytes);
  const items = Math.max(1, contentItems);
  return {
    text: { enabled: true, maximumItems: items, maximumBytes: Math.min(65_536, body), https: false, dataMimeTypes: [], roles: [], roleRequired: false },
    image_url: { enabled: imageEnabled, maximumItems: items, maximumBytes: Math.min(4_194_304, body), https: true, dataMimeTypes: ['image/png', 'image/jpeg', 'image/webp'], roles: [], roleRequired: false },
    video_url: { enabled: false, maximumItems: items, maximumBytes: Math.min(8_388_608, body), https: true, dataMimeTypes: ['video/mp4'], roles: [], roleRequired: false },
    audio_url: { enabled: false, maximumItems: items, maximumBytes: Math.min(4_194_304, body), https: true, dataMimeTypes: ['audio/mpeg', 'audio/wav'], roles: [], roleRequired: false },
  };
}

const seedanceBody = 16_777_216;
const openRouterBody = 1_048_576;

export const videoPresets: readonly VideoPreset[] = [
  {
    id: 'seedance', name: 'Seedance', channel: 'ark-direct-v1',
    maximumBodyBytes: seedanceBody, maximumContentItems: 4,
    inputs: templateInputs(seedanceBody, 4, true),
    duration: { minimum: 4, maximum: 12, default: 5 },
    resolutions: ['480p', '720p', '1080p'], ratios: ['16:9', '9:16', '1:1'],
    estimator: 'SeedancePixelsV1', framesPerSecond: { minimum: 24, maximum: 60, default: 24 },
  },
  {
    id: 'kling', name: 'Kling', channel: 'openrouter-video-v1',
    maximumBodyBytes: openRouterBody, maximumContentItems: 2,
    inputs: templateInputs(openRouterBody, 2, false),
    duration: { minimum: 5, maximum: 10, default: 5 },
    resolutions: ['720p', '1080p'], ratios: ['16:9', '9:16', '1:1'],
    estimator: 'OutputSecondsV1',
  },
  {
    id: 'veo', name: 'Veo', channel: 'openrouter-video-v1',
    maximumBodyBytes: openRouterBody, maximumContentItems: 2,
    inputs: templateInputs(openRouterBody, 2, false),
    duration: { minimum: 4, maximum: 8, default: 8 },
    resolutions: ['720p', '1080p'], ratios: ['16:9', '9:16'],
    estimator: 'OutputSecondsV1',
  },
  {
    id: 'sora', name: 'Sora', channel: 'openrouter-video-v1',
    maximumBodyBytes: openRouterBody, maximumContentItems: 2,
    inputs: templateInputs(openRouterBody, 2, false),
    duration: { minimum: 4, maximum: 12, default: 8 },
    resolutions: ['720p', '1080p'], ratios: ['16:9', '9:16', '1:1'],
    estimator: 'OutputSecondsV1',
  },
  {
    id: 'generic', name: 'Generic Video', channel: 'openrouter-video-v1',
    maximumBodyBytes: 4_194_304, maximumContentItems: 4,
    inputs: templateInputs(4_194_304, 4, false),
    duration: { minimum: 1, maximum: 60, default: 5 },
    resolutions: ['480p', '720p', '1080p'], ratios: ['16:9', '9:16', '1:1'],
    estimator: 'OutputSecondsV1',
  },
];

export function videoPreset(id: VideoPresetId): VideoPreset | undefined {
  return videoPresets.find(preset => preset.id === id);
}
