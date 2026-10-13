---
title: "FinancialRecoveryDiagnostics"
description: "Generated TypeScript declaration for FinancialRecoveryDiagnostics"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Last committed worker page, not settlement or backlog status. */
export interface FinancialRecoveryDiagnostics {
    observed_at: string;
    data: Array<{
        stage: 'balance_release' | 'customer_charge' | 'customer_media_charge' | 'media_completion' | 'supplier_earning' | 'upstream_cost';
        last_step_at: string | null;
        last_candidate_count: number | null;
        last_failure_count: number | null;
        has_cursor: boolean;
    }>;
}
```
