---
title: "ChatExport"
description: "Generated TypeScript declaration for ChatExport"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Portable conversation content; excludes internal IDs, errors and accounting. */
export type ChatExport = {
    format: 'niu-chat';
    version: 1;
    title?: string;
    createdAt?: number;
    turns: Array<{
        prompt: string;
        results: Array<Pick<ChatResult, 'model' | 'content' | 'phase'>>;
        attachments?: ChatAttachment[];
    }>;
};
```
