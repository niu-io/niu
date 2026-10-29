---
title: "VideoIntentRequest"
description: "Generated TypeScript declaration for VideoIntentRequest"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Retained drafts keep typed Niu material references; explicit submission rechecks
 * current binding and inspection. URL, inline and short-lived ingestion drafts
 * remain unsupported. Controls must match the discovered model schema. */
export type VideoIntentRequest = Omit<VideoCreateRequest, 'content' | 'model'> & {
    model: string;
    content: Array<Extract<VideoCreateRequest['content'][number], {
        type: 'text' | 'provider_asset' | 'workspace_asset';
    }>>;
};
```
