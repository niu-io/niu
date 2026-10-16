---
title: "WorkspaceKeyUpdateInput"
description: "Generated TypeScript declaration for WorkspaceKeyUpdateInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspaceKeyUpdateInput = {
    name?: string;
    allowed_models?: string[];
    expected_revision?: number;
    spending_limit?: WorkspaceKeySpendingLimitPatch;
    request_rate_limit?: WorkspaceKeyRequestRateLimitPatch;
    token_rate_limit?: WorkspaceKeyTokenRateLimitPatch;
    concurrency_limit?: WorkspaceKeyConcurrencyLimitPatch;
    ip_policy?: WorkspaceKeyIpPolicyPatch;
};
```
