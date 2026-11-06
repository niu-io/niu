---
title: "ProviderSettlementPreview"
description: "Generated TypeScript declaration for ProviderSettlementPreview"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ProviderSettlementPreview = {
    currency: string;
    from_ms: number | null;
    cutoff_ms: number;
    entry_count: number;
    amount_nanos: string;
    remaining_unpaid_nanos: string;
    remaining_entry_count: number;
};
```
