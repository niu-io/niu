---
title: "PlatformAuditEvent"
description: "Generated TypeScript declaration for PlatformAuditEvent"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/platform-audit.ts). [All SDK types](/docs/api/sdk/).

```typescript
export interface PlatformAuditEvent {
    /** Internal source-qualified reference; do not render this as a display label. */
    id: string;
    source: PlatformAuditSource;
    category: PlatformAuditCategory;
    action: string;
    actor_kind: string;
    /** Recorded actor name, recorded system role, or an explicit unknown label. */
    actor_label: string;
    target_label: string;
    revision: string | null;
    created_at: string;
}
```
