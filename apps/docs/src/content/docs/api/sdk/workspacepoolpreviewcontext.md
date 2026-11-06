---
title: "WorkspacePoolPreviewContext"
description: "Generated TypeScript declaration for WorkspacePoolPreviewContext"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspacePoolPreviewContext = {
    protocol: 'chat' | 'responses' | 'messages' | 'embeddings' | 'generate_content';
    streaming?: boolean;
    vision?: boolean;
    tools?: boolean;
    structured_output?: boolean;
    reasoning?: boolean;
    embedding_dimensions?: boolean;
    embedding_base64?: boolean;
    estimated_input_tokens?: number;
    requested_output_tokens?: number;
    /** Optional caller task context for Auto preview; preview never calls the decider. */
    task?: string;
    stage?: string;
};
```
