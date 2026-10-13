---
title: "VideoModel"
description: "Generated TypeScript declaration for VideoModel"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VideoModel = {
    object: 'video.model';
    id: string;
    mode: 'owner_funded' | 'customer';
    input_types: [
        'text',
        ...Array<'image_url' | 'audio_url' | 'video_url'>
    ];
    text: {
        maximum_items: number;
        maximum_bytes: number;
    };
    requires_image?: boolean;
    workspace_asset?: {
        media_kind: 'image';
        requires_consent: true;
        requires_current_inspection: boolean;
        maximum_items: number;
        requires_text: true;
    };
    image_url?: {
        maximum_items: number;
        maximum_bytes: number;
        https: boolean;
        data_mime_types: Array<'image/png' | 'image/jpeg' | 'image/webp'>;
        roles: string[];
        role_required: boolean;
        requires_text: boolean;
        maximum_width?: number;
        maximum_height?: number;
        maximum_decoded_bytes?: number;
    };
    audio_url?: {
        maximum_items: number;
        maximum_bytes: number;
        https: true;
        data_mime_types: [
        ];
        roles: string[];
        role_required: boolean;
        requires_text: false;
    };
    video_url?: {
        maximum_items: number;
        maximum_bytes: number;
        https: true;
        data_mime_types: [
        ];
        roles: string[];
        role_required: boolean;
        requires_text: false;
    };
    maximum_body_bytes: number;
    maximum_content_items: number;
    controls: Record<string, VideoControl>;
    required_controls: string[];
    exclusive_controls: string[][];
    /** The meter follows the configured estimator; discovery is not a billing quote. */
    output: ({
        specifications: Array<{
            resolution: string;
            ratio: string;
            width: number;
            height: number;
        }>;
    } & ({
        meter: 'video_tokens';
        estimator: 'SeedancePixelsV1';
    } | {
        meter: 'seconds';
        estimator: 'OutputSecondsV1';
    })) | null;
};
```
