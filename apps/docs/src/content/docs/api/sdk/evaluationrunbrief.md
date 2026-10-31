---
title: "EvaluationRunBrief"
description: "Generated TypeScript declaration for EvaluationRunBrief"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type EvaluationRunBrief = {
    slug: string;
    name: string;
    evaluation_revision: number;
    created_at: string;
    evaluator: EvaluationRunSubmission['evaluator'];
    summary: EvaluationSummary;
};
```
