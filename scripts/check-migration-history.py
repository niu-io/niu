#!/usr/bin/env python3
"""Reject edits to released migrations before building upgrade artifacts."""
import argparse
import re
from pathlib import Path

LEGACY_PREFIX = b'-- @niu-legacy-migration '


def extract_squashed_legacy(sql_bytes: bytes) -> dict[str, bytes]:
    pos = 0
    extracted: dict[str, bytes] = {}
    while pos < len(sql_bytes):
        if not sql_bytes.startswith(LEGACY_PREFIX, pos):
            break
        line_end = sql_bytes.find(b'\n', pos)
        if line_end < 0:
            break
        meta = sql_bytes[pos + len(LEGACY_PREFIX):line_end].decode('utf-8')
        parts = meta.split(' ')
        if len(parts) != 2:
            break
        name, length_str = parts
        length = int(length_str)
        sql_start = line_end + 1
        sql_end = sql_start + length
        extracted[name] = sql_bytes[sql_start:sql_end]
        pos = sql_end + 1
    return extracted


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

    squashed_legacy: dict[str, bytes] = {}
    baseline_file = current / '0001_initial_schema.sql'
    if baseline_file.is_file():
        squashed_legacy = extract_squashed_legacy(baseline_file.read_bytes())

    for old in old_files:
        new = current / old.name
        old_bytes = old.read_bytes()
        if new.is_file():
            if old_bytes != new.read_bytes():
                errors.append(f'released migration changed: {old.name}')
        elif old.name in squashed_legacy:
            if old_bytes != squashed_legacy[old.name]:
                errors.append(f'released migration changed inside 0001_initial_schema.sql: {old.name}')
        else:
            errors.append(f'released migration removed or renamed: {old.name}')
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
