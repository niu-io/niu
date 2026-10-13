---
title: "WorkspaceAssetVideoImageInput"
description: "Generated TypeScript declaration for WorkspaceAssetVideoImageInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Saved workspace images undergo fresh inspection before generation. */
export type WorkspaceAssetVideoImageInput = {
    type: 'workspace_asset';
    role?: string;
    workspace_asset: {
        asset_id: string;
        consent_to_process: true;
    };
};
```
