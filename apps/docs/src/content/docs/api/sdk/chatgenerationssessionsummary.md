---
title: "ChatGenerationsSessionSummary"
description: "Generated TypeScript declaration for ChatGenerationsSessionSummary"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/generations-sessions.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ChatGenerationsSessionSummary = Omit<VideoGenerationsSessionSummary, 'category' | 'title'> & {
    category: 'chat';
    title: string | null;
};
```
