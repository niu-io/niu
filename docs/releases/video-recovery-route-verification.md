# Video recovery identity checkpoint

Partial V05/V18/V20 foundation. No live video transport or release gate is qualified.

Migrations 0116–0117 preserve the pre-dispatch Supplier credential configuration, model revision, upstream model, schema revision, adapter and API base. The pin is immutable and contains no plaintext credentials. Internal recovery resolution returns the original upstream job with the current encrypted credential only when the pinned configuration still matches and remains enabled. Credential rotation, model revision changes, model reassignment and disabling the model block recovery; this does not yet implement qualified safe rotation.

New job insertion requires its scoped schema pin. The database automatically claims the upstream reference uniquely within the pinned Supplier credential configuration, preventing a second attempt from adopting the same job. An unsuccessful claim rolls back the new job. Historical records created before recovery pins remain evidence; missing pins are not reconstructed from current configuration.

The internal recovery context has neither Debug nor Serialize. It is not a customer API response. Tests cover persistence, workspace/company isolation, duplicate and concurrent bindings, direct database bypass attempts, credential replacement and model changes. Polling observations still cannot initiate generation, debit the account or release a hold.

Verification passed: 127 storage tests across 23 groups on fresh PostgreSQL through migration 0117, followed by all four focused job tests after the final reassignment fix. Clippy with warnings denied, the locked gateway build check and public-boundary checks passed. These fixtures establish internal storage behavior only.

Remaining acceptance: dispatch-time revalidation and authorization, actual adapter support, transport destination validation, authenticated response observations, bounded polling/restart workers, safe qualified rotation, result retention, timing and accounting integration. Returning a route context is not an atomic network dispatch guarantee. No paid video request has been made by these tests.
