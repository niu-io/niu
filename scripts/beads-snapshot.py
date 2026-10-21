#!/usr/bin/env python3
"""Refresh the portable Beads issue snapshot without inferred owner emails."""

import json
from pathlib import Path
import subprocess
import tempfile


def main():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ['bd', 'export'], cwd=root, check=True, capture_output=True, text=True,
    )
    issues = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    for issue in issues:
        # Beads infers this email from local Git configuration. Keep it local.
        issue.pop('owner', None)
    issues.sort(key=lambda issue: issue['id'])
    destination = root / '.beads' / 'issues.jsonl'
    with tempfile.NamedTemporaryFile(
        mode='w', encoding='utf-8', dir=destination.parent, delete=False,
    ) as temporary:
        temporary_path = Path(temporary.name)
        for issue in issues:
            temporary.write(json.dumps(issue, ensure_ascii=False, sort_keys=True) + '\n')
    temporary_path.replace(destination)
    print(f'Exported {len(issues)} issues to .beads/issues.jsonl (owner emails omitted).')


if __name__ == '__main__':
    main()
