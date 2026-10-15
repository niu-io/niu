import type { Model } from '@/app/dashboard-context';

// Tags describe explicit catalog metadata, never guesses from a model's name.
export const capabilityGroups = [
  { id: 'input', label: 'Input modalities', options: [
    ['text', 'Text'], ['image', 'Image'], ['file', 'File'], ['audio', 'Audio'], ['video', 'Video'],
  ] },
  { id: 'output', label: 'Output modalities', options: [
    ['text', 'Text'], ['image', 'Image'], ['audio', 'Audio'], ['video', 'Video'], ['embeddings', 'Embeddings'],
  ] },
  { id: 'features', label: 'Capabilities', options: [
    ['tools', 'Tool calling'], ['structured_outputs', 'Structured output'],
    ['reasoning', 'Reasoning'], ['web_search_options', 'Web search'],
    ['parallel_tool_calls', 'Parallel tool calls'],
  ] },
] as const;

export type CapabilityGroup = typeof capabilityGroups[number]['id'];
export type CapabilitySelection = Record<CapabilityGroup, string[]>;
export const emptyCapabilities = (): CapabilitySelection => ({ input: [], output: [], features: [] });

export function capabilityValues(model: Model, group: CapabilityGroup): string[] {
  if (group === 'input') return model.catalog?.input_modalities ?? [];
  if (group === 'output') return model.catalog?.output_modalities ?? [];
  const parameters = model.catalog?.supported_parameters ?? [];
  return parameters.some(value => ['reasoning', 'include_reasoning', 'reasoning_effort'].includes(value))
    ? [...parameters, 'reasoning'] : parameters;
}

export function matchesCapabilities(model: Model, selected: CapabilitySelection): boolean {
  // Modalities are alternatives within a group. Required capabilities combine:
  // a tools + structured-output selection needs both on the same model.
  return capabilityGroups.every(group => {
    const values = capabilityValues(model, group.id);
    return group.id === 'features'
      ? selected[group.id].every(value => values.includes(value))
      : !selected[group.id].length || selected[group.id].some(value => values.includes(value));
  });
}

export function modelCapabilityTags(model: Model): string[] {
  return capabilityGroups.flatMap(group => group.options
    .filter(([value]) => capabilityValues(model, group.id).includes(value))
    .map(([, label]) => group.id === 'features' ? label : `${label} ${group.id}`));
}
