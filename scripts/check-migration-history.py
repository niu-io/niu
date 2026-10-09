#!/usr/bin/env python3
"""Reject edits to released migrations before building upgrade artifacts."""
import argparse
import re
from pathlib import Path


def check_history(previous: Path, current: Path) -> list[str]:
    errors = []
    old_files = sorted(previous.glob('*.sql'))
    if not old_files:
        return ['previous migration history is missing or empty']
    for directory, files in [('previous', old_files), ('current', sorted(current.glob('*.sql')))]:
        seen = set()
        for migration in files:
            match = re.fullmatch(r'(\d+)_.+\.sql', migration.name)
            version = int(match.group(1)) if match else 0
            if version < 1 or version in seen:
                errors.append(f'{directory} migration has invalid or duplicate version: {migration.name}')
            seen.add(version)
    if errors:
        return errors
    for old in old_files:
        new = current / old.name
        if not new.is_file():
            errors.append(f'released migration removed or renamed: {old.name}')
        elif old.read_bytes() != new.read_bytes():
            errors.append(f'released migration changed: {old.name}')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('previous', type=Path)
    parser.add_argument('current', type=Path)
    args = parser.parse_args()
    errors = check_history(args.previous, args.current)
    if errors:
        for error in errors:
            print(error)
        raise SystemExit(1)
    print('Released migration history is unchanged.')


if __name__ == '__main__':
    main()
