---
title: "ResponseMetadata"
description: "Generated TypeScript declaration for ResponseMetadata"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ResponseMetadata = {
    /** Routing evidence from response headers; does not prove terminal generation or task acceptance. */
    readonly pool?: {
        slug: string;
        revision: string | null;
        selectedModel: string | null;
        evidence: string | null;
    };
    readonly status: number;
    readonly requestId: string | null;
    readonly attemptId: string | null;
    readonly operationId: string | null;
};
```
