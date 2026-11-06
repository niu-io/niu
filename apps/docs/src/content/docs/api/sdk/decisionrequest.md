---
title: "DecisionRequest"
description: "Generated TypeScript declaration for DecisionRequest"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type DecisionRequest = {
    /** Concrete workspace Chat model with declared structured-output support. */
    model: string;
    /** UTF-8 string or JSON object; at most 16 KiB serialized. */
    input: string | Record<string, unknown>;
    output_schema: DecisionOutputSchema;
    /** 50-5000; default 2000. A timeout is not a decision and may have incurred charges. */
    timeout_ms?: number;
    /** 1-1024; default 128. */
    max_output_tokens?: number;
};
```
