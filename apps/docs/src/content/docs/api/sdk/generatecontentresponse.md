---
title: "GenerateContentResponse"
description: "Generated TypeScript declaration for GenerateContentResponse"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GenerateContentResponse = {
    candidates: Array<{
        index: 0;
        content: {
            role: 'model';
            parts: Array<{
                text: string;
            }>;
        };
        finishReason: 'STOP' | 'MAX_TOKENS';
    }>;
    modelVersion: string;
    responseId?: string;
    /** Missing categories remain null; usage is not a settlement receipt. */
    usageMetadata: {
        promptTokenCount: number | null;
        candidatesTokenCount: number | null;
        totalTokenCount: number | null;
        cachedContentTokenCount: number | null;
        thoughtsTokenCount: number | null;
    };
};
```
