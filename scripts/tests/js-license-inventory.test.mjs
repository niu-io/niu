import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installedLicenseGroups } from '../js-license-inventory.mjs';
function fixture(run) {
 const root = mkdtempSync(join(tmpdir(), 'niu-license-'));
 function pkg(name, body) { const path = join(root, name); mkdirSync(path); writeFileSync(join(path, 'package.json'), JSON.stringify(body)); return path; }
 try { run(root, pkg); } finally { rmSync(root, {recursive: true, force: true}); }
}
test('audits transitive installed manifests even when pnpm store indexes are absent', () => fixture((root, pkg) => {
 const workspace = pkg('workspace', {name: 'workspace', private: true});
 const dep = pkg('dependency', {name: 'dependency', version: '1.0.0', license: 'MIT'});
 const nested = pkg('nested', {name: 'nested', version: '2.0.0'});
 const groups = installedLicenseGroups([{path: workspace, dependencies: {dependency: {path: dep, dependencies: {nested: {path: nested}}}}}]);
 assert.equal(groups.MIT[0].name, 'dependency');
 assert.equal(groups.UNKNOWN[0].name, 'nested');
 assert.equal(Object.values(groups).flat().length, 2);
}));
test('skips absent platform packages only when their parent declares them optional', () => fixture((root, pkg) => {
 const workspace = pkg('workspace', {name: 'workspace', optionalDependencies: {native: '1'}});
 const absent = join(root, 'absent');
 assert.deepEqual(installedLicenseGroups([{path: workspace, dependencies: {native: {path: absent}}}]), {});
 assert.throws(() => installedLicenseGroups([{path: workspace, dependencies: {required: {path: absent}}}]), {code: 'ENOENT'});
}));
