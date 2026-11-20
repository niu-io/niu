import type {RequestOptions} from './index.js';
export type NativeProviderModuleId = 'volcengine' | (string & {});
export type NativeProviderMaterialsCapability = {
  groups: boolean;
  assets: boolean;
  kinds: Array<'image' | 'audio' | 'video'>;
  reference_requires_active: boolean;
  reference_requires_same_context: boolean;
  reference_requires_dispatch_authorization: boolean;
};
export type NativeProviderReferenceInput = {
  kind: 'image' | 'audio' | 'video';
  roles: string[];
  maximum_items: number;
};
/** Native tools for one exact authorized model/account context; not completion evidence. */
export type NativeProviderModule = {
  module: NativeProviderModuleId; model_alias: string; display_name: string | null;
  adapter: string; video_channel: string; management_channel: string;
  context_label: string;
  materials: NativeProviderMaterialsCapability;
  human_verification: boolean;
  reference_inputs: NativeProviderReferenceInput[];
};
export type NativeProviderCapabilities = {complete: true; selected_model: string | null; modules: NativeProviderModule[]};
export type NativeCapabilitySender = <T>(path: string, options?: RequestOptions) => Promise<T>;
/** Discovery performs no upstream call and never picks a first compatible account. */
export function nativeCapabilityQuery(model?: string): string {
  if (model === undefined) return '';
  if (!model || model.length > 256 || model.trim() !== model || /[\x00-\x1f\x7f]/.test(model)) throw new TypeError('An exact model alias is required');
  return '?' + new URLSearchParams({model});
}
