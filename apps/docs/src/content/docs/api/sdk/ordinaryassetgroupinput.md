---
title: "OrdinaryAssetGroupInput"
description: "Generated TypeScript declaration for OrdinaryAssetGroupInput"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Server-side bootstrap administration. Never expose the admin token to clients.
 * No implicit retries: a collector explicitly resubmits identical observations.
 */
/** Reviewed evidence references; creating this record does not enable dispatch. */
export interface OrdinaryAssetGroupInput {
    organization_id: string;
    project_id: string;
    idempotency_key: string;
    vendor_revision: number;
    credential_revision: number;
    name: string;
    description?: string;
}
```
