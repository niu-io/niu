---
title: "KeyIntrospection"
description: "Generated TypeScript declaration for KeyIntrospection"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type KeyIntrospection = {
    label: string;
    allowed_models: string[];
    expires_at_ms: number | null;
    last_used_at_ms: number | null;
    revoked: boolean;
    expired: boolean;
    spending_limits: Array<{
        currency: string;
        limit_nanos: string | null;
        committed_nanos: string;
        remaining_nanos: string | null;
    }>;
    request_rate_limit: {
        requests_per_minute: number | null;
    };
    token_rate_limit: {
        snapshot_at: string;
        known_tokens: string;
        reserved_tokens: string;
        unbounded_requests: number;
        committed_tokens: string | null;
        tokens_per_minute: number | null;
    };
    concurrency_limit: {
        active_requests: number;
        max_concurrent_requests: number | null;
    };
    token_usage_window: {
        window_seconds: 60;
        window_end: string;
        requests: number;
        known_usage_requests: number;
        unknown_usage_requests: number;
        known_prompt_tokens: string;
        known_completion_tokens: string;
    };
    ip_policy: {
        allowed_cidrs: string[] | null;
    };
};
```
