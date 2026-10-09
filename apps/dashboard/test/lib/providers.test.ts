import { describe, expect, it } from 'vitest';
import { connectionIdentity, identifyProvider, modelIdentity, providers } from '../../src/lib/providers';

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
