---
title: "GuardrailDetectorPreviewResult"
description: "Generated TypeScript declaration for GuardrailDetectorPreviewResult"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GuardrailDetectorPreviewResult = {
    outcome: 'clear' | 'matched' | 'indeterminate';
    reason: string;
    synthetic: true;
    enforcement: false;
};
```
