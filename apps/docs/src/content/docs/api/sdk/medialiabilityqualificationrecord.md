---
title: "MediaLiabilityQualificationRecord"
description: "Generated TypeScript declaration for MediaLiabilityQualificationRecord"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type MediaLiabilityQualificationRecord = MediaLiabilityPublicationResult & {
    current_version: string;
    identity: MediaLiabilityIdentity;
    maximum_quantity: ExactMediaQuantity;
    evidence_revision: string;
    evidence_sha256: string;
    effective_from: string;
    effective_until: string;
    revocation_effective_until: string | null;
    revocation_revision: string | null;
    revocation_reason: string | null;
    revocation_actor_kind: 'installation' | 'operator' | null;
    revocation_actor_operator_id: string | null;
    revocation_created_at: string | null;
    reason: string;
    actor_kind: 'installation' | 'operator';
    actor_operator_id: string | null;
    created_at: string;
};
```
