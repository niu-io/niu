const assets = import.meta.glob('../assets/providers/*.{svg,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const definitions = [
  ['anthropic', 'Anthropic', 'anthropic', ['anthropic', 'claude']],
  ['openai', 'OpenAI', 'openai', ['openai', 'gpt', 'chatgpt', 'o1', 'o3', 'o4']],
  ['qwen', 'Qwen', 'qwen-color', ['qwen', 'qvq', 'qwq', 'wan', 'wanx', 'alibaba']],
  ['deepseek', 'DeepSeek', 'deepseek-color', ['deepseek', 'deepseek-ai', 'deepseekv', 'deepseekr']],
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
  ['fastrouter', 'FastRouter', 'fastrouter', ['fastrouter']],
  ['babelark', 'BabelArk', 'babelark', ['babelark']],
  ['qiniu', 'Qiniu', 'qiniu-color', ['qiniu']],
  ['aion-labs', 'Aion Labs', 'aionlabs', ['aion-labs']],
  ['amazon', 'Amazon', 'aws', ['amazon']],
  ['arcee-ai', 'Arcee AI', 'arcee', ['arcee-ai']],
  ['baidu', 'Baidu', 'baidu', ['baidu', 'ernie', 'wenxin']],
  ['fireworks', 'Fireworks', 'fireworks', ['fireworks']],
  ['ibm-granite', 'IBM', 'ibm', ['ibm-granite']],
  ['inception', 'Inception', 'inception', ['inception']],
  ['inclusionai', 'InclusionAI', 'antgroup', ['inclusionai']],
  ['inference-net', 'Inference.net', 'inference', ['inference-net']],
  ['kwaipilot', 'Kwai', 'kwaipilot', ['kwaipilot', 'kling', 'kolors']],
  ['meituan', 'Meituan', 'longcat', ['meituan', 'longcat']],
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
  ['tencent', 'Tencent', 'tencent', ['tencent', 'hunyuan']],
  ['upstage', 'Upstage', 'upstage', ['upstage']],
  ['xiaomi', 'Xiaomi', 'xiaomi', ['xiaomi']],
] as const;
export type ProviderIdentity = { id: string; name: string; logo?: string };
export const providers: ProviderIdentity[] = definitions.map(([id, name, asset]) => ({ id, name, logo: assets[`../assets/providers/${asset}.svg`] ?? assets[`../assets/providers/${asset}.png`] }));
function matchesAliasPrefix(normalized: string, alias: string): boolean {
  if (normalized === alias) return true;
  if (!normalized.startsWith(alias)) return false;
  const next = normalized[alias.length];
  if (next === '/' || next === '-' || next === '_' || next === '.' || next === ':' || next === ' ') return true;
  return alias.length >= 3 && next >= '0' && next <= '9';
}
export function identifyProvider(value?: string): ProviderIdentity | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return;
  const index = definitions.findIndex(([, , , aliases]) => aliases.some(alias => matchesAliasPrefix(normalized, alias)));
  return providers[index];
}
export type ModelIdentityInput = {
  id: string;
  upstream_model?: string;
  catalog?: { name?: string | null } | null;
};
// These businesses distribute or route model access. Their brand identifies a
// Provider, never the upstream model developer.
const distributorIds = new Set(['fastrouter', 'openrouter', 'babelark', 'qiniu']);
// Route namespaces describe access or transport, not model authorship.
const routingNamespaces = new Set(['byok', ...distributorIds]);
const modelFamilyTokens = new Set([
  'deepseek', 'claude', 'gpt', 'chatgpt', 'gemini', 'gemma',
  'qwen', 'qvq', 'qwq', 'wan', 'wanx', 'llama',
  'mixtral', 'codestral', 'devstral', 'pixtral',
  'kimi', 'moonshot', 'glm', 'chatglm', 'minimax', 'grok',
  'nemotron', 'seedance', 'seedream', 'doubao',
  'longcat', 'hunyuan', 'ernie', 'kling',
]);
export function modelDeveloper(model: ModelIdentityInput): ProviderIdentity | undefined {
  for (const source of [model.upstream_model, model.id, model.catalog?.name]) {
    if (!source?.trim()) continue;
    const parts = source.trim().toLowerCase().split('/').filter(Boolean);
    while (parts.length > 1 && routingNamespaces.has(parts[0])) parts.shift();
    const candidate = parts.join('/');
    if (!candidate || routingNamespaces.has(candidate)) continue;
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const segment = parts[index];
      if (routingNamespaces.has(segment)) continue;
      const known = identifyProvider(segment);
      if (known && !distributorIds.has(known.id)) return known;
    }
    const basename = parts[parts.length - 1] ?? '';
    for (const token of basename.split(/[-_.: ]+/)) {
      const clean = token.replace(/\d.*$/, '');
      if (modelFamilyTokens.has(token) || (clean.length >= 3 && modelFamilyTokens.has(clean))) {
        const known = identifyProvider(token);
        if (known && !distributorIds.has(known.id)) return known;
      }
    }
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
  const domains: Record<string, string> = { 'openai.com': 'openai', 'anthropic.com': 'anthropic', 'openrouter.ai': 'openrouter', 'wecitytech.com': 'fastrouter', 'babelark.ai': 'babelark', 'deepseek.com': 'deepseek', 'dashscope.aliyuncs.com': 'qwen', 'dashscope-intl.aliyuncs.com': 'qwen', 'googleapis.com': 'google', 'moonshot.cn': 'moonshot', 'moonshot.ai': 'moonshot', 'mistral.ai': 'mistral', 'bigmodel.cn': 'zai', 'z.ai': 'zai', 'minimax.io': 'minimax', 'minimaxi.com': 'minimax', 'x.ai': 'xai', 'qiniu.com': 'qiniu', 'qnaigc.com': 'qiniu' };
  const id = Object.entries(domains).find(([domain]) => host === domain || host.endsWith(`.${domain}`))?.[1];
  return providers.find(provider => provider.id === id) ?? { id: 'custom', name: vendor.adapter === 'openrouter' ? 'OpenRouter-compatible' : 'OpenAI-compatible' };
}

