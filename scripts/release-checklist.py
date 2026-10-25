#!/usr/bin/env python3
"""Refresh the permanent release checklist from Beads; never infer a pass from test suites."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess


def read(*args):
    return json.loads(subprocess.check_output(['bd', *args, '--json'], text=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--parent', default='niu-4do')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'docs/release-checklist.md')
    parser.add_argument('--check', action='store_true', help='Exit nonzero unless every required case is GREEN for the candidate')
    args = parser.parse_args()
    parent = read('show', args.parent)[0]
    gate = parent.get('metadata', {}).get('release_gate', {})
    required, candidate = gate.get('required_cases', []), gate.get('candidate', {})
    if not required or len(set(required)) != len(required) or set(candidate) != {'core', 'website', 'composition'}:
        raise SystemExit('Invalid or missing release-gate scope/candidate; release blocked')
    children = read('list', '--parent', args.parent, '--all', '--limit', '0')
    grouped = {}
    for child in children:
        code = child.get('metadata', {}).get('case_id')
        if code: grouped.setdefault(code, []).append(child)
    rows = []
    for code in required:
        found = grouped.get(code, [])
        if len(found) != 1:
            rows.append((code, 'MISSING' if not found else 'DUPLICATE', None)); continue
        child = found[0]
        meta = child.get('metadata', {})
        result = meta.get('result', 'UNTESTED')
        if result not in {'GREEN', 'RED', 'BLOCKED', 'UNTESTED'}: result = 'UNVERIFIED'
        if result == 'GREEN':
            evidence = meta.get('evidence', [])
            valid = evidence and all(isinstance(e, dict) and e.get('kind') == 'hosted-e2e' and all(e.get(k) for k in ('at', 'summary', 'artifact', 'reference')) for e in evidence)
            if meta.get('candidate') != candidate: result = 'STALE'
            elif child['status'] != 'closed' or not valid: result = 'UNVERIFIED'
        rows.append((code, result, child))
    extra = set(grouped) - set(required)
    eligible = all(r == 'GREEN' for _, r, _ in rows) and not extra
    counts = Counter(r for _, r, _ in rows)
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    text = ['# Release checklist', '',
        'This is the permanent release acceptance entry point for Niu. Keep this path stable across releases. Execution state and ownership live in Beads; this document is its generated, reviewable view, not a separate backlog.', '',
        '## Execution procedure', '',
        '1. Identify the live immutable core, website and composition revisions. Record them on the release-gate parent before executing acceptance. A changed candidate invalidates prior GREEN evidence.',
        '2. Claim each required case in Beads and execute its complete acceptance scope against the actual hosted candidate with fresh inputs. Prefer free upstream models and bounded test workspaces; distinguish simulated payment settlement from real merchant settlement.',
        '3. Independently inspect the final artifacts: saved responses, downloaded bytes, persisted settings, request logs and applicable ledger entries. Record timestamp, inputs, observed outcome, artifact verification and evidence reference. Fixture-test outcomes have zero evidentiary value.',
        '4. Search existing findings before publishing a reproducible defect in the owning GitHub repository. Link the finding to the bead. Keep credentials, private identifiers and customer information out of public evidence.',
        '5. Mark GREEN and close a case only when its entire acceptance scope is verified for the candidate. Record partial progress in Beads notes; partial success remains non-green. Fixes require deployed regression verification.',
        '6. Refresh this document and evaluate the gate with the command below. Exit 0 means every required case has qualifying GREEN evidence; nonzero blocks release. This command validates recorded evidence; it does not execute the product journeys or replace review of the evidence.', '',
        '```sh', 'python3 scripts/release-checklist.py --check', '```', '',
        'For a new release, preserve historical evidence in Beads, update the candidate and re-execute required cases. Use `--parent` for a replacement release-gate epic; never shrink scope merely to obtain GREEN.', '',
        '## Current execution', '',
        'Last generated: '+now+'.', '',
        '**Release decision: '+('ELIGIBLE' if eligible else 'NOT ELIGIBLE')+'**', '',
        'Generated read-only snapshot of Beads `'+args.parent+'`. Edit evidence and execution state in Beads, then regenerate. This report does not run tests.', '',
        'All required items must be GREEN for the actual candidate. RED, BLOCKED, UNTESTED, missing, duplicate, stale or unverified evidence blocks release. A closed bug or passing fixture suite cannot establish GREEN. Scope may not be removed to manufacture a pass.', '',
        'Candidate: '+', '.join(f'{k} `{v}`' for k,v in candidate.items())+'.', '',
        'Counts: '+', '.join(f'{k} {v}' for k,v in sorted(counts.items()))+f'; required {len(required)}.', '',
        '| Check | Result | Journey | Bead |', '| --- | --- | --- | --- |']
    for code,result,child in rows:
        text.append(f'| {"[x]" if result == "GREEN" else "[ ]"} {code} | {result} | {child["title"].removeprefix(code+" ") if child else "Missing evidence"} | {child["id"] if child else "—"} |')
    if extra: text += ['', 'Unexpected checklist cases also block release: '+', '.join(sorted(extra))]
    if gate.get('run_summary'):
        text += ['', '## Dated run record', '', gate['run_summary']]
    text += ['', '## Acceptance and evidence']
    for code,result,child in rows:
        if not child: continue
        text += ['', f'### {code} — {child["title"].removeprefix(code+" ")}', '', child.get('acceptance_criteria', ''), '']
        for e in child.get('metadata', {}).get('evidence', []):
            text.append(f'- {e.get("at", "Undated")}: {e.get("summary", "")} Independent artifact: {e.get("artifact", "unverified")}. Reference: {e.get("reference", "none")}.')
        if not child.get('metadata', {}).get('evidence'): text.append('No qualifying current-candidate evidence recorded.')
        if child.get('notes'):
            text += ['', '**Execution notes (partial progress does not establish GREEN):**', '', child['notes']]
    content = '\n'.join(text)+'\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(content)
    print(json.dumps({'release_eligible': eligible, 'required': len(required), 'counts': dict(counts), 'snapshot': str(args.output) if args.output else None}))
    if args.check and not eligible: raise SystemExit(1)


if __name__ == '__main__': main()
