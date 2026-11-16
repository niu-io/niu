---
title: "RegistrationRequestRecord"
description: "Generated TypeScript declaration for RegistrationRequestRecord"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export interface RegistrationRequestRecord {
    id: string;
    email: string;
    applicant_name: string;
    organization_name: string;
    workspace_name: string;
    note: string | null;
    status: RegistrationStatus;
    revision: string;
    created_at: string;
    reviewed_at: string | null;
    reviewed_by_kind: 'installation' | 'operator' | null;
    reviewed_by_label: string | null;
    decision_note: string | null;
    approved_organization_slug: string | null;
    approved_workspace_slug: string | null;
}
```
