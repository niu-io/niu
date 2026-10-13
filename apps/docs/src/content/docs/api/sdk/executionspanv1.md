---
title: "ExecutionSpanV1"
description: "Generated TypeScript declaration for ExecutionSpanV1"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/execution.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ExecutionSpanV1 = {
    id: string;
    kind: ExecutionSpanKind;
    status?: ExecutionSpanStatus;
    started_at_ms: number | null;
    ended_at_ms: number | null;
    requested_model: string | null;
    reported_model: string | null;
    charge_ref: string | null;
};
```
