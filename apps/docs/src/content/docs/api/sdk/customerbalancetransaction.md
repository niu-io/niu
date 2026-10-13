---
title: "CustomerBalanceTransaction"
description: "Generated TypeScript declaration for CustomerBalanceTransaction"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Append-only company ledger entry; signed currency nanounits remain exact strings. */
export type CustomerBalanceTransaction = {
    id: string;
    kind: 'funding' | 'charge' | 'refund' | 'funding_reversal' | 'adjustment';
    currency: string;
    amount_nanos: string;
    created_at: string;
    reverses_entry_id: string | null;
};
```
