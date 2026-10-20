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
    /** Budget snapshot fields are absent if the key disappears during enrichment. */
    token_rate_limit: Pick<KeyTokenRateLimit, 'tokens_per_minute' | 'revision'> & Partial<Omit<KeyTokenRateLimit, 'tokens_per_minute' | 'revision'>>;
    concurrency_limit: KeyConcurrencyLimit;
    token_usage_window: KeyTokenUsageWindow | null;
    ip_policy: KeyIpPolicy;
};
```
