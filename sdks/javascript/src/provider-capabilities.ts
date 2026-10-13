import type {RequestOptions} from './index.js';
/** Native tools for one exact authorized model/account context; not completion evidence. */
export type NativeProviderModule = {
  module: 'volcengine'; model_alias: string; display_name: string | null;
  adapter: string; video_channel: 'ark-direct-v1'; management_channel: 'fastrouter-actions-v1';
  context_label: string;
  materials: {groups: true; assets: true; kinds: Array<'image' | 'audio' | 'video'>;
    reference_requires_active: true; reference_requires_same_context: true; reference_requires_dispatch_authorization: true};
  human_verification: true;
  reference_inputs: Array<{kind: 'image' | 'audio' | 'video'; roles: string[]; maximum_items: number}>;
};
export type NativeProviderCapabilities = {complete: true; selected_model: string | null; modules: NativeProviderModule[]};
export type NativeCapabilitySender = <T>(path: string, options?: RequestOptions) => Promise<T>;
/** Discovery performs no upstream call and never picks a first compatible account. */
export function nativeCapabilityQuery(model?: string): string {
  if (model === undefined) return '';
  if (!model || model.length > 256 || model.trim() !== model || /[\x00-\x1f\x7f]/.test(model)) throw new TypeError('An exact model alias is required');
  return '?' + new URLSearchParams({model});
}
