---
title: "GatewayChargeSummary"
description: "Generated TypeScript declaration for GatewayChargeSummary"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GatewayChargeSummary = {
    currency: string | null;
    amount_nanos: string | null;
    request_count: number;
    charged_requests: number;
    unresolved_requests: number;
    owner_funded_requests: number;
    unpriced_requests: number;
    not_charged_requests: number;
};
```
