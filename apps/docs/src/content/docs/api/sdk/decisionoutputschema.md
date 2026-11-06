---
title: "DecisionOutputSchema"
description: "Generated TypeScript declaration for DecisionOutputSchema"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type DecisionOutputSchema = {
    type: 'object';
    /** 1-16 flat properties. Nested objects, arrays and null are unsupported. */
    properties: Record<string, DecisionPropertySchema>;
    /** At least one declared property; closed output rejects unknown fields. */
    required: string[];
    additionalProperties: false;
};
```
