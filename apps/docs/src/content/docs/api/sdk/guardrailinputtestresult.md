---
title: "GuardrailInputTestResult"
description: "Generated TypeScript declaration for GuardrailInputTestResult"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GuardrailInputTestResult = {
    outcome: 'allowed' | 'blocked' | 'indeterminate';
    reason: 'inspected_text' | 'pattern_denial' | 'unsupported_content' | 'resource_limit' | 'invalid_pattern';
    redacted: boolean;
    synthetic: true;
    enforcement: false;
};
```
