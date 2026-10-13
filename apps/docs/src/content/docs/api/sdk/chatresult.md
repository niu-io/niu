---
title: "ChatResult"
description: "Generated TypeScript declaration for ChatResult"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ChatResult = {
    model: string;
    content: string;
    elapsedMs: number;
    phase: 'connecting' | 'streaming' | 'complete' | 'failed' | 'cancelled';
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    attemptId?: string | null;
    error?: string | null;
    customerChargeNanos?: string | null;
    customerChargeCurrency?: string | null;
    customerChargeStatus?: 'charged' | 'owner_funded' | 'pending' | 'unpriced' | 'not_charged' | 'unknown';
};
```
