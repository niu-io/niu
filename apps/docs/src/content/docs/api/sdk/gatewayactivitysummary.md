---
title: "GatewayActivitySummary"
description: "Generated TypeScript declaration for GatewayActivitySummary"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GatewayActivitySummary = {
    /** Reported subsets only; coverage counts prevent treating partial sums as complete totals. */
    token_categories: {
        cache_write_input_tokens: string | null;
        cache_write_input_requests: number;
        cache_write_input_unknown_requests: number;
        cached_input_tokens: string | null;
        cached_input_requests: number;
        cached_input_unknown_requests: number;
        reasoning_output_tokens: string | null;
        reasoning_output_requests: number;
        reasoning_output_unknown_requests: number;
    };
    charges_by_model: Array<GatewayChargeSummary & {
        model_alias: string;
    }>;
    charges_by_key: Array<GatewayChargeSummary & {
        api_key_id: string | null;
        key_name: string | null;
    }>;
    delivery_statuses: Array<{
        http_status: number | null;
        request_count: number;
    }>;
    latency_percentiles: {
        boundary: 'gateway_body_ms';
        sample_count: number;
        p50_ms: number | null;
        p95_ms: number | null;
        p99_ms: number | null;
    };
    request_histogram: Array<{
        start_ms: number;
        end_ms: number;
        request_count: number;
    }>;
    request_count: number;
    usage_count: number;
    prompt_tokens: string;
    completion_tokens: string;
    /** Completed gateway body-consumption totals only; missing/incomplete timing is excluded. */
    timing_count: number;
    average_duration_ms: number | null;
    unresolved_customer_charge_count: number;
    unpriced_request_count: number;
    owner_funded_request_count: number;
    customer_charges: Array<{
        currency: string;
        amount_nanos: string;
        charged_requests: number;
    }>;
    usage_by_model: Array<GatewayUsageSummary & {
        model_alias: string;
    }>;
    usage_by_key: Array<GatewayUsageSummary & {
        api_key_id: string | null;
        key_name: string | null;
    }>;
};
```
