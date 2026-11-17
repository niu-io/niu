#!/usr/bin/env python3
"""Refresh the permanent release checklist from Beads; never infer a pass from test suites."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess


EVIDENCE_KINDS = {'hosted-e2e', 'native-packaged-e2e', 'linux-packaged-e2e'}


def read(*args):
    return json.loads(subprocess.check_output(['bd', *args, '--json'], text=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--parent', help='Explicit Beads acceptance scope; no historical gate is selected by default')
    parser.add_argument('--output', type=Path, help='Optional generated snapshot; the permanent checklist is never overwritten by default')
    parser.add_argument('--check', action='store_true', help='Exit 0 for eligible, 1 for recorded blockers, 2 for incomplete assessment')
    args = parser.parse_args()

    def incomplete(reason):
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text('# Release assessment\n\n**ASSESSMENT INCOMPLETE**\n\n'+reason+'\n\nNo product failure or release acceptance is established by this result.\n')
        print(json.dumps({'decision': 'ASSESSMENT_INCOMPLETE', 'release_eligible': False,
                          'reason': reason, 'parent': args.parent,
                          'snapshot': str(args.output) if args.output else None}))
        raise SystemExit(2 if args.check else 0)

    if not args.parent:
        incomplete('No current acceptance scope selected. Use --parent with an explicitly agreed scope and immutable candidate; retired checklists are not current requirements.')
    try:
        parent = read('show', args.parent)[0]
    except (OSError, subprocess.CalledProcessError, ValueError, IndexError):
        incomplete('The selected Beads scope could not be read; current readiness is unverified.')
    if 'release-gate-retired' in parent.get('labels', []):
        incomplete('The selected acceptance scope was retired. Its historical cases do not establish current requirements or product failures. Select an agreed replacement scope.')
    gate = parent.get('metadata', {}).get('release_gate', {})
    required, candidate = gate.get('required_cases', []), gate.get('candidate', {})
    if not required or len(set(required)) != len(required) or set(candidate) != {'core', 'website', 'composition'}:
        incomplete('Invalid or missing release-gate scope/candidate; current readiness is unverified.')
    try:
        children = read('list', '--parent', args.parent, '--all', '--limit', '0')
    except (OSError, subprocess.CalledProcessError, ValueError):
        incomplete('Acceptance records could not be read; current readiness is unverified.')
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
        if meta.get('candidate') != candidate: result = 'STALE'
        if result == 'GREEN':
            evidence = meta.get('evidence', [])
            kinds = meta.get('required_evidence_kinds', ['hosted-e2e'])
            valid_kinds = isinstance(kinds, list) and bool(kinds) and all(k in EVIDENCE_KINDS for k in kinds)
            valid = valid_kinds and evidence and all(isinstance(e, dict) and e.get('kind') in kinds and all(e.get(k) for k in ('at', 'summary', 'artifact', 'reference')) for e in evidence)
            if valid:
                valid = set(kinds).issubset({e['kind'] for e in evidence})
            if child['status'] != 'closed' or not valid: result = 'UNVERIFIED'
        rows.append((code, result, child))
    extra = set(grouped) - set(required)
    inventory = gate.get('issue_inventory', {})
    require_issue_closure = gate.get('require_issue_closure', False)
    inventory_ready = not require_issue_closure or (
        isinstance(inventory, dict) and inventory.get('scope') == 'all-open-issues'
        and type(inventory.get('open_count')) is int and inventory['open_count'] == 0
        and type(inventory.get('repository_count')) is int and inventory['repository_count'] > 0
        and bool(inventory.get('checked_at')) and inventory.get('candidate') == candidate
    )
    eligible = all(r == 'GREEN' for _, r, _ in rows) and not extra and inventory_ready
    decision = 'ELIGIBLE' if eligible else ('BLOCKED' if any(r in {'RED', 'BLOCKED'} for _, r, _ in rows) else 'ASSESSMENT_INCOMPLETE')
    counts = Counter(r for _, r, _ in rows)
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    text = ['# Release checklist', '',
        'This is the permanent release acceptance entry point for Niu. Keep this path stable across releases. Execution state and ownership live in Beads; this document is its generated, reviewable view, not a separate backlog.', '',
        '## Execution procedure', '',
        '1. Identify the live immutable core, website and composition revisions. Record them on the release-gate parent before executing acceptance. A changed candidate invalidates prior GREEN evidence.',
        '2. Claim each required case in Beads and execute its complete acceptance scope against the actual candidate with fresh inputs. Product journeys require hosted evidence. Distribution cases explicitly require native and packaged Linux evidence. Prefer free upstream models and bounded test workspaces; distinguish simulated payment settlement from real merchant settlement.',
        '3. Independently inspect the final artifacts: saved responses, downloaded bytes, persisted settings, request logs and applicable ledger entries. Record timestamp, inputs, observed outcome, artifact verification and evidence reference. Fixture-test outcomes have zero evidentiary value.',
        '4. Search existing findings before publishing a reproducible defect in the owning GitHub repository. Link the finding to the bead. Keep credentials, private identifiers and customer information out of public evidence.',
        '5. Mark GREEN and close a case only when its entire acceptance scope is verified for the candidate. Record partial progress in Beads notes; partial success remains non-green. Fixes require deployed regression verification.',
        '6. Evaluate the explicitly agreed gate with the command below. Exit 0 requires qualifying GREEN evidence for every case and any explicit issue-closure requirement. Exit 1 means recorded RED/BLOCKED cases; exit 2 means an incomplete assessment. Neither nonzero result authorizes promotion, but missing evidence is not a product defect. This command only validates records; it does not execute journeys or fetch GitHub state.', '',
        '```sh', f'python3 scripts/release-checklist.py --parent {args.parent} --check', '```', '',
        'For a new release, preserve historical evidence in Beads, update the candidate and re-execute required cases. Use `--parent` for a replacement release-gate epic; never shrink scope merely to obtain GREEN.', '',
        '## Current execution', '',
        'Last generated: '+now+'.', '',
        '**Release decision: '+decision+'**', '',
        'Generated read-only snapshot of Beads `'+args.parent+'`. Edit evidence and execution state in Beads, then regenerate. This report does not run tests.', '',
        'All required items must be GREEN for the actual candidate. RED/BLOCKED are recorded blockers; UNTESTED, missing, duplicate, stale or unverified records mean assessment is incomplete, not that the product failed. Neither permits promotion. A closed bug or fixture outcome cannot establish GREEN. Explicit scope changes must preserve historical evidence; never shrink scope merely to manufacture a pass.', '',
        'Candidate: '+', '.join(f'{k} `{v}`' for k,v in candidate.items())+'.', '',
        'Counts: '+', '.join(f'{k} {v}' for k,v in sorted(counts.items()))+f'; required {len(required)}.', '',
        '| Check | Result | Journey | Bead |', '| --- | --- | --- | --- |']
    for code,result,child in rows:
        text.append(f'| {"[x]" if result == "GREEN" else "[ ]"} {code} | {result} | {child["title"].removeprefix(code+" ") if child else "Missing evidence"} | {child["id"] if child else "—"} |')
    if extra: text += ['', 'Unexpected checklist cases also block release: '+', '.join(sorted(extra))]
    if require_issue_closure:
        text += ['', '## All-issues scope for this release', '',
            'The user explicitly requires every open GitHub Issue across the project repositories to be resolved, including previously deferred enhancements. REG-01 must re-enumerate the repositories and verify each issue and its numbered acceptance requirements against the final candidate before recording a zero-open inventory. Closing an issue alone is not acceptance evidence.', '',
            f'Inventory checked: {inventory.get("checked_at", "unverified")}. Repositories: {inventory.get("repository_count", "unverified")}. Open issues: {inventory.get("open_count", "unverified")}.', '',
            'Issue-closure gate: '+('satisfied by the candidate-bound recorded inventory.' if inventory_ready else 'NOT SATISFIED. Missing, nonzero or differently pinned inventory blocks release.'), '',
            'Restricted issue references stay in their owning tracker; this public snapshot records only public-safe acceptance requirements.']
    if gate.get('run_summary'):
        text += ['', '## Dated run record', '', gate['run_summary']]
    text += ['', '## Acceptance and evidence']
    for code,result,child in rows:
        if not child: continue
        text += ['', f'### {code} — {child["title"].removeprefix(code+" ")}', '', child.get('acceptance_criteria', ''), '']
        kinds = child.get('metadata', {}).get('required_evidence_kinds', ['hosted-e2e'])
        text += ['Required evidence kinds: '+', '.join(kinds)+'.', '']
        for e in child.get('metadata', {}).get('evidence', []):
            text.append(f'- {e.get("at", "Undated")}: {e.get("summary", "")} Independent artifact: {e.get("artifact", "unverified")}. Reference: {e.get("reference", "none")}.')
        if not child.get('metadata', {}).get('evidence'): text.append('No qualifying current-candidate evidence recorded.')
        if child.get('notes'):
            text += ['', '**Execution notes (partial progress does not establish GREEN):**', '', child['notes']]
    content = '\n'.join(text)+'\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(content)
    print(json.dumps({'decision': decision, 'release_eligible': eligible, 'required': len(required), 'counts': dict(counts), 'snapshot': str(args.output) if args.output else None}))
    if args.check and not eligible: raise SystemExit(1 if decision == 'BLOCKED' else 2)


if __name__ == '__main__': main()
