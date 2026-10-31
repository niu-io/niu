---
title: "EvaluationReceipt"
description: "Generated TypeScript declaration for EvaluationReceipt"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type EvaluationReceipt = {
    slug: string;
    name: string;
    evaluation: string;
    evaluation_revision: number;
    definition: EvaluationDefinition;
    evaluator: EvaluationRunSubmission['evaluator'];
    submitter: {
        kind: 'delegated_agent_key';
        label: string;
        key_id: string;
    };
    capture: {
        consistency: 'repeatable_read';
        started_at: string;
        finished_at: string;
    };
    results: Array<{
        sample: string;
        request_sha256: string;
        input_match: 'verified' | 'unverified';
        source_binding: Record<string, unknown> | null;
        evaluated_attempt_id: string;
        operation_id: string;
        judgment: {
            verdict: 'accepted' | 'rejected' | 'unknown';
            reason: string | null;
            source: 'submitter_reported';
        };
        duration_ms: number | null;
        attempts: Array<{
            attempt_id: string;
            model: string;
            provider_model: string | null;
            execution: string;
            duration_ms: number | null;
            customer_charge: {
                status: string;
                currency: string | null;
                amount_nanos: string | null;
                unit: Record<string, unknown> | null;
            };
            [key: string]: unknown;
        }>;
        pool_selections: Array<{
            slug: string;
            revision: number;
            selected_model: string;
        }>;
    }>;
    summary: EvaluationSummary;
};
```
