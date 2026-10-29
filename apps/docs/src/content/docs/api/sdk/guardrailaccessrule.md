---
title: "GuardrailAccessRule"
description: "Generated TypeScript declaration for GuardrailAccessRule"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GuardrailAccessRule = {
    mode: 'inherit' | 'allow_all' | 'deny_all';
} | {
    mode: 'allow_list';
    values: string[];
};
```
