import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentationAudience, documentationNavigation, publicNavigationActive } from '../src/navigation.ts';

test('documentation navigation exposes unified Docs, API, and SDK sections', () => {
  assert.deepEqual(
    documentationNavigation.map((item) => item.label),
    ['Docs', 'API', 'SDK'],
  );
});

test('agent audience retains explicit machine contracts and their index', () => {
  for (const path of [
    '/docs/agents/',
    '/docs/agents/install/',
    '/docs/agents/inference/',
    '/docs/llms.txt',
    '/docs/install.md',
    '/docs/agents.md',
    '/docs/inference.md',
    '/docs/pools.md',
    '/docs/routing.md',
    '/docs/agents/routing.md',
    '/docs/evaluations.md',
    '/docs/events.md',
  ]) {
    assert.equal(documentationAudience(path), 'agent', path);
  }
});

test('human audience retains tutorials and optional product references', () => {
  for (const path of [
    '/docs/',
    '/docs/getting-started/',
    '/docs/guides/mcp/',
    '/docs/configuration/models/',
    '/docs/admin/',
  ]) {
    assert.equal(documentationAudience(path), 'human', path);
  }
});

test('unified Docs navigation activates Docs across overview, guides, and agent contracts', () => {
  for (const path of [
    '/docs/',
    '/docs/getting-started/',
    '/docs/agents/',
    '/docs/agents/install/',
    '/docs/configuration/models/',
  ]) {
    assert(publicNavigationActive(path, 'Docs'), path);
    assert(!publicNavigationActive(path, 'API'), path);
    assert(!publicNavigationActive(path, 'SDK'), path);
  }
  assert(publicNavigationActive('/docs/api/rest/', 'API'));
  assert(!publicNavigationActive('/docs/api/rest/', 'Docs'));
  assert(publicNavigationActive('/docs/api/sdk/', 'SDK'));
  assert(!publicNavigationActive('/docs/api/sdk/', 'Docs'));
  assert(!publicNavigationActive('/docs/compare/', 'Docs'));
});
