import { readFileSync } from 'node:fs';
import { ok } from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { filterPublicHandlerOperations } from './openapi-navigation.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
for (const file of ['index.html', 'reference/api/index.html', 'reference/handler-operations/index.html', 'releases/first-release/index.html']) {
  ok(read(`../dist/${file}`).includes('<html'), `Missing HTML entrypoint: ${file}`);
}

const contracts = [
  ['handler-operations.json', filterPublicHandlerOperations(JSON.parse(read('../../../contracts/generated/handler-operations.json')))],
  ['public.json', JSON.parse(read('../../../contracts/generated/public-openapi.json'))],
];
for (const [file, expected] of contracts) {
  const actual = JSON.parse(read(`../dist/openapi/${file}`));
  // Compare actual build output, without formatting a multi-megabyte assertion diff.
  ok(isDeepStrictEqual(actual, expected), `${file}: built contract differs from its public source`);
  ok(Object.keys(actual.paths ?? {}).length > 0, `${file}: no published paths`);
  for (const path of Object.keys(actual.paths)) {
    ok(!/^\/(?:admin\/v1(?:\/|$)|api\/v1\/(?:vendors|providers|suppliers|settlements|audit-events)(?:\/|$))/.test(path), `${file}: administrative path published: ${path}`);
  }
  const inspect = value => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string') {
      ok(value.$ref.startsWith('#/'), `${file}: unbundled reference: ${value.$ref}`);
      const target = value.$ref.slice(2).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))
        .reduce((node, part) => node?.[part], actual);
      ok(target !== undefined, `${file}: unresolved reference: ${value.$ref}`);
    }
    Object.values(value).forEach(inspect);
  };
  inspect(actual);
  console.log(`Verified built ${file}: ${Object.keys(actual.paths).length} public paths and resolved local references`);
}
