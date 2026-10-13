---
title: "GatewayActivityOutcome"
description: "Generated TypeScript declaration for GatewayActivityOutcome"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GatewayActivityOutcome = {
    authority: 'agent_claim' | 'deterministic_validator' | 'human_acceptance';
    result: 'accepted' | 'rejected' | 'inconclusive';
};
```
