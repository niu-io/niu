---
title: "GuardrailInputTest"
description: "Generated TypeScript declaration for GuardrailInputTest"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GuardrailInputTest = {
    protocol: 'chat' | 'responses' | 'embeddings';
    rules: Array<({
        pattern: string;
        preset?: never;
    } | {
        preset: 'email_v1' | 'api_key_prefix_v1' | 'niu_api_key_v1';
        pattern?: never;
    }) & {
        action: 'block' | 'redact';
    }>;
    request: unknown;
};
```
