---
title: "MediaAssetMutationOptions"
description: "Generated TypeScript declaration for MediaAssetMutationOptions"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/media-assets.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type MediaAssetMutationOptions = RequestOptions & {
    /** Canonical UUID. Replays recover the saved operation and never resubmit it. */
    idempotencyKey?: string;
};
```
