---
title: "GatewayTaskEvidence"
description: "Generated TypeScript declaration for GatewayTaskEvidence"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GatewayTaskEvidence = {
    execution_id: string;
    source: string;
    record_id: string;
    coverage: 'complete' | 'partial' | 'unknown';
    outcomes: GatewayActivityOutcome[];
};
```
