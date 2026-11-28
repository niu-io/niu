---
title: "PlatformAuditQuery"
description: "Generated TypeScript declaration for PlatformAuditQuery"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

[SDK source](https://github.com/niu-io/niu/blob/release/0.4/sdks/javascript/src/platform-audit.ts). [All SDK types](/docs/api/sdk/).

```typescript
export interface PlatformAuditQuery {
    /** Defaults to 50; allowed range is 1 through 100. */
    limit?: number;
    /** Opaque source-qualified reference returned by the previous page. */
    cursor?: string;
    category?: PlatformAuditCategory;
    search?: string;
    /** Field identifiers matching localized labels in the caller's UI. */
    labels?: string[];
}
```
