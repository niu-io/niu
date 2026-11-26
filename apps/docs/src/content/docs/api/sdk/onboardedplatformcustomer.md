---
title: "OnboardedPlatformCustomer"
description: "Generated TypeScript declaration for OnboardedPlatformCustomer"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

[SDK source](https://github.com/niu-io/niu/blob/release/0.4/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type OnboardedPlatformCustomer = {
    id: string;
    slug: string;
    name: string;
    account_kind: 'personal' | 'organization' | string;
    currency: string;
    workspace_id: string | null;
    workspace_name: string | null;
    workspace_slug: string | null;
    owner_id: string | null;
    owner_name: string | null;
    owner_email: string | null;
    trial_credit_nanos: string | null;
};
```
