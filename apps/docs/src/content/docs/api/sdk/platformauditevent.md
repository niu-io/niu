---
title: "PlatformAuditEvent"
description: "Generated TypeScript declaration for PlatformAuditEvent"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/platform-audit.ts). [All SDK types](/docs/api/sdk/).

```typescript
export interface PlatformAuditEvent {
    /** Recorded transitions only; absent/null on older servers and other journal streams. */
    before_role?: 'owner' | 'admin' | 'viewer' | null;
    after_role?: 'owner' | 'admin' | 'viewer' | null;
    /** Internal source-qualified reference; do not render this as a display label. */
    id: string;
    source: PlatformAuditSource;
    category: PlatformAuditCategory;
    action: string;
    actor_kind: string;
    /** Current linked actor name, recorded system role, or an explicit unknown label. */
    actor_label: string;
    target_label: string;
    revision: string | null;
    created_at: string;
}
```
