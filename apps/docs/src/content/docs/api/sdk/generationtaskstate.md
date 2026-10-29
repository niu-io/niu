---
title: "GenerationTaskState"
description: "Generated TypeScript declaration for GenerationTaskState"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/generations-inventory.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Saved state, not inference authority or an automatic polling contract. */
export type GenerationTaskState = 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'submission_unknown' | 'reconciliation_required';
```
