---
title: "KeyIntrospection"
description: "Generated TypeScript declaration for KeyIntrospection"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type KeyIntrospection = {
    object: 'api_key';
    label: string;
    allowed_models: string[];
    /** Unix milliseconds; null means no automatic expiration. */
    expires_at_ms: number | null;
    /** Last recorded dispatch in Unix milliseconds. */
    last_used_at_ms: number | null;
    revoked: boolean;
    expired: boolean;
    spending_limits: Array<{
        currency: string;
        limit_nanos: string | null;
        committed_nanos: string;
        remaining_nanos: string | null;
    }>;
    rate_limits: {
        requests_per_minute: number | null;
        tokens_per_minute: number | null;
        max_concurrent_requests: number | null;
        active_requests: number;
    };
    usage_window: {
        window_seconds: 60;
        window_end: string;
        requests: number;
        known_usage_requests: number;
        unknown_usage_requests: number;
        known_prompt_tokens: string;
        known_completion_tokens: string;
    };
    allowed_cidrs: string[] | null;
};
```
