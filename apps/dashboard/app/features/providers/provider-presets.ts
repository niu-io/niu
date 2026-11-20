import openrouter from '@/assets/providers/openrouter.svg';
import fastrouter from '@/assets/providers/fastrouter.png';
import babelark from '@/assets/providers/babelark.png';
import qiniu from '@/assets/providers/qiniu-color.svg';
import deepseek from '@/assets/providers/deepseek-color.svg';
import type { ProviderServiceDescriptor } from '@niu-io/sdk';
import type { ProviderAdapter, ProviderIntegrationType } from './api';

/** Only brand presentation is bundled; connection instructions come from the backend registry. */
const brands: Record<string, {logo: string; monochrome?: boolean}> = {
  openrouter: {logo: openrouter, monochrome: true}, fastrouter: {logo: fastrouter},
  babelark: {logo: babelark}, qiniu: {logo: qiniu}, deepseek: {logo: deepseek},
};
export type ProviderPreset = { id: string; name: string; adapter: ProviderAdapter; apiBase: string; website: string; logo?: string; monochrome?: boolean; integration: ProviderIntegrationType };
export function providerPreset(descriptor: ProviderServiceDescriptor): ProviderPreset {
  return {id:descriptor.id, name:descriptor.name, adapter:descriptor.protocol, apiBase:descriptor.api_base,
    website:descriptor.website, integration:descriptor.id, ...brands[descriptor.id]};
}
