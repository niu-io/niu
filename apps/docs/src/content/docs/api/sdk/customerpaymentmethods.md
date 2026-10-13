---
title: "CustomerPaymentMethods"
description: "Generated TypeScript declaration for CustomerPaymentMethods"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerPaymentMethods = {
    currency: string;
    available: boolean;
    payment_methods: string[];
    /** Selected integration; forward with currency to bind initiation to discovery. */
    payment_gateway: 'epay' | 'stripe' | 'zhifux' | null;
    unavailable_reason: 'integration_unavailable' | 'currency_account_missing' | null;
};
```
