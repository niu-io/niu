---
title: "ExecutionRecordV1"
description: "Generated TypeScript declaration for ExecutionRecordV1"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/execution.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ExecutionRecordV1 = {
    schema_version: 1;
    source: string;
    record_id: string;
    task_id: string;
    coverage: ExecutionCoverage;
    spans: ExecutionSpanV1[];
    links: ExecutionLinkV1[];
    outcomes: ExecutionOutcomeV1[];
    external_usage?: ExternalUsageV1;
};
```
