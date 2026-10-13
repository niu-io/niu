---
title: "GenerationTask"
description: "Generated TypeScript declaration for GenerationTask"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/generations-inventory.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GenerationTask = {
    id: string;
    kind: 'video';
    model: string;
    model_display_name: string | null;
    /** Existing display metadata may reflect today's catalog, never historical dispatch. */
    model_display_name_source: 'current_catalog' | 'unknown';
    execution_context: GenerationExecutionContext;
    created_at: string;
    updated_at: string;
    state: GenerationTaskState;
    source: 'api' | 'generations' | 'unknown';
    session_id: string | null;
    turn_id: string | null;
    artifacts: Array<{
        kind: GenerationArtifactKind;
        availability: GenerationArtifactAvailability;
        capture: GenerationArtifactCapture | null;
    }>;
};
```
