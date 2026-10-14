---
title: "GatewayActivityEntry"
description: "Generated TypeScript declaration for GatewayActivityEntry"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GatewayActivityEntry = {
    attempt_id: string;
    operation_id: string;
    /** Absent on older servers; null means no bounded retry policy was selected. */
    retry?: {
        ordinal: number;
        predecessor_attempt_id: string | null;
        maximum_attempts: number;
        policy_revision: string;
    } | null;
    api_key_id: string | null;
    key_name: string | null;
    /** Checked pre-dispatch rejection, separate from upstream failure and billing authority. */
    admission_denial?: GatewayAdmissionDenial | null;
    provider_model: string | null;
    timing: RequestTiming | null;
    task_id: string | null;
    task_evidence: GatewayTaskEvidence | null;
    /** Durable video route identity; absent on older servers. */
    request_kind?: 'video' | 'inference';
    model: string;
    created_at: string;
    dispatched_at: string | null;
    completed_at: string | null;
    /** Legacy dispatch-to-completion interval; null for completion first confirmed by reconciliation. Complete timing.total_ms is the independently observed gateway interval. */
    duration_ms: number | null;
    execution: string;
    /** Recorded output inspection only; null does not establish delivery or protection. */
    output_guardrail_outcome: 'allowed' | 'redacted' | 'blocked' | 'indeterminate' | null;
    usage_confidence: string;
    prompt_tokens: string | null;
    completion_tokens: string | null;
    cache_write_input_tokens: string | null;
    cached_input_tokens: string | null;
    reasoning_output_tokens: string | null;
    /** Explicit terminal observations; Chat choice indexes, or index zero for a
     * whole Responses interruption. Null means unknown, not successful completion. */
    finish_reasons: Array<{
        index: number;
        reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call';
    }> | null;
    customer_charge_currency: string | null;
    customer_charge_nanos: string | null;
    customer_charge_status: 'charged' | 'owner_funded' | 'pending' | 'unpriced' | 'not_charged';
    /** Absent on older servers; null means no recorded classification. */
    failure?: RequestFailure | null;
};
```
