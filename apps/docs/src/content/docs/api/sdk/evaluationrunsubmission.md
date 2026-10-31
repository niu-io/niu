---
title: "EvaluationRunSubmission"
description: "Generated TypeScript declaration for EvaluationRunSubmission"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type EvaluationRunSubmission = {
    slug: string;
    name: string;
    evaluation_revision: number;
    evaluator: {
        kind: 'agent' | 'check';
        name: string;
        version: string;
    };
    results: Array<{
        sample: string;
        attempt_id: string;
        verdict: 'accepted' | 'rejected' | 'unknown';
        reason?: string | null;
    }>;
};
```
