---
title: "MemberSession"
description: "Generated TypeScript declaration for MemberSession"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/auth.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type MemberSession = {
    /** Routing references only; do not display internal identifiers. */
    id: string;
    operator_id: string;
    expires_at_unix: number;
    revoked: boolean;
};
```
