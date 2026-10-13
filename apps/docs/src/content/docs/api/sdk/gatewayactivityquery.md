---
title: "GatewayActivityQuery"
description: "Generated TypeScript declaration for GatewayActivityQuery"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GatewayActivityQuery = {
    limit?: number;
    after?: string;
    fromMs?: number;
    toMs?: number;
    sort?: 'time_desc' | 'time_asc' | 'latency_desc' | 'input_desc' | 'output_desc';
    modelAlias?: string;
    operationId?: string;
    apiKeyId?: string;
    httpStatus?: number | 'unknown';
    status?: 'not_sent' | 'may_have_executed' | 'confirmed_completed' | 'confirmed_not_executed' | 'output_withheld' | 'delivery_failed' | 'recorded_failure';
};
```
