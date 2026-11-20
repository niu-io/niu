import { describe, expect, it } from 'vitest';
import { catalogTitle, connectionIdentity, identifyProvider, modelIdentity, modelDeveloper, modelProviderName, providers } from '../../app/lib/providers';

describe('provider identity', () => {
  it('identifies the model author independently of a route alias', () => {
    expect(modelIdentity({ id: 'team-chat', upstream_model: 'anthropic/claude-sonnet-4' }).id).toBe('anthropic');
    expect(modelIdentity({ id: 'qwen/qwen3-coder' }).id).toBe('qwen');
    expect(modelIdentity({ id: 'private-route' }).id).toBe('other');
    expect(identifyProvider('not-anthropic/claude')).toBeUndefined();
  });
  it('uses endpoint host boundaries, not the wire protocol or arbitrary connection name', () => {
    const vendor = { name: 'OpenAI primary', adapter: 'openai', api_base: 'https://api.deepseek.com/v1' };
    expect(connectionIdentity(vendor).id).toBe('deepseek');
    expect(connectionIdentity({ ...vendor, api_base: 'https://api.openai.com.example.org/v1' }).id).toBe('custom');
    expect(connectionIdentity({ ...vendor, api_base: 'invalid' }).name).toBe('OpenAI-compatible');
  });
  it('bundles a local logo for every registered provider', () => {
    expect(providers.map(provider => provider.name)).toEqual(expect.arrayContaining(['OpenRouter', 'FastRouter', 'BabelArk', 'Qiniu', 'DeepSeek']));
    for (const provider of providers) expect(provider.logo).toMatch(/(?:\.(?:svg|png)|^data:image\/svg\+xml)/);
  });
});

