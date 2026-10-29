---
title: "RequestUsageReconciliation"
description: "Generated TypeScript declaration for RequestUsageReconciliation"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type RequestUsageReconciliation = {
    status: 'recorded';
    source_version: 'openrouter-native-generation-v1' | 'openrouter-native-generation-v2';
    original_execution: 'confirmed_completed' | 'may_have_executed';
    upstream_finish_reason: 'stop' | 'length' | 'tool_calls' | null;
    upstream_cancelled: false | null;
    recorded_at: string;
    prompt_tokens: string;
    completion_tokens: string;
    cached_input_tokens: string | null;
    reasoning_output_tokens: string | null;
    cache_write_input_tokens: null;
};
```
