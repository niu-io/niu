---
title: "KeySpendingAccount"
description: "Generated TypeScript declaration for KeySpendingAccount"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Remaining key allowance only; company/workspace admission constraints still apply. */
export type KeySpendingAccount = WorkspaceSpendingAccount & {
    remaining_nanos: string | null;
};
```
