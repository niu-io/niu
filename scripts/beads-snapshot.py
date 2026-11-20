#!/usr/bin/env python3
"""Refresh the public Beads snapshot, excluding private issues and owner emails."""

import json
import re
from pathlib import Path
import subprocess
import tempfile


# Render deployment, service and database identifiers belong in the live tracker.
RENDER_RESOURCE_ID = re.compile(r'\b(?:dep|srv|dpg)-[a-z0-9]{14,}(?:-[a-z0-9]+)*\b')


LOCAL_EVIDENCE_PATH = re.compile(r"/tmp/niu-[\w./-]*[\w-]")
HOSTED_ORIGIN = re.compile(r"\bniu-staging\.onrender\.com\b")


def main():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ['bd', 'export'], cwd=root, check=True, capture_output=True, text=True,
    )
    issues = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    issues = [issue for issue in issues if 'private' not in (issue.get('labels') or [])]
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
            line = json.dumps(issue, ensure_ascii=False, sort_keys=True)
            line = RENDER_RESOURCE_ID.sub('[internal resource reference omitted]', line)
            line = LOCAL_EVIDENCE_PATH.sub('[local evidence path omitted]', line)
            line = HOSTED_ORIGIN.sub('[staging origin omitted]', line)
            temporary.write(line + '\n')
    temporary_path.replace(destination)
    print(f'Exported {len(issues)} issues to .beads/issues.jsonl (private issues and owner emails omitted).')


if __name__ == '__main__':
    main()
