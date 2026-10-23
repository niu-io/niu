import type { Model } from '@/app/dashboard-context';

// Current gateway configuration overrides descriptive catalog metadata. Older
// servers can still declare a modality; missing evidence never proves support.
export function generationCapability(model: Model, kind: 'chat' | 'video'): boolean | null {
  if (model.generation_capabilities !== undefined) {
    const value=model.generation_capabilities?.[kind];
    return typeof value==='boolean' ? value : null;
  }
  const outputs=model.catalog?.output_modalities;
  return outputs?.length ? outputs.includes(kind==='chat'?'text':'video') : null;
}
