---
title: "MemberProfile"
description: "Generated TypeScript declaration for MemberProfile"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Current authenticated member only; installation tokens have no member profile. */
export type MemberProfile = {
    name: string;
    email: string | null;
    avatar_data_url: string | null;
    revision: number;
};
```
