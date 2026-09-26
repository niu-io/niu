#!/usr/bin/env python3
"""Verify metadata-only observation against a running local gateway.

Creates an explicitly named verification organization and two projects; deletes only
its own imported fixture. No inference or provider requests are performed.
"""
import copy
import json
import os
from pathlib import Path
import urllib.error
import urllib.request
from uuid import uuid4
from import_execution import endpoint, NoRedirect


def verify(base, token):
    endpoint(base, str(uuid4()), str(uuid4()))  # Validate origin before sending credentials.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(method, path, payload=None, expected=(200, 201)):
        data = None if payload is None else json.dumps(payload).encode()
        req = urllib.request.Request(base.rstrip('/') + path, data=data, method=method,
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        try:
            response = opener.open(req, timeout=30)
        except urllib.error.HTTPError as error:
            if error.code in expected:
                return None
            raise RuntimeError(f'{method} failed with HTTP {error.code}') from None
        with response:
            if response.status not in expected:
                raise RuntimeError(f'Unexpected HTTP {response.status}')
            body = response.read()
            return json.loads(body) if body else None

    org = request('POST', '/admin/v1/organizations', {'name': 'Observation acceptance ' + str(uuid4())})['id']
    prefix = '/admin/v1/organizations/' + org + '/projects'
    project = request('POST', prefix, {'name': 'Fixture observation'})['id']
    other = request('POST', prefix, {'name': 'Isolation check'})['id']
    scope = prefix + '/' + project
    fixture = json.loads((Path(__file__).resolve().parents[1] / 'contracts/fixtures/parallel-task.v1.json').read_text())
    fixture['record_id'] = 'acceptance-' + str(uuid4())
    first = request('POST', scope + '/execution-imports', fixture)
    record = first['id']
    try:
        again = request('POST', scope + '/execution-imports', fixture)
        assert again['id'] == record and not again['created'], 'Import was not idempotent'
        conflict = copy.deepcopy(fixture)
        conflict['coverage'] = 'unknown'
        request('POST', scope + '/execution-imports', conflict, expected=(409,))
        detail = request('GET', scope + '/executions/' + record)
        assert detail['charges']['task_total_complete'] is False, 'Incomplete cost was presented as complete'
        request('GET', prefix + '/' + other + '/executions/' + record, expected=(404,))
        print('PASS: import, idempotency, conflict rejection, retrieval, incomplete-cost handling, cross-project isolation')
    finally:
        request('DELETE', scope + '/executions/' + record, expected=(204,))
    request('GET', scope + '/executions/' + record, expected=(404,))
    print('PASS: imported fixture deletion; verification organization/projects retained')


if __name__ == '__main__':
    token = os.environ.get('NIU_ADMIN_TOKEN', '')
    if not token:
        raise SystemExit('Set NIU_ADMIN_TOKEN; it is never printed.')
    verify(os.environ.get('NIU_GATEWAY_URL', 'http://127.0.0.1:2555'), token)
