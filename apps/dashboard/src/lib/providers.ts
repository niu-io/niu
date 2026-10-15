const assets = import.meta.glob('../assets/providers/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const definitions = [
  ['anthropic', 'Anthropic', 'anthropic', ['anthropic', 'claude']],
  ['openai', 'OpenAI', 'openai', ['openai', 'gpt', 'chatgpt', 'o1', 'o3', 'o4']],
  ['qwen', 'Qwen', 'qwen-color', ['qwen', 'qvq', 'alibaba']],
  ['deepseek', 'DeepSeek', 'deepseek-color', ['deepseek']],
  ['google', 'Google', 'gemini-color', ['google', 'gemini', 'gemma']],
  ['meta', 'Meta', 'meta-color', ['meta', 'meta-llama', 'llama']],
  ['mistral', 'Mistral', 'mistral-color', ['mistral', 'mistralai', 'mixtral', 'codestral', 'devstral', 'pixtral']],
  ['moonshot', 'Moonshot AI', 'moonshot', ['moonshot', 'moonshotai', 'kimi']],
  ['zai', 'Z.ai', 'zai', ['z-ai', 'zai', 'z.ai', 'glm', 'chatglm']],
  ['minimax', 'MiniMax', 'minimax-color', ['minimax']],
  ['xai', 'xAI', 'xai', ['x-ai', 'xai', 'grok']],
  ['cohere', 'Cohere', 'cohere-color', ['cohere', 'command']],
  ['nvidia', 'NVIDIA', 'nvidia-color', ['nvidia', 'nemotron']],
  ['bytedance', 'ByteDance', 'bytedance-color', ['bytedance', 'bytedance-seed', 'seed', 'seedance', 'seedream', 'doubao']],
  ['openrouter', 'OpenRouter', 'openrouter', ['openrouter']],
  ['qiniu', 'Qiniu', 'qiniu-color', ['qiniu']],
  ['aion-labs', 'Aion Labs', 'aionlabs', ['aion-labs']],
  ['amazon', 'Amazon', 'aws', ['amazon']],
  ['arcee-ai', 'Arcee AI', 'arcee', ['arcee-ai']],
  ['baidu', 'Baidu', 'baidu', ['baidu']],
  ['fireworks', 'Fireworks', 'fireworks', ['fireworks']],
  ['ibm-granite', 'IBM', 'ibm', ['ibm-granite']],
  ['inception', 'Inception', 'inception', ['inception']],
  ['inclusionai', 'InclusionAI', 'antgroup', ['inclusionai']],
  ['inference-net', 'Inference.net', 'inference', ['inference-net']],
  ['kwaipilot', 'Kwai', 'kwaipilot', ['kwaipilot']],
  ['meituan', 'Meituan', 'longcat', ['meituan']],
  ['microsoft', 'Microsoft', 'microsoft', ['microsoft']],
  ['morph', 'Morph', 'morph', ['morph']],
  ['nousresearch', 'Nous Research', 'nousresearch', ['nousresearch']],
  ['perceptron', 'Perceptron', 'perceptron', ['perceptron']],
  ['perplexity', 'Perplexity', 'perplexity', ['perplexity']],
  ['poolside', 'Poolside', 'poolside', ['poolside']],
  ['rekaai', 'Reka', 'reka', ['rekaai']],
  ['relace', 'Relace', 'relace', ['relace']],
  ['sakana', 'Sakana AI', 'sakana', ['sakana']],
  ['stepfun', 'StepFun', 'stepfun', ['stepfun']],
  ['tencent', 'Tencent', 'tencent', ['tencent']],
  ['upstage', 'Upstage', 'upstage', ['upstage']],
  ['xiaomi', 'Xiaomi', 'xiaomimimo', ['xiaomi']],
] as const;
export type ProviderIdentity = { id: string; name: string; logo?: string };
export const providers: ProviderIdentity[] = definitions.map(([id, name, asset]) => ({ id, name, logo: assets[`../assets/providers/${asset}.svg`] }));
export function identifyProvider(value?: string): ProviderIdentity | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return;
  const index = definitions.findIndex(([, , , aliases]) => aliases.some(alias => normalized === alias || normalized.startsWith(`${alias}/`) || normalized.startsWith(`${alias}-`)));
  return providers[index];
}
type ModelIdentityInput = { id: string; upstream_model?: string };
// Route namespaces describe access or transport, not model authorship.
const routingNamespaces = new Set(['byok', 'fastrouter', 'openrouter']);
export function modelDeveloper(model: ModelIdentityInput): ProviderIdentity | undefined {
  for (const source of [model.upstream_model, model.id]) {
    if (!source?.trim()) continue;
    const parts = source.trim().toLowerCase().split('/');
    while (parts.length > 1 && routingNamespaces.has(parts[0])) parts.shift();
    const candidate = parts.join('/');
    if (routingNamespaces.has(candidate)) continue;
    const known = identifyProvider(candidate);
    if (known) return known;
  }
  // An arbitrary alias prefix is not evidence of a model developer.
  return undefined;
}
export function modelIdentity(model: ModelIdentityInput): ProviderIdentity {
  return modelDeveloper(model) ?? { id: 'other', name: 'Other models' };
}
export function modelProviderName(model: { provider?: string }): string | undefined {
  const value = model.provider?.trim();
  if (!value || /^byok$/i.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return;
  if (value.toLowerCase() === 'fastrouter') return 'FastRouter';
  // Preserve named connections; only normalize an exact registered service name.
  const definition = definitions.find(([, , , aliases]) => aliases.some(alias => alias === value.toLowerCase()));
  return definition?.[1] ?? value;
}
export function connectionIdentity(vendor: { name: string; api_base: string; adapter: string }): ProviderIdentity {
  let host = '';
  try { host = new URL(vendor.api_base).hostname.toLowerCase(); } catch { /* Invalid endpoints keep the neutral mark. */ }
  const domains: Record<string, string> = { 'openai.com': 'openai', 'anthropic.com': 'anthropic', 'openrouter.ai': 'openrouter', 'deepseek.com': 'deepseek', 'dashscope.aliyuncs.com': 'qwen', 'dashscope-intl.aliyuncs.com': 'qwen', 'googleapis.com': 'google', 'moonshot.cn': 'moonshot', 'moonshot.ai': 'moonshot', 'mistral.ai': 'mistral', 'bigmodel.cn': 'zai', 'z.ai': 'zai', 'minimax.io': 'minimax', 'minimaxi.com': 'minimax', 'x.ai': 'xai', 'qiniu.com': 'qiniu', 'qnaigc.com': 'qiniu' };
  const id = Object.entries(domains).find(([domain]) => host === domain || host.endsWith(`.${domain}`))?.[1];
  return providers.find(provider => provider.id === id) ?? { id: 'custom', name: vendor.adapter === 'openrouter' ? 'OpenRouter-compatible' : 'OpenAI-compatible' };
}
