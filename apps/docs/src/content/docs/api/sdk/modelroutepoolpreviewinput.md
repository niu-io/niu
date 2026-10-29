---
title: "ModelRoutePoolPreviewInput"
description: "Generated TypeScript declaration for ModelRoutePoolPreviewInput"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ModelRoutePoolPreviewInput = {
    protocol: 'chat' | 'responses' | 'messages' | 'embeddings' | 'generate_content';
    streaming?: boolean;
    tools?: boolean;
    structured_output?: boolean;
    vision?: boolean;
    reasoning?: boolean;
    estimated_input_tokens?: number | null;
    requested_output_tokens?: number | null;
};
```
