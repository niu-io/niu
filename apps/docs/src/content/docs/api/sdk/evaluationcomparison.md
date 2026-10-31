---
title: "EvaluationComparison"
description: "Generated TypeScript declaration for EvaluationComparison"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type EvaluationComparison = {
    left: string;
    right: string;
    same_task_protocol_and_rubric: boolean;
    same_evaluator: boolean;
    quality_comparable: boolean;
    matched_verified_samples: number;
    shared_operations: number;
    left_unmatched_samples: number;
    right_unmatched_samples: number;
    left_summary: EvaluationSummary;
    right_summary: EvaluationSummary;
};
```
