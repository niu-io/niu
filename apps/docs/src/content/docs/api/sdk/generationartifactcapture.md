---
title: "GenerationArtifactCapture"
description: "Generated TypeScript declaration for GenerationArtifactCapture"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/generation-artifact-capture.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GenerationArtifactCapture = {
    id: string;
    task_id: string;
    kind: GenerationArtifactKind;
    status: 'preparing' | 'stored' | 'failed';
    /** Present only after successful storage; deletion preserves this saved reference. */
    asset_id: string | null;
    availability: 'retained' | 'deleted' | 'not_stored';
    failure_code: GenerationArtifactCaptureFailureCode | null;
    created_at: string;
    updated_at: string;
};
```
