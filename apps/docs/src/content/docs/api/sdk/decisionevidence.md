---
title: "DecisionEvidence"
description: "Generated TypeScript declaration for DecisionEvidence"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type DecisionEvidence = {
    outcome: 'decided' | 'abstained';
    model: string;
    calls: 1;
    input_tokens: number | null;
    output_tokens: number | null;
    /** True when either count is a character-based estimate, not exact tokenization. */
    tokens_estimated: boolean;
    latency_ms: number;
    timeout_ms: number;
    max_output_tokens: number;
};
```
