---
title: "VideoCreateRequest"
description: "Generated TypeScript declaration for VideoCreateRequest"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VideoCreateRequest = {
    model: string;
    content: Array<{
        type: 'text';
        text: string;
    } | {
        type: 'image_url';
        image_url: {
            url: string;
        };
        role?: string;
    } | {
        type: 'audio_url';
        audio_url: {
            url: string;
        };
        role?: string;
    } | {
        type: 'video_url';
        video_url: {
            url: string;
        };
        role?: string;
    } | IngestedVideoImageInput | WorkspaceAssetVideoImageInput | ProviderAssetVideoInput>;
    [control: string]: unknown;
};
```
