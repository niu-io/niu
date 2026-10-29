---
title: "KeySpendingLimitRevision"
description: "Generated TypeScript declaration for KeySpendingLimitRevision"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type KeySpendingLimitRevision = {
    currency: string;
    limit_nanos: string | null;
    revision: string;
    recorded_at: string;
    actor_kind: 'installation' | 'member';
    actor_name: string;
};
```
