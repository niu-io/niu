---
title: "GuardrailOutputTest"
description: "Generated TypeScript declaration for GuardrailOutputTest"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GuardrailOutputTest = {
    mode?: 'buffered_full' | 'observe_only';
    protocol: 'chat' | 'responses';
    rules: GuardrailInputTest['rules'];
    response: unknown;
};
```
