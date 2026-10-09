#!/usr/bin/env python3
"""Qualify a copied dashboard source snapshot using existing locked dependencies.

Never invokes a package manager, installs dependencies, loads dev configuration,
or changes the running development service. Results describe the captured
snapshot, not later worktree edits or rendered/live workflow acceptance.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

DIRECTORIES = (
    'apps/dashboard/src', 'apps/dashboard/test', 'apps/dashboard/public',
    'apps/docs/src', 'branding/assets', 'sdks/javascript/src', 'contracts/fixtures',
)
FILES = (
    'branding/tokens.css', 'branding/product-rail.css',
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
    'apps/dashboard/package.json', 'apps/dashboard/vite.config.ts',
    'apps/dashboard/tsconfig.json', 'apps/dashboard/index.html',
    'apps/docs/package.json', 'sdks/javascript/package.json',
)
DEPENDENCIES = ('node_modules', 'apps/dashboard/node_modules', 'apps/docs/node_modules')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def capture(repo, target):
    """Copy explicit public inputs only. Dependency links are read-only reuse."""
    repo, target = repo.resolve(), target.resolve()
    manifest = {}
    for name in DIRECTORIES:
        source = repo / name
        if not source.is_dir():
            raise RuntimeError(f'Missing qualification directory: {name}')
        for path in sorted(source.rglob('*')):
            if path.is_symlink() and not path.resolve().is_relative_to(repo / 'branding/assets'):
                raise RuntimeError('Qualification source links must resolve to branded assets')
            if not path.is_file():
                continue
            relative = path.relative_to(repo)
            destination = target / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            # The manifest describes bytes actually copied, including when the
            # original worktree changes while capture is in progress.
            destination.write_bytes(path.read_bytes())
            manifest[str(relative)] = digest(destination)
    for name in FILES:
        source = repo / name
        if not source.is_file() or source.is_symlink():
            raise RuntimeError(f'Missing or linked qualification file: {name}')
        destination = target / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(source.read_bytes())
        manifest[name] = digest(destination)
    for name in DEPENDENCIES:
        source = repo / name
        if not source.is_dir():
            raise RuntimeError('Install locked repository dependencies before qualification')
        (target / name).symlink_to(source, target_is_directory=True)
    return manifest


def changed_inputs(target, manifest):
    return [name for name, expected in manifest.items()
            if not (target / name).is_file() or digest(target / name) != expected]


def dependency_receipts(repo):
    paths = [repo / 'pnpm-lock.yaml', repo / 'node_modules/.modules.yaml']
    return {str(path.relative_to(repo)): digest(path) for path in paths}


def qualify(repo, output, workers):
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node.js is required')
    vitest = repo / 'apps/dashboard/node_modules/vitest/vitest.mjs'
    typescript = repo / 'apps/dashboard/node_modules/typescript/bin/tsc'
    if not vitest.is_file() or not typescript.is_file():
        raise RuntimeError('Install locked repository dependencies before qualification')
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    before_dependencies = dependency_receipts(repo)
    environment = {name: os.environ[name] for name in
                   ('PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'SYSTEMROOT')
                   if name in os.environ}
    with tempfile.TemporaryDirectory(prefix='niu-dashboard-qualification-') as temporary:
        target = Path(temporary)
        manifest = capture(repo, target)
        encoded = json.dumps(manifest, sort_keys=True).encode()
        (output / 'inputs.json').write_bytes(encoded)
        cwd = target / 'apps/dashboard'
        results = {}
        for name, command in (
            ('tests', [node, str(vitest), 'run', f'--maxWorkers={workers}']),
            ('types', [node, str(typescript), '-b', '--pretty', 'false']),
        ):
            with (output / f'{name}.log').open('w') as log:
                results[name] = subprocess.run(command, cwd=cwd, env=environment,
                                              stdout=log, stderr=subprocess.STDOUT).returncode
        changed = changed_inputs(target, manifest)
        after_dependencies = dependency_receipts(repo)
        report = {
            'source_manifest_sha256': hashlib.sha256(encoded).hexdigest(),
            'source_files': len(manifest), 'exit_codes': results,
            'changed_snapshot_inputs': changed,
            'dependency_receipts': before_dependencies,
            'dependencies_unchanged': before_dependencies == after_dependencies,
            'qualified_snapshot': not changed and before_dependencies == after_dependencies
                                  and all(code == 0 for code in results.values()),
            'scope': 'dashboard automated tests and type checking; no live/rendered acceptance',
        }
        (output / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
        return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True,
                        help='New private output directory outside the repository')
    parser.add_argument('--workers', type=int, choices=range(1, 5), default=2)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    output = args.output.resolve()
    if output == repo or repo in output.parents:
        parser.error('Qualification logs must stay outside the public repository')
    report = qualify(repo, output, args.workers)
    print(json.dumps(report, indent=2))
    return 0 if report['qualified_snapshot'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
