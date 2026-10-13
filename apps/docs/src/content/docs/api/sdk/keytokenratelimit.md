---
title: "KeyTokenRateLimit"
description: "Generated TypeScript declaration for KeyTokenRateLimit"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type KeyTokenRateLimit = {
    snapshot_at: string;
    known_tokens: string;
    reserved_tokens: string;
    unbounded_requests: number;
    committed_tokens: string | null;
    tokens_per_minute: number | null;
    revision: string | null;
};
```