const catalogWords: Record<string, string> = {
  deepseek: 'DeepSeek', qwen: 'Qwen', kimi: 'Kimi', glm: 'GLM', wan: 'Wan', seedance: 'Seedance',
  gemma: 'Gemma', mistral: 'Mistral', conatus: 'Conatus', moonshot: 'Moonshot', gpt: 'GPT',
  claude: 'Claude', gemini: 'Gemini', llama: 'Llama', doubao: 'Doubao', seedream: 'Seedream',
  minimax: 'MiniMax', grok: 'Grok',
};

export function catalogTitle(model: { id: string; catalog?: { name?: string | null } | null } | string): string {
  if (typeof model === 'string') {
    const slug = (model.split('/').pop() || model)
      .replace(/-(?:20\d{6}|\d{6})$/, '')
      .replace(/(?<=[a-z])-(\d+)-(\d+)(?=-|$)/gi, '-$1.$2');
    const parts = slug.split(/[-_]/).filter(Boolean);
    if (!model.includes('/') && !identifyProvider(model) && !parts.some(part => part.toLowerCase() in catalogWords)) return model;
    return parts
      .map(part => catalogWords[part.toLowerCase()] ?? part.replace(/^v(\d)/i, 'V$1').replace(/^[a-z]/, char => char.toUpperCase()))
      .join(' ');
  }
  const name = model.catalog?.name?.trim();
  if (name && name !== model.id && !name.includes('/')) return name;
  return catalogTitle(model.id);
}

export function disambiguatedCatalogTitle(
  model: { id: string; provider?: string; catalog?: { name?: string | null } | null },
  allModels?: ReadonlyArray<{ id: string; catalog?: { name?: string | null } | null }>,
): string {
  const base = catalogTitle(model);
  if (!allModels || allModels.filter(item => catalogTitle(item) === base).length <= 1) return base;
  const prefix = model.provider?.trim() || (model.id.includes('/') ? model.id.slice(0, model.id.indexOf('/')) : modelProviderName(model));
  return prefix ? `${base} (${prefix})` : base;
}
