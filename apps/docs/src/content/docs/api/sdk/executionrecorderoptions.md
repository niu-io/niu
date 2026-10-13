---
title: "ExecutionRecorderOptions"
description: "Generated TypeScript declaration for ExecutionRecorderOptions"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/execution.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ExecutionRecorderOptions = {
    source: string;
    recordId?: string;
    taskId?: string;
    coverage?: ExecutionCoverage;
    /** Injected clock and ID source make collectors deterministic in tests. */
    now?: () => number;
    createId?: () => string;
};
```