describe('model developer and provider boundaries', () => {
  it('resolves model families behind routing and BYOK namespaces', () => {
    expect(modelIdentity({id:'fastrouter/seedance-2.0-mini'}).name).toBe('ByteDance');
    expect(modelIdentity({id:'byok/gpt-4.1-mini'}).name).toBe('OpenAI');
    expect(modelIdentity({id:'byok/private',upstream_model:'openrouter/anthropic/claude-sonnet-4'}).name).toBe('Anthropic');
    expect(modelIdentity({id:'fastrouter/seedream-4'}).name).toBe('ByteDance');
    expect(modelIdentity({id:'babelark/claude-sonnet-4'}).name).toBe('Anthropic');
    expect(modelIdentity({id:'qiniu/deepseek-v3'}).name).toBe('DeepSeek');
    expect(modelIdentity({id:'volcengine/deepseek-r1'}).id).toBe('deepseek');
    expect(modelIdentity({id:'babelark-text/deepseek-v3'}).id).toBe('deepseek');
    expect(modelIdentity({id:'qiniu-primary/deepseek-r1'}).id).toBe('deepseek');
    expect(modelIdentity({id:'new-api/deepseek-chat'}).id).toBe('deepseek');
    expect(modelIdentity({id:'siliconflow/deepseek-ai/DeepSeek-V3'}).id).toBe('deepseek');
    expect(modelIdentity({id:'nvidia/deepseek-r1'}).id).toBe('deepseek');
    expect(modelIdentity({id:'deepseek_v3'}).id).toBe('deepseek');
    expect(modelIdentity({id:'deepseek.r1'}).id).toBe('deepseek');
    expect(modelIdentity({id:'deepseekv3'}).id).toBe('deepseek');
    expect(modelIdentity({id:'ark-deepseek-r1'}).id).toBe('deepseek');
    expect(modelIdentity({id:'custom-chat', catalog:{name:'DeepSeek V3'}}).id).toBe('deepseek');
    expect(modelIdentity({id:'babelark/qwen3.6-plus'}).id).toBe('qwen');
    expect(modelIdentity({id:'babelark-video/wan3.0-video'}).id).toBe('qwen');
    expect(modelIdentity({id:'qiniu/meituan/longcat-flash-lite'}).id).toBe('meituan');
    expect(modelIdentity({id:'qiniu/longcat-flash-lite'}).id).toBe('meituan');
    expect(modelIdentity({id:'conatus'}).id).toBe('qiniu');
    expect(modelIdentity({id:'qiniu/conatus-free'}).id).toBe('qiniu');
    expect(modelIdentity({id:'qiniu/conatus-pro', catalog:{name:'Qiniu: Conatus Pro'}}).id).toBe('qiniu');
    expect(modelIdentity({id:'custom-route', catalog:{name:'Conatus Free'}}).id).toBe('qiniu');
  });
  it('does not fabricate developers from arbitrary aliases or providers', () => {
    for(const id of ['byok/private','fastrouter/custom','babelark/custom','qiniu/custom','my-team/private-model','fastrouter','babelark','qiniu','byok']) {
      expect(modelDeveloper({id})).toBeUndefined();
      expect(modelIdentity({id}).id).toBe('other');
    }
    expect(modelDeveloper({id:'openai/private',upstream_model:'anthropic/claude-sonnet-4'})?.id).toBe('anthropic');
  });
  it('never treats a model distributor or router brand as the model developer', () => {
    for(const id of ['openrouter-private','fastrouter-pro','babelark-labs','qiniu-edge','openrouter/vendor/custom','babelark/third-party-model']) {
      expect(modelDeveloper({id})).toBeUndefined();
      expect(modelIdentity({id}).id).toBe('other');
    }
    expect(modelDeveloper({id:'babelark/deepseek-chat'})?.id).toBe('deepseek');
    expect(modelDeveloper({id:'qiniu/gemini-2.5-pro'})?.id).toBe('google');
  });
  it('keeps direct developer models and named Provider attribution separate', () => {
    expect(modelDeveloper({id:'claude-sonnet-4'})?.id).toBe('anthropic');
    expect(modelDeveloper({id:'gpt-4.1-mini'})?.id).toBe('openai');
    expect(modelDeveloper({id:'gemini-2.5-pro'})?.id).toBe('google');
    const imported = {id:'babelark/deepseek-v3', provider:'babelark'};
    expect(modelDeveloper(imported)?.id).toBe('deepseek');
    expect(modelProviderName(imported)).toBe('BabelArk');
    expect(modelProviderName({id:'babelark/third-party-model', provider:'babelark'})).toBe('BabelArk');
    expect(modelDeveloper({id:'babelark/third-party-model', provider:'babelark'})).toBeUndefined();
    expect(modelDeveloper({id:'third-party-model', provider:'babelark'})).toBeUndefined();
    expect(modelDeveloper({id:'claude-sonnet-4', provider:'babelark'})?.id).toBe('anthropic');
  });
  it('keeps access mode and identifiers out of provider names', () => {
    expect(modelProviderName({provider:'byok'})).toBeUndefined();
    expect(modelProviderName({provider:' BYOK '})).toBeUndefined();
    expect(modelProviderName({provider:'00000000-0000-0000-0000-000000000001'})).toBeUndefined();
    expect(modelProviderName({provider:'fastrouter'})).toBe('FastRouter');
    expect(modelProviderName({provider:'openrouter'})).toBe('OpenRouter');
    expect(modelProviderName({provider:'Team inference'})).toBe('Team inference');
  });
  it('formats catalog model slugs while preserving custom route aliases', () => {
    expect(catalogTitle('volcengine/doubao-seedance-2-0-fast-260128')).toBe('Doubao Seedance 2.0 Fast');
    expect(catalogTitle('fastrouter/ByteDance-Seed/Seedance-2.0-fast')).toBe('Seedance 2.0 Fast');
    expect(catalogTitle('anthropic/claude-3-5-sonnet-20241022')).toBe('Claude 3.5 Sonnet');
    expect(catalogTitle('video-model')).toBe('video-model');
    expect(catalogTitle('model-9')).toBe('model-9');
    expect(catalogTitle({id:'openai/gpt-4.1-mini', catalog:{name:'OpenAI: GPT-4.1 Mini'}})).toBe('GPT-4.1 Mini');
    expect(catalogTitle({id:'x-ai/grok-4.7', catalog:{name:'SpaceXAI: Grok 4.7'}})).toBe('Grok 4.7');
    expect(catalogTitle({id:'qiniu/conatus-free', catalog:{name:'Qiniu: Conatus Free'}})).toBe('Conatus Free');
  });
});
