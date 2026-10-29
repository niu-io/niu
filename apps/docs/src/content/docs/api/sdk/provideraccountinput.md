---
title: "ProviderAccountInput"
description: "Generated TypeScript declaration for ProviderAccountInput"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ProviderAccountInput = {
    provider: string;
    plan: string;
    authentication_mode: 'api_key' | 'oauth_refresh';
    billing_mode: 'metered_api' | 'subscription';
    credential_reference: string;
    concurrency_limit: number;
};
```
