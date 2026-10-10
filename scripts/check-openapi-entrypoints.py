#!/usr/bin/env python3
"""Check root visibility of registered routes in selected frontend contracts.

This reads the repository's two-space path-key convention, not arbitrary YAML.
It checks inventory coverage only, not method/schema or runtime correctness.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FOCUSED_CONTRACTS = (
    'password-sessions.openapi.yaml',
    'billing.openapi.yaml',
    'provider-business.openapi.yaml',
    'platform-configuration.openapi.yaml',
    'key-spending.openapi.yaml',
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
    if missing:
        raise SystemExit('Registered frontend operations missing from root OpenAPI:\n' + '\n'.join(missing))
    print(f'Root OpenAPI exposes {len(checked)} registered paths from selected frontend contracts.')


if __name__ == '__main__':
    main()
