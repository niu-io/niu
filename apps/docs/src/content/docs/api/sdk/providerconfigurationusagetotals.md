---
title: "ProviderConfigurationUsageTotals"
description: "Generated TypeScript declaration for ProviderConfigurationUsageTotals"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Exact decimal strings avoid loss of precision in aggregated counters. */
export interface ProviderConfigurationUsageTotals {
    requests: string;
    completed: string;
    execution_unknown: string;
    known_token_usage_requests: string;
    unknown_token_usage_requests: string;
    prompt_tokens: string;
    completion_tokens: string;
    failures: string;
    observed_timing_requests: string;
    complete_timing_requests: string;
    /** Complete HTTP delivery durations only, not asynchronous job duration. */
    complete_total_ms: string | null;
}
```
