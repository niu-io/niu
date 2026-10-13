---
title: "GenerateContentRequest"
description: "Generated TypeScript declaration for GenerateContentRequest"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Buffered native Gemini text. Requires an explicitly declared static or managed gemini route. */
export type GenerateContentRequest = {
    contents: Array<{
        role?: 'user' | 'model';
        parts: Array<{
            text: string;
        }>;
    }>;
    systemInstruction?: {
        role?: 'user' | 'model' | 'system';
        parts: Array<{
            text: string;
        }>;
    };
    generationConfig: {
        maxOutputTokens: number;
        candidateCount?: 1;
        temperature?: number;
        topP?: number;
        topK?: number;
        stopSequences?: string[];
    };
};
```
