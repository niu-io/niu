---
title: "WorkspaceAutoDecider"
description: "Generated TypeScript declaration for WorkspaceAutoDecider"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
/**
 * Optional single-round semantic decider. Every dimension is explicit and
 * bounded. Its customer price must be comparable in `currency`; otherwise no
 * paid call is made and the failure action applies.
 */
export type WorkspaceAutoDecider = {
    model: string;
    currency: string;
    timeout_ms: number;
    max_calls: 1;
    max_input_tokens: number;
    max_output_tokens: number;
    max_spend_nanos: number;
    min_confidence: number;
    on_abstain?: 'fallback' | 'reject';
    on_failure?: 'fallback' | 'reject';
};
```
