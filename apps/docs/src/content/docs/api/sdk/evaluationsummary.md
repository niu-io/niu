---
title: "EvaluationSummary"
description: "Generated TypeScript declaration for EvaluationSummary"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Immutable attributed evidence; unknown fields remain forward compatible. */
export type EvaluationSummary = {
    samples: number;
    verified_inputs: number;
    unverified_inputs: number;
    verdicts: Partial<Record<'accepted' | 'rejected' | 'unknown', number>>;
    attempts: number;
    unknown_charge_attempts: number;
    customer_charge_totals: Array<{
        dimension: string;
        amount: string;
    }>;
    cost_per_accepted: {
        dimension: string;
        numerator: string;
        denominator: number;
    } | null;
    cost_per_accepted_basis: 'all_attempts_in_submitted_operations';
    duration_basis: 'evaluated_attempt_only';
};
```
