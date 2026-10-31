---
title: "EvaluationDefinition"
description: "Generated TypeScript declaration for EvaluationDefinition"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type EvaluationDefinition = {
    slug: string;
    name: string;
    task: string;
    rubric: string;
    protocol: 'chat' | 'responses' | 'messages' | 'embeddings' | 'generate_content';
    revision: number;
    samples: Array<{
        reference: string;
        request_sha256: string;
    }>;
};
```
