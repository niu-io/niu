---
title: "EPayConfigurationInput"
description: "Generated TypeScript declaration for EPayConfigurationInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type EPayConfigurationInput = {
    expected_revision: string;
    enabled: boolean;
    merchant_id: string;
    /** An empty string preserves the existing merchant key. */
    key: string;
    endpoint: string;
    notify_url: string;
    return_url: string;
    methods: Array<'alipay' | 'wxpay'>;
};
```
