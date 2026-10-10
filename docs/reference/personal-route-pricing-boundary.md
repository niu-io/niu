# Personal route pricing boundary

Owner-funded credentials are distinct from commercial supply. Personal inference
already rejects non-null commercial route pricing before dispatch. Model creation
and edits now reject that configuration at save, rather than accepting a model
which will later fail to run. Initial personal-owner assignment also conflicts
when any model on the credential has route pricing, including disabled models.
Explicitly clear those prices before assigning personal ownership.

The storage methods coordinate on the credential row: model publication holds a
shared lock before checking ownership, while ownership assignment holds an
exclusive lock before inspecting model prices. Concurrent operations cannot both
commit incompatible settings through these methods. Rejected writes preserve
model revisions and audit history. The existing dispatch check remains in place.
This change does not rewrite existing model data, assign ownership automatically,
change encryption identity or qualify a commercial offer. For a legacy conflicting
configuration, an administrator can explicitly set pricing to null.

## Current-input verification

Before the fix, a real installation API call on a temporary unconnected credential
assigned personal ownership and then saved a priced model with HTTP 200.
Independent PostgreSQL inspection confirmed both states. No inference was made;
the temporary configuration was cleared and disabled.

After rebuilding and restarting the gateway with the existing database identity:

- Personal ownership followed by priced model creation or editing was rejected;
  PostgreSQL confirmed no created model or revision increment from rejected writes.
- A priced model followed by personal-owner assignment was rejected; no ownership
  row was created. Explicit price removal then allowed the assignment.
- Four concurrent model-publication/ownership-assignment runs each admitted only
  one conflicting operation. PostgreSQL contained no personal-owned priced model
  for those credentials after either ordering.
- Attempt, customer balance entry and Supplier earning counts were unchanged.
  Temporary models and credentials were disabled after inspection.

Compilation, all-target gateway Clippy, formatting, OpenAPI YAML parsing and public
boundary checks completed. Fixture outcomes were not used as evidence. These are
configuration and concurrency checks, not procurement-budget, customer-funded
billing or Supplier payout verification. Personal calls remain outside those
commercial accounting paths.
