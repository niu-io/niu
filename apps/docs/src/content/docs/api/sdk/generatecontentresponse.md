---
title: "GenerateContentResponse"
description: "Generated TypeScript declaration for GenerateContentResponse"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/release/0.4/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GenerateContentResponse = {
    candidates?: Array<{
        index: 0;
        content?: {
            role: 'model';
            parts: GenerateContentPart[];
        };
        finishReason?: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'BLOCKLIST' | 'PROHIBITED_CONTENT' | 'SPII';
    }>;
    modelVersion: string;
    responseId?: string;
    /** Missing categories remain null; usage is not a settlement receipt. */
    usageMetadata?: {
        promptTokenCount: number | null;
        toolUsePromptTokenCount?: number | null;
        candidatesTokenCount: number | null;
        totalTokenCount: number | null;
        cachedContentTokenCount: number | null;
        thoughtsTokenCount: number | null;
    };
};
```
