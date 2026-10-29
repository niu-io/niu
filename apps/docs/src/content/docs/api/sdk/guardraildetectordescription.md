---
title: "GuardrailDetectorDescription"
description: "Generated TypeScript declaration for GuardrailDetectorDescription"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GuardrailDetectorDescription = Omit<WorkspaceDetectorDescription, 'detector' | 'content_sent'> & {
    content_sent: 'synthetic_text';
};
```
