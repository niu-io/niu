---
title: "ModelRoutePoolRuleConditions"
description: "Generated TypeScript declaration for ModelRoutePoolRuleConditions"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ModelRoutePoolRuleConditions = {
    protocol?: 'chat' | 'responses' | 'messages' | 'embeddings' | 'generate_content' | null;
    streaming?: boolean | null;
    tools?: boolean | null;
    structured_output?: boolean | null;
    vision?: boolean | null;
    reasoning?: boolean | null;
    min_input_tokens?: number | null;
    max_input_tokens?: number | null;
    min_output_tokens?: number | null;
    max_output_tokens?: number | null;
};
```
