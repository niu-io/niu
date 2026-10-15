import { describe, expect, it } from 'vitest';
import { emptyCapabilities, matchesCapabilities, modelCapabilityTags } from '@/features/models/model-capabilities';
const model = {id:'example',public_catalog:true,catalog:{input_modalities:['text','image'],output_modalities:['text'],supported_parameters:['tools','reasoning_effort','response_format']}};
describe('catalog capabilities', () => {
  it('uses explicit metadata and does not equate JSON formatting with schema support', () => {
    expect(modelCapabilityTags(model)).toEqual(['Text input','Image input','Text output','Tool calling','Reasoning']);
    expect(modelCapabilityTags({id:'reasoning-vision-tools',public_catalog:true,catalog:{description:'supports everything'}})).toEqual([]);
  });
  it('combines modality groups and requires every selected capability', () => {
    expect(matchesCapabilities(model, {...emptyCapabilities(),input:['image','audio'],output:['text'],features:['tools','reasoning']})).toBe(true);
    expect(matchesCapabilities(model, {...emptyCapabilities(),features:['tools','structured_outputs']})).toBe(false);
    expect(matchesCapabilities(model, {...emptyCapabilities(),output:['video']})).toBe(false);
    expect(matchesCapabilities({id:'unknown',public_catalog:true}, {...emptyCapabilities(),input:['text']})).toBe(false);
  });
});
