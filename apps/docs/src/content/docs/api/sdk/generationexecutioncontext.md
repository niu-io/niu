---
title: "GenerationExecutionContext"
description: "Generated TypeScript declaration for GenerationExecutionContext"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/generations-inventory.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Original dispatch facts, never inferred from current Provider configuration.
 * Provider identifies the saved adapter, not a mutable Provider/account name.
 * Parameters contain only retained validated scalar controls; references and
 * prompts remain in actor-private retained session/intent content, when present.
 */
export type GenerationExecutionContext = {
    submitted_model: string;
    dispatched_model: string | null;
    provider: string | null;
    channel: string | null;
    dispatched_at: string;
    source: 'saved_execution';
    parameters: {
        duration?: number;
        seed?: number;
        frames_per_second?: number;
        watermark?: boolean;
        camera_fixed?: boolean;
        return_last_frame?: boolean;
        resolution?: string;
        ratio?: string;
        omni_reference_task_type?: string;
    } | null;
    parameters_source: 'saved_validated_snapshot' | 'unknown';
    references_state: 'not_in_execution_snapshot';
};
```
