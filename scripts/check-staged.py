#!/usr/bin/env python3
"""Check the exact staged tree without touching the working tree or index."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def affects_rust(path):
    return (
        path.endswith(('.rs', '/Cargo.toml', '/rustfmt.toml', '/.rustfmt.toml'))
        or path in {'Cargo.toml', 'rustfmt.toml', '.rustfmt.toml',
                    '.githooks/pre-commit', 'scripts/check-staged.py'}
        or path.startswith('.cargo/')
    )


def main():
    root = Path(run('git', 'rev-parse', '--show-toplevel', capture_output=True, text=True).stdout.strip())
    run('git', 'diff', '--cached', '--check', cwd=root)
    result = run('git', 'diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRD', cwd=root, capture_output=True)
    paths = (os.fsdecode(path) for path in result.stdout.split(b'\0') if path)
    if not any(affects_rust(path) for path in paths):
        print('No staged Rust workspace changes; formatting check skipped.')
        return

    print('Checking staged Rust workspace formatting with the CI toolchain...', flush=True)
    with tempfile.TemporaryDirectory(prefix='niu-staged-') as directory:
        # checkout-index reads staged content, including partially staged files.
        run('git', 'checkout-index', '--all', '--prefix=' + directory + '/', cwd=root)
        env = os.environ.copy()
        # Git invokes hooks with repository-specific variables. Do not let them
        # point Cargo or its subprocesses back at the caller's worktree/index.
        for key in list(env):
            if key.startswith('GIT_'):
                del env[key]
        run('cargo', '+1.98.0', 'fmt', '--all', '--', '--check', cwd=directory, env=env)


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        print('Staged checks failed; fix and stage the relevant changes before committing.', file=sys.stderr)
        sys.exit(error.returncode or 1)
    except FileNotFoundError as error:
        print(f'Staged checks could not start: {error}. See CONTRIBUTING.md for prerequisites.', file=sys.stderr)
        sys.exit(1)
