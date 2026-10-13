---
title: "ChatGenerationsBranch"
description: "Generated TypeScript declaration for ChatGenerationsBranch"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/generations-sessions.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ChatGenerationsBranch = {
    model?: string;
    content?: string;
    elapsedMs?: number;
    /** Saved comparison phase, not authoritative execution status or cancellation. */
    phase?: 'connecting' | 'streaming' | 'complete' | 'failed' | 'cancelled';
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    error?: string | null;
    customerChargeNanos?: string | null;
    customerChargeCurrency?: string | null;
    customerChargeStatus?: 'charged' | 'owner_funded' | 'pending' | 'unpriced' | 'not_charged' | 'unknown';
    task: ChatGenerationsTaskReference | null;
};
```
