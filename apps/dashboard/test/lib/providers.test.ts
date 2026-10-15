import { describe, expect, it } from 'vitest';
import { connectionIdentity, identifyProvider, modelIdentity, modelDeveloper, modelProviderName, providers } from '../../src/lib/providers';

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
    expect(providers.length).toBe(40);
    for (const provider of providers) expect(provider.logo).toMatch(/(?:\.svg|^data:image\/svg\+xml)/);
  });
});

describe('model developer and provider boundaries', () => {
  it('resolves model families behind routing and BYOK namespaces', () => {
    expect(modelIdentity({id:'fastrouter/seedance-2.0-mini'}).name).toBe('ByteDance');
    expect(modelIdentity({id:'byok/gpt-4.1-mini'}).name).toBe('OpenAI');
    expect(modelIdentity({id:'byok/private',upstream_model:'openrouter/anthropic/claude-sonnet-4'}).name).toBe('Anthropic');
    expect(modelIdentity({id:'fastrouter/seedream-4'}).name).toBe('ByteDance');
  });
  it('does not fabricate developers from arbitrary aliases or providers', () => {
    for(const id of ['byok/private','fastrouter/custom','my-team/private-model','fastrouter','byok']) {
      expect(modelDeveloper({id})).toBeUndefined();
      expect(modelIdentity({id}).id).toBe('other');
    }
    expect(modelDeveloper({id:'openai/private',upstream_model:'anthropic/claude-sonnet-4'})?.id).toBe('anthropic');
  });
  it('keeps access mode and identifiers out of provider names', () => {
    expect(modelProviderName({provider:'byok'})).toBeUndefined();
    expect(modelProviderName({provider:' BYOK '})).toBeUndefined();
    expect(modelProviderName({provider:'00000000-0000-0000-0000-000000000001'})).toBeUndefined();
    expect(modelProviderName({provider:'fastrouter'})).toBe('FastRouter');
    expect(modelProviderName({provider:'openrouter'})).toBe('OpenRouter');
    expect(modelProviderName({provider:'Team inference'})).toBe('Team inference');
  });
});
