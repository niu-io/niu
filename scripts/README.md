# Explicit execution metadata import

Requires Python 3.10 or newer; no external packages. This imports a selected Niu v1 JSON export into an existing project. It does not discover agent files, read account credentials, convert arbitrary provider logs or replay model requests.

Set NIU_ADMIN_TOKEN using your normal secret-management workflow, then run:

```sh
python3 scripts/import_execution.py path/to/execution.json --organization YOUR_ORGANIZATION_UUID --project YOUR_PROJECT_UUID
```

The default origin is http://127.0.0.1:2555. Use --url for a remote HTTPS gateway. HTTP is allowed only on loopback. Redirects are rejected and environment HTTP proxies are not used. --token-env selects another environment variable; token values are never command-line arguments or printed by the script.

Exports follow the [execution observation contract](../docs/architecture/execution-observation.md). Only metadata belongs in these files. The gateway performs full schema and graph validation. The parallel-task fixture in contracts/fixtures is a synthetic example, not a source connector. The importer prints the stable import ID; the admin API can retrieve or delete it. Identical re-imports are idempotent; conflicting source/record identities fail.

This is the first supported import path. Collection from specific external agent products remains unimplemented. Credentials and source exports should remain outside the public repository.

Run transport tests with:

```sh
python3 -m unittest discover -s scripts/tests -v
```
