---
title: "CustomerChargeReconciliation"
description: "Generated TypeScript declaration for CustomerChargeReconciliation"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerChargeReconciliation = {
    currency: string;
    observed_at: string;
    charge_records: string;
    /** Completed prepaid-bound attempts awaiting a charge record; not proof of missing money. */
    completed_unaccrued_attempts: string;
    expected_charge_nanos: string;
    posted_charge_nanos: string;
    missing_charge_entries: string;
    mismatched_charge_entries: string;
    unexpected_charge_entries: string;
    duplicate_charge_sources: string;
    settled_open_reservations: string;
};
```
