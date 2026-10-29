---
title: "KeyConcurrencyLimitRevision"
description: "Generated TypeScript declaration for KeyConcurrencyLimitRevision"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type KeyConcurrencyLimitRevision = Omit<KeyConcurrencyLimit, 'active_requests'> & {
    revision: string;
    recorded_at: string;
    actor_kind: 'installation' | 'member';
    actor_name: string;
};
```
