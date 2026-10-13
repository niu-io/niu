---
title: "ExternalUsageV1"
description: "Generated TypeScript declaration for ExternalUsageV1"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/execution.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ExternalUsageV1 = {
    authority: 'agent_reported_estimate';
    agent_version: string | null;
    request_count: number;
    retry_count: number;
    input_tokens: string | null;
    output_tokens: string | null;
    cache_read_tokens: string | null;
    cache_creation_tokens: string | null;
    cost_nanos: string | null;
    currency: string | null;
};
```
