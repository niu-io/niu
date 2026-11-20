---
title: "MessagesImageBlock"
description: "Generated TypeScript declaration for MessagesImageBlock"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/release/0.3/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type MessagesImageBlock = {
    type: 'image';
    source: {
        type: 'base64';
        media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
        data: string;
    } | {
        type: 'url';
        url: string;
    };
    cache_control?: MessagesCacheControl;
};
```
