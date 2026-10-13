---
title: "ImageDetectorPreviewResult"
description: "Generated TypeScript declaration for ImageDetectorPreviewResult"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ImageDetectorPreviewResult = {
    outcome: 'clear' | 'matched' | 'indeterminate';
    reason: 'inspected_image' | 'image_match' | 'inspection_unavailable';
    synthetic: true;
    enforcement: false;
    policy_activation: false;
};
```
