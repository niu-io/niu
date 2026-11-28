---
title: "PlatformCustomerOnboardingInput"
description: "Generated TypeScript declaration for PlatformCustomerOnboardingInput"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

[SDK source](https://github.com/niu-io/niu/blob/release/0.4/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type PlatformCustomerOnboardingInput = {
    name?: string;
    account_kind?: 'personal' | 'organization';
    create_default_workspace?: boolean;
    owner?: {
        name?: string | null;
        email: string;
        password: string;
    } | null;
    trial_credit_nanos?: string | null;
};
```
