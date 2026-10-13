---
title: "CustomerBalanceReservation"
description: "Generated TypeScript declaration for CustomerBalanceReservation"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Open holds are not charges and are not evidence that inference can be retried. */
export type CustomerBalanceReservation = {
    attempt_id: string;
    workspace_id: string;
    workspace_name: string;
    api_key_id: string | null;
    api_key_name: string | null;
    model: string;
    currency: string;
    reserved_nanos: string;
    outstanding_nanos: string;
    execution: string;
    usage_confidence: string;
    created_at: string;
    observed_at: string;
    status: 'preparing' | 'in_progress' | 'execution_unknown' | 'usage_unknown' | 'settlement_pending';
    /** Pinned customer tariff requirements. Null means unavailable; empty does not mean settled. */
    missing_usage_categories: ('cached_input_tokens' | 'cache_write_input_tokens' | 'reasoning_output_tokens')[] | null;
};
```
