---
title: "WorkspacePoolDecisionEvidence"
description: "Generated TypeScript declaration for WorkspacePoolDecisionEvidence"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspacePoolDecisionEvidence = {
    outcome: 'context_match' | 'decider_selected' | 'decider_required' | 'priority_weight_fallback' | 'rejected' | 'cancelled';
    path: string | null;
    fallback_reason: string | null;
    failure: string | null;
    calls: number;
    input_tokens: number | null;
    output_tokens: number | null;
    latency_ms: number;
    /** True when the upstream did not report usage and counts are estimates. */
    tokens_estimated: boolean;
    estimated_customer_charge_nanos: string | null;
    /** Present on preview evidence: preview never dispatches inference. */
    live_dispatch?: false;
    compatible_paths?: string[];
    decider?: {
        configured: true;
        model: string;
        currency: string;
        max_calls: number;
        max_input_tokens: number;
        max_output_tokens: number;
        max_spend_nanos: string;
        timeout_ms: number;
        min_confidence: number;
        prompt_estimated_tokens?: number;
        maximum_estimated_charge_nanos?: string;
        would_reject: boolean;
    };
};
```
