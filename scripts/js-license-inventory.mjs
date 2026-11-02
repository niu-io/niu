import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Inventory the installed dependency graph, independent of pnpm's disposable store indexes. */
export function installedLicenseGroups(roots) {
  const groups = {};
  const seen = new Set();
  const workspacePaths = new Set(roots.map(root => root.path));
  function visit(node, optional = false) {
    if (!node.path) return;
    let manifest;
    try { manifest = JSON.parse(readFileSync(join(node.path, 'package.json'), 'utf8')); }
    catch (error) { if (optional && error.code === 'ENOENT') return; throw error; }
    if (!seen.has(node.path)) {
      seen.add(node.path);
      if (!workspacePaths.has(node.path)) {
        const license = typeof manifest.license === 'string' ? manifest.license : manifest.license?.type ?? 'UNKNOWN';
        if (!manifest.name || !manifest.version) throw new Error('Installed dependency has incomplete package metadata');
        (groups[license] ??= []).push({name: manifest.name, versions: [manifest.version], license});
      }
    }
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, dependency] of Object.entries(node[field] ?? {})) visit(dependency, field === 'optionalDependencies' || Object.hasOwn(manifest.optionalDependencies ?? {}, name));
    }
  }
  for (const root of roots) visit(root);
  return groups;
}
