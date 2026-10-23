---
title: "VideoIntentIndexEntry"
description: "Generated TypeScript declaration for VideoIntentIndexEntry"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VideoIntentIndexEntry = {
    reference?: string;
    id: string;
    revision: number;
    expires_at_ms: string;
    content_state: 'retained' | 'deleted' | 'expired';
};
```
