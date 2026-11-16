---
title: "MessagesDocumentBlock"
description: "Generated TypeScript declaration for MessagesDocumentBlock"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type MessagesDocumentBlock = {
    type: 'document';
    source: {
        type: 'base64';
        media_type: 'application/pdf';
        data: string;
    } | {
        type: 'text';
        media_type: 'text/plain';
        data: string;
    } | {
        type: 'url';
        url: string;
    };
    title?: string;
    context?: string;
    citations?: {
        enabled: boolean;
    };
    cache_control?: MessagesCacheControl;
};
```
