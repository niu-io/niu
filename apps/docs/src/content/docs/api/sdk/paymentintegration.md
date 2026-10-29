---
title: "PaymentIntegration"
description: "Generated TypeScript declaration for PaymentIntegration"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type PaymentIntegration = {
    id: 'epay' | 'stripe' | 'zhifux';
    name: string;
    configuration: 'administration_api' | 'server_environment' | 'server_file';
    checkout: boolean;
    signed_notifications: boolean;
    query_recovery: 'unsupported' | 'bound_session' | 'saved_order';
    /** Local checkout configuration only; no merchant or payment qualification. */
    checkout_enabled: boolean;
    /** Deployment method identifiers; company currency eligibility is separate. */
    enabled_methods: string[];
    /** Whether this adapter can initiate refunds. */
    refunds: boolean;
};
```
