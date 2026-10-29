---
title: "MediaAssetGroupObservation"
description: "Generated TypeScript declaration for MediaAssetGroupObservation"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/media-assets.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Current metadata from an explicit, successful, identity-validated Get.
 * Independent of operation ACKs; cannot unblock unknown writes or grant reuse.
 */
export type MediaAssetGroupObservation = {
    source: 'provider_get';
    status: 'present';
    name: string | null;
    description: string | null;
    observed_at_ms: number;
};
```
