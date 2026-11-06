---
title: "MediaAssetCreateSource"
description: "Generated TypeScript declaration for MediaAssetCreateSource"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/media-assets.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Exactly one source. A workspace source is resolved to a short-lived public
 * capability only by the Gateway at dispatch; the capability is never persisted.
 */
export type MediaAssetCreateSource = {
    url: string;
    workspace_asset_id?: never;
} | {
    workspace_asset_id: string;
    url?: never;
};
```
