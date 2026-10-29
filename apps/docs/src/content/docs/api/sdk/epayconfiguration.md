---
title: "EPayConfiguration"
description: "Generated TypeScript declaration for EPayConfiguration"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Platform-only metadata; the merchant secret is write-only. */
export type EPayConfiguration = {
    revision: string;
    enabled: boolean;
    merchant_id: string;
    has_key: boolean;
    endpoint: string;
    notify_url: string;
    return_url: string;
    methods: string[];
};
```
