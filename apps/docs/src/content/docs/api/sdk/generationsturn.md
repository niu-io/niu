---
title: "GenerationsTurn"
description: "Generated TypeScript declaration for GenerationsTurn"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/generations-sessions.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GenerationsTurn = {
    id: string;
    sequence: string;
    created_at: string;
    content_state: 'retained' | 'deleted' | 'expired';
    instruction: GenerationsInstruction | null;
    content_expires_at: string;
    intent: GenerationsVideoIntentReference | null;
    task_id: string | null;
    task: GenerationsTaskReference | null;
};
```
