---
title: "ChatDraftPayload"
description: "Generated TypeScript declaration for ChatDraftPayload"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Workspace draft persisted by the backend for the current authenticated owner. */
export type ChatDraftPayload = {
    sessionId: string | null;
    prompt: string;
    models: string[];
    attachments: Array<{
        name: string;
        type: 'image' | 'text';
        content: string;
    }>;
    settings: {
        systemPrompt: string;
        maxTokens: number;
        temperature: number;
        logPayloads: boolean;
    };
};
```
