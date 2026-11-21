---
title: "KeyIpPolicy"
description: "Generated TypeScript declaration for KeyIpPolicy"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/release/0.4/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Customer limits share history across secret rotation; null means unlimited. */
export type KeyIpPolicy = {
    allowed_cidrs: string[] | null;
    revision: string | null;
};
```
