---
title: "GenerationView"
description: "Generated TypeScript declaration for GenerationView"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GenerationView = {
    id: string;
    model: string;
    provider_model: string | null;
    request_kind: 'video' | 'inference';
    created_at: string;
    dispatched_at: string | null;
    completed_at: string | null;
    duration_ms: number | null;
    execution: string;
    usage_confidence: string;
    usage: {
        prompt_tokens: string | null;
        completion_tokens: string | null;
        cached_input_tokens: string | null;
        cache_write_input_tokens: string | null;
        reasoning_output_tokens: string | null;
    };
    finish_reasons: Array<{
        index: number;
        reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call';
    }> | null;
    timing: {
        dispatch_ms: number | null;
        headers_ms: number | null;
        first_output_ms: number | null;
        total_ms: number;
        complete: boolean;
        http_status: number | null;
    } | null;
    customer_charge: {
        status: 'charged' | 'owner_funded' | 'pending' | 'unpriced' | 'not_charged';
        currency: string | null;
        amount_nanos: string | null;
    };
    output_guardrail_outcome: 'allowed' | 'redacted' | 'blocked' | 'indeterminate' | null;
    failure: {
        kind: 'upstream_http_error' | 'upstream_region_unavailable' | 'upstream_timeout' | 'upstream_connection_error' | 'upstream_transport_error' | 'upstream_invalid_response' | 'response_stream_cancelled';
        upstream_http_status: number | null;
        transport_phase?: 'connection' | 'request' | null;
    } | null;
};
```
