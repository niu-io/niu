---
title: "CustomerTopupInput"
description: "Generated TypeScript declaration for CustomerTopupInput"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

[SDK source](https://github.com/niu-io/niu/blob/release/0.4/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerTopupInput = {
    /** Required in Credits mode; forbidden for a new currency-mode checkout. */
    quote_id?: string;
    currency?: string;
    /** Use the gateway returned by payment-method discovery. Stripe handles new hosted orders; legacy values support historical replay. */
    payment_gateway?: 'epay' | 'stripe' | 'zhifux';
    amount_nanos: string;
    payment_method: string;
    idempotency_key: string;
};
```
