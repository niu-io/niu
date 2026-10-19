---
title: "ProviderCooldown"
description: "Generated TypeScript declaration for ProviderCooldown"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ProviderCooldown = {
    policy_revision: 'openrouter-auth-cooldown-v1';
    failure_threshold: 3;
    window_seconds: 60;
    cooldown_seconds: 60;
    active: boolean;
    cooldown_until: string | null;
    qualifying_failures: number;
};
```
