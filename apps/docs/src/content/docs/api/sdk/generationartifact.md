---
title: "GenerationArtifact"
description: "Generated TypeScript declaration for GenerationArtifact"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/generations-inventory.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Provider reference availability and the retained library copy remain independent.
 * Content type is known only from the captured, validated library metadata. */
export type GenerationArtifact = {
    task_id: string;
    kind: GenerationArtifactKind;
    name: string;
    created_at: string;
    content_type: string | null;
    availability: GenerationArtifactAvailability;
    capture: GenerationArtifactCapture | null;
    session_id: string | null;
    turn_id: string | null;
    workspace_id: string;
};
```
