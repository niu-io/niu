# API design review evidence

Captured on 2026-10-20 for the [second API design review](api-design-review.md),
then rerun after the additive SDK/contract fixes on the same date.
Run these commands from the repository root. They read local contracts and use
an injected fetch implementation; they do not send model requests or exercise
backend authorization. Fixture outcomes establish SDK behavior only.

## Contract inventory

```sh
python3 - <<'PY'
import json

spec = json.load(open("contracts/generated/public-openapi.json"))
methods = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}

def resolve(value):
    if "$ref" not in value:
        return value
    assert value["$ref"].startswith("#/")
    result = spec
    for part in value["$ref"][2:].split("/"):
        result = result[part.replace("~1", "/").replace("~0", "~")]
    return resolve(result)

operations = [
    (path, method, operation, item)
    for path, item in spec["paths"].items()
    for method, operation in item.items()
    if method in methods
]
required_query = []
with_headers = []
for path, method, operation, item in operations:
    parameters = {}
    for raw in item.get("parameters", []) + operation.get("parameters", []):
        parameter = resolve(raw)
        parameters[(parameter["in"], parameter["name"])] = parameter
    if any(p["in"] == "query" and p.get("required") for p in parameters.values()):
        required_query.append((method, path))
    if any(
        resolve(response).get("headers")
        for code, response in operation.get("responses", {}).items()
        if str(code).startswith("2")
    ):
        with_headers.append((method, path))

print(json.dumps({
    "paths": len(spec["paths"]),
    "operations": len(operations),
    "operations_with_required_query": len(required_query),
    "operations_with_success_response_headers": len(with_headers),
}, indent=2))
PY
```

Before implementation: `267` paths, `354` operations, `44` operations with
required query parameters and `45` with at least one declared success-response
header. After implementation: the same path/operation/query counts and **48**
operations declaring success-response headers.
The header count does not mean that all relevant headers are documented.
The old generator omitted those required queries. The updated generator and
its tests cover all 44; the inventory alone does not inspect shell examples.

## SDK metadata and streaming probes

```sh
pnpm build:sdk:js
node --input-type=module <<'JS'
import {
  NiuClient, NiuAdminClient, NiuAuthClient, NiuAPIError,
} from './sdks/javascript/dist/index.js';

const counts = { inference: 0, admin: 0, auth: 0 };
const attempt = '11111111-1111-4111-8111-111111111111';
const json = body => async () => Response.json(body, {
  headers: { 'x-request-id': 'review-request', 'x-niu-attempt-id': attempt },
});
await new NiuClient({
  apiKey: 'review-fixture', fetch: json({ data: [] }),
}).models.list({ onResponse: () => counts.inference++ });
await new NiuAdminClient({
  adminToken: 'review-fixture', fetch: json({ data: [], next_cursor: null }),
}).listWorkspacesPage({}, { onResponse: () => counts.admin++ });
await new NiuAuthClient({
  fetch: json({ password_login: true }),
}).getMemberAuthenticationConfiguration({ onResponse: () => counts.auth++ });
console.log(JSON.stringify({ metadataCallbacks: counts }));

const client = new NiuClient({
  apiKey: 'review-fixture',
  fetch: async () => new Response(
    'data: {"error":{"message":"Fixture stream failure","type":"upstream_error"}}\n\n',
    { headers: {
      'content-type': 'text/event-stream', 'x-niu-attempt-id': attempt,
    } },
  ),
});
try {
  for await (const chunk of client.chat.stream({
    model: 'fixture', messages: [{ role: 'user', content: 'fixture' }],
  })) {}
} catch (error) {
  console.log(JSON.stringify({ streamError: {
    name: error.name,
    message: error.message,
    isNiuAPIError: error instanceof NiuAPIError,
    hasResponseBody: 'responseBody' in error,
    hasAttemptId: 'attemptId' in error,
  } }));
}
JS
```

Pre-fix output:

```json
{"metadataCallbacks":{"inference":1,"admin":0,"auth":0}}
{"streamError":{"name":"Error","message":"Fixture stream failure","isNiuAPIError":false,"hasResponseBody":false,"hasAttemptId":false}}
```

The first result confirms R01 for the three exercised methods; inspection of
the remaining admin/auth transport helpers supports the wider finding.
The second confirms R10 for an SSE data event containing `error`. Other protocol
failures are source-inspected, not separately executed by this probe. Neither
probe establishes that a deployed Provider emits this particular fixture.

Post-fix output:

```json
{"metadataCallbacks":{"inference":1,"admin":1,"auth":1}}
{"streamError":{"name":"NiuStreamError","message":"Fixture stream failure","isNiuAPIError":true,"hasResponseBody":true,"hasAttemptId":true}}
```

The regression suite additionally exercises all transport helpers, 204 and
binary responses, callback exceptions, protocol-specific stream failures,
cursor loops, missing continuation, archive/category filters and cancellation.

## Generated-contract freshness

Post-fix API-only snapshot verification (the same extractor and generator commands used by `pnpm check:api`):

```text
Handler annotations: 250 operations; generated contracts are current.
354 REST operations and 378 public SDK exports generated and verified.
```

These are different inventories: the handler annotation count is not the total
public-operation count. The pre-fix freshness check passed with 377 SDK exports
despite R08, R09 and R11. The new documentation tests separately check header
contracts, key schemas, required queries and security examples.

Additional validation:

- `pnpm test:sdk:js`: **203 passed**.
- `pnpm --filter @niu-io/docs test:api`: **3 passed**, including a real curl
  round trip against a local HTTP fixture.
- `pnpm check:dashboard`: passed, including consumers of changed SDK types.
- `git diff --check`: passed.

The test commands using HTTP fixtures require local loopback access. They were
rerun outside the restricted sandbox after `listen EPERM`; no external model
service was contacted. Rust 1.98.0 was later found already installed but outside PATH; Cargo is now
enabled. No Rust build was started. Backend work was deferred for handoff, so
no real billing, tenant-authorization or live migration verification is claimed.

The isolated API-only snapshot also passed `scripts/check-openapi-entrypoints.py`:
209 registered paths and 250 generated methods are exposed by the root contract.
It excludes concurrent currency, payment and dashboard changes. SDK and docs
suites were rerun against that isolated snapshot: 203 and 3 tests passed,
respectively. Existing dependencies were reused; no Rust build was run.
