---
title: "GenerationArtifactCaptureInput"
description: "Generated TypeScript declaration for GenerationArtifactCaptureInput"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/generation-artifact-capture.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GenerationArtifactCaptureInput = {
    /** Canonical nonnil UUID retained for explicit retries of this request. */
    id: string;
    /** Trimmed, nonblank name: at most 200 UTF-8 bytes without control characters. */
    name: string;
} & ({
    mode: 'cached';
    key_id?: never;
} | {
    mode: 'fresh';
    /** Optional current workspace inference authority, never a replacement upstream binding. */
    key_id?: string;
});
```
