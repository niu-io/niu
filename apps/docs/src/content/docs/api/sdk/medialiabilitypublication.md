---
title: "MediaLiabilityPublication"
description: "Generated TypeScript declaration for MediaLiabilityPublication"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type MediaLiabilityPublication = {
    identity: MediaLiabilityIdentity;
    maximum_quantity: ExactMediaQuantity;
    evidence_revision: string;
    evidence_sha256: string;
    effective_from: string;
    effective_until: string;
    expected_version: string;
    idempotency_key: string;
    reason: string;
};
```
