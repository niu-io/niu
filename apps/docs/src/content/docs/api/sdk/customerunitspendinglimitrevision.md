---
title: "CustomerUnitSpendingLimitRevision"
description: "Generated TypeScript declaration for CustomerUnitSpendingLimitRevision"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerUnitSpendingLimitRevision = {
    revision: string;
    expected_revision: string;
    definition_revision: string;
    limit_atoms: string | null;
    recorded_at: string;
    actor_kind: 'installation' | 'member';
    actor_name: string;
};
```
