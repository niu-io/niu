---
title: "GuardrailOutputTestResult"
description: "Generated TypeScript declaration for GuardrailOutputTestResult"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GuardrailOutputTestResult = (GuardrailInputTestResult & {
    mode: 'buffered_full';
    coverage: 'local_text';
}) | {
    outcome: 'clear' | 'matched' | 'indeterminate';
    reason: 'inspected_text' | 'pattern_match' | 'unsupported_content' | 'resource_limit' | 'invalid_pattern';
    redacted: false;
    synthetic: true;
    enforcement: false;
    mode: 'observe_only';
    coverage: 'local_text';
};
```
