---
title: "GenerateContentPart"
description: "Generated TypeScript declaration for GenerateContentPart"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Native Gemini GenerateContent / StreamGenerateContent. Requires an explicitly declared gemini route. */
export type GenerateContentPart = {
    text: string;
    thought?: boolean;
    thoughtSignature?: string;
} | {
    functionCall: {
        name: string;
        args: Record<string, unknown>;
        id?: string;
    };
    thoughtSignature?: string;
} | {
    functionResponse: {
        name: string;
        response: Record<string, unknown>;
        id?: string;
    };
} | {
    inlineData: {
        mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'application/pdf';
        data: string;
    };
};
```
