---
title: "GenerateContentRequest"
description: "Generated TypeScript declaration for GenerateContentRequest"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/release/0.3/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GenerateContentRequest = {
    contents: Array<{
        role?: 'user' | 'model';
        parts: GenerateContentPart[];
    }>;
    systemInstruction?: {
        role?: 'user' | 'system';
        parts: Array<{
            text: string;
        }>;
    };
    tools?: Array<{
        functionDeclarations: GenerateContentToolDeclaration[];
    }>;
    toolConfig?: {
        functionCallingConfig?: {
            mode?: 'AUTO' | 'ANY' | 'NONE';
            allowedFunctionNames?: string[];
        };
    };
    generationConfig?: {
        maxOutputTokens?: number;
        candidateCount?: 1;
        temperature?: number;
        topP?: number;
        topK?: number;
        seed?: number;
        presencePenalty?: number;
        frequencyPenalty?: number;
        stopSequences?: string[];
        thinkingConfig?: {
            includeThoughts?: boolean;
            thinkingBudget?: number;
            thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
        };
        responseMimeType?: 'text/plain' | 'application/json';
        responseSchema?: Record<string, unknown>;
        responseJsonSchema?: Record<string, unknown>;
    };
};
```
