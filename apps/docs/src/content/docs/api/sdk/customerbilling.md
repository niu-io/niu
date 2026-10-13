---
title: "CustomerBilling"
description: "Generated TypeScript declaration for CustomerBilling"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerBilling = {
    balances: Array<{
        currency: string;
        charged_nanos: string;
        unbilled_nanos: string;
        due_nanos: string;
        paid_nanos: string;
    }>;
    unresolved: string;
    unpriced: string;
    tariffs: CustomerTariff[];
    invoices: Array<{
        id: string;
        from_ms: number;
        to_ms: number;
        currency: string;
        amount_nanos: string;
        created_at: string;
        status: 'issued' | 'paid';
        payment_reference: string | null;
    }>;
};
```
