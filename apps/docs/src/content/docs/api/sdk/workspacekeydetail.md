---
title: "WorkspaceKeyDetail"
description: "Generated TypeScript declaration for WorkspaceKeyDetail"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspaceKeyDetail = WorkspaceKey & {
    spending_limits: KeySpendingAccount[];
    request_rate_limit: KeyRequestRateLimit;
    token_rate_limit: KeyTokenRateLimit;
    concurrency_limit: KeyConcurrencyLimit;
    token_usage_window: KeyTokenUsageWindow;
    ip_policy: KeyIpPolicy;
};
```
