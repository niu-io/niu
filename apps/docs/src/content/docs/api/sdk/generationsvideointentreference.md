---
title: "GenerationsVideoIntentReference"
description: "Generated TypeScript declaration for GenerationsVideoIntentReference"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/generations-sessions.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Canonical Video draft identity (restore with getVideoIntent); the separate turn instruction may be a review note. Reading or binding never submits generation. */
export type GenerationsVideoIntentReference = {
    id: string;
    revision: string;
    model: string;
    content_state: 'retained' | 'deleted' | 'expired';
    submission_state: 'saved' | 'not_dispatched' | 'dispatched';
    task_id: string | null;
};
```
