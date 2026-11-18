---
title: "ResponsesTextConfig"
description: "Generated TypeScript declaration for ResponsesTextConfig"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/release/0.3/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ResponsesTextConfig = {
    verbosity?: 'low' | 'medium' | 'high';
    format?: {
        type: 'text';
    } | {
        type: 'json_object';
    } | {
        type: 'json_schema';
        name: string;
        schema: Record<string, unknown>;
        description?: string;
        strict?: boolean;
    };
};
```
