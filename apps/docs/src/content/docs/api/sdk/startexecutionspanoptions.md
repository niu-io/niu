---
title: "StartExecutionSpanOptions"
description: "Generated TypeScript declaration for StartExecutionSpanOptions"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/execution.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type StartExecutionSpanOptions = {
    parentId?: string;
    /** Optional stable ID for correlating this span with later causal events. */
    id?: string;
    requestedModel?: string;
    reportedModel?: string;
    /** A canonical ledger reference. The recorder never estimates or creates charges. */
    chargeRef?: string;
    cause?: {
        from: string;
        kind: Exclude<ExecutionLinkKind, 'contains'>;
    };
};
```
