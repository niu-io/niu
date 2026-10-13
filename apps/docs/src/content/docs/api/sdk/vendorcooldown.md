---
title: "VendorCooldown"
description: "Generated TypeScript declaration for VendorCooldown"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VendorCooldown = {
    policy_revision: 'openrouter-auth-cooldown-v1';
    failure_threshold: 3;
    window_seconds: 60;
    cooldown_seconds: 60;
    active: boolean;
    cooldown_until: string | null;
    qualifying_failures: number;
};
```
