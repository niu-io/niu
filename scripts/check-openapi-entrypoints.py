#!/usr/bin/env python3
"""Check root visibility of registered routes in selected frontend contracts.

This reads the repository's two-space path-key convention, not arbitrary YAML.
It checks selected path coverage and generated method visibility, not schemas or runtime correctness.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FOCUSED_CONTRACTS = (
    'password-sessions.openapi.yaml',
    'billing.openapi.yaml',
    'provider-business.openapi.yaml',
    'platform-configuration.openapi.yaml',
    'key-spending.openapi.yaml',
    'key-ip.openapi.yaml',
    'key-request-rate.openapi.yaml',
    'key-concurrency.openapi.yaml',
    'key-token-rate.openapi.yaml',
    'request-observability.openapi.yaml',
)


def path_keys(source):
    paths = re.findall(r'^  (/[^\n]+):$', source, re.M)
    if not paths or len(paths) != len(set(paths)):
        raise SystemExit('Expected nonempty, unique two-space OpenAPI path keys')
    return set(paths)


def generated_method_visible(file, path, method, generated_file, seen=None):
    """Follow the repository's block-style PathItem/Operation references.

    This intentionally supports only our path/method layout, not general YAML.
    Unknown layouts fail closed rather than being reported as exposed.
    """
    file = file.resolve()
    identity = (file, path, method)
    seen = set() if seen is None else seen
    if identity in seen:
        raise SystemExit(f'Circular OpenAPI path reference: {path}')
    seen = seen | {identity}
    if file == generated_file.resolve():
        return method in json.loads(file.read_text())['paths'].get(path, {})
    source = file.read_text()
    match = re.search(r'^  ' + re.escape(path) + r':\n(.*?)(?=^  /|^\S|\Z)', source, re.M | re.S)
    if not match:
        return False
    body = match.group(1)
    path_ref = re.search(r"^    \$ref: ['\"]([^'\"]+)['\"]\s*$", body, re.M)
    if path_ref:
        reference = path_ref.group(1)
    else:
        operation = re.search(r'^    ' + re.escape(method) + r':\n(.*?)(?=^    \S|\Z)', body, re.M | re.S)
        if not operation:
            return False
        ref = re.search(r"^      \$ref: ['\"]([^'\"]+)['\"]\s*$", operation.group(1), re.M)
        # A copied inline operation is not linked to the generated source of truth.
        if not ref:
            return False
        reference = ref.group(1)
    target, separator, pointer = reference.partition('#')
    parts = [part.replace('~1', '/').replace('~0', '~') for part in pointer.split('/')[1:]]
    if not separator or len(parts) not in (2, 3) or parts[0] != 'paths':
        return False
    if len(parts) == 3 and parts[2] != method:
        return False
    if parts[1] != path:
        return False
    target_file = file.parent / target if target else file
    return generated_method_visible(target_file, path, method, generated_file, seen)


def main():
    routes = set(re.findall(
        r'\.route\(\s*"([^"\n]+)"',
        (ROOT / 'apps/gateway/src/web/routes.rs').read_text(),
    ))
    root_paths = path_keys((ROOT / 'contracts/openapi.yaml').read_text())
    missing = []
    checked = set()
    for name in FOCUSED_CONTRACTS:
        registered = path_keys((ROOT / 'contracts' / name).read_text()) & routes
        checked.update(registered)
        missing.extend(f'{name}: {path}' for path in sorted(registered - root_paths))
    generated = json.loads((ROOT / 'contracts/generated/handler-operations.json').read_text())
    generated_paths = set(generated['paths'])
    checked.update(generated_paths)
    missing.extend(f'handler annotations: {path}' for path in sorted(generated_paths - root_paths))
    generated_file = ROOT / 'contracts/generated/handler-operations.json'
    for path, operations in generated['paths'].items():
        for method in operations:
            if not generated_method_visible(ROOT / 'contracts/openapi.yaml', path, method, generated_file):
                missing.append(f'generated source not reachable: {method.upper()} {path}')
    if missing:
        raise SystemExit('Registered frontend operations missing from root OpenAPI:\n' + '\n'.join(missing))
    print(f'Root OpenAPI exposes {len(checked)} registered paths and {sum(len(v) for v in generated["paths"].values())} generated methods.')


if __name__ == '__main__':
    main()
