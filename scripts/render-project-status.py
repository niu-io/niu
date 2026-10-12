#!/usr/bin/env python3
"""Validate and render the fixed delivery board; this is not runtime verification."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/releases/project-status.json'
TARGET = ROOT / 'docs/releases/project-status.md'
STATUSES = {'open', 'active', 'blocked', 'done', 'delegated', 'deferred'}


def render():
    data = json.loads(SOURCE.read_text())
    assert any(c['version'] == data['version'] and c['reason'] for c in data['scope_changes']), 'Missing versioned scope reason'
    subs = data['subsystems']
    identifiers = {s['id'] for s in subs}
    assert len(identifiers) == len(subs), 'Duplicate subsystem ID'
    tasks = [t for s in subs for t in s['tasks']]
    assert len({t['id'] for t in tasks}) == len(tasks), 'Duplicate task ID'
    for s in subs:
        assert s['status'] in STATUSES
        assert set(s['dependencies']) <= identifiers
        assert s['id'] not in s['dependencies']
        if all(t['status'] == 'done' for t in s['tasks']):
            assert s['status'] == 'done', 'All accepted items must close their subsystem'
        if s['status'] == 'done':
            assert all(t['status'] == 'done' for t in s['tasks'])
        for path in s['paths']:
            assert (ROOT / path).exists(), path
        for t in s['tasks']:
            assert t['status'] in STATUSES
            if t['status'] == 'done':
                assert t['evidence'] and t['evidence_revision'], t['id']
            for path in t['evidence']:
                assert (ROOT / path).is_file(), path
    graph = {s['id']: s['dependencies'] for s in subs}

    def visit(node, stack):
        assert node not in stack, 'Cyclic dependency'
        for child in graph[node]:
            visit(child, stack | {node})

    for node in graph:
        visit(node, set())
    assert set(data['active_implementation_tasks']) <= {t['id'] for t in tasks}
    core = [s for s in subs if s['lane'] in {'A', 'B', 'C', 'I'}]
    core_tasks = [t for s in core for t in s['tasks']]
    done = sum(t['status'] == 'done' for t in core_tasks)
    closed = sum(s['status'] == 'done' for s in core)
    lines = [
        '# Project delivery status', '',
        f"Baseline v{data['version']}; updated {data['updated']}.",
        f"Committed audit source `{data['source_commit'][:8]}`; native implementation `{data['runtime_commit'][:8]}`.", '',
        '**Backend acceptance checkpoints: ' + str(done) + '/' + str(len(core_tasks)) + ' recorded complete at their evidence pins.**',
        '**Whole backend subsystems closed: ' + str(closed) + '/' + str(len(core)) + '.**',
        'These are acceptance-checkpoint counts, not coding percentage, fresh execution of every path or release readiness.',
        'Existing scoped evidence is carried forward explicitly. Missing evidence remains open; fixture outcomes have zero signal.', '',
        'Source of truth: [project-status.json](project-status.json). Scope changes require a versioned reason; they cannot silently change the denominator.',
        'Status meanings: open = unfinished; active = explicitly assigned current work; blocked = identified dependency prevents progress; done = every stated criterion has evidence; delegated/deferred = separate ownership or excluded scope.',
        'This assessment assigns no new implementation task as active. The next implementation assignment must record its stable task ID.', '',
        '| Subsystem | Owner lane | Status | Completed checks | Dependencies |',
        '| --- | --- | --- | ---: | --- |',
    ]
    for s in subs:
        n = sum(t['status'] == 'done' for t in s['tasks'])
        lines.append(f"| {s['id']} {s['name']} | {s['lane']} | {s['status']} | {n}/{len(s['tasks'])} | {', '.join(s['dependencies']) or 'None'} |")
    lines += ['', '## Fixed acceptance items', '']
    for s in subs:
        lines += [f"### {s['id']} — {s['name']}", '', '| ID | Status | Acceptance | Evidence pin |', '| --- | --- | --- | --- |']
        for t in s['tasks']:
            evidence = ', '.join(f"[record](../../{p})" for p in t['evidence']) or 'Missing / not yet accepted'
            if t['evidence_revision']:
                evidence += f" (`{t['evidence_revision'][:8]}`)"
            lines.append(f"| {t['id']} | {t['status']} | {t['acceptance']} | {evidence} |")
        lines += ['']
    lines += [
        '## Update discipline', '',
        '- Change the JSON status and evidence together, then regenerate this page.',
        '- A subsystem closes only when all its fixed items are done. Keep broader product acceptance separate from a bounded completed checkpoint.',
        '- Reopen a completed item only with contrary actual evidence, recording the regression and affected revision.',
        '- New work gets a new ID and scope-version entry; existing completion criteria do not grow silently.',
        '- Lane I owns integration and shared contract/migration publication. Other lanes submit isolated changes and do not edit each other\'s files.',
        '',
        'Run `python3 scripts/render-project-status.py --check` for board/link consistency only. It does not establish business correctness.',
    ]
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = render()
    if args.check:
        assert TARGET.read_text() == result, 'Run renderer to update the board'
        print('Delivery board consistent; no runtime or fixture acceptance claim.')
    else:
        TARGET.write_text(result)
        print('Rendered delivery board from the fixed source of truth.')
