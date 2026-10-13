---
title: "PlatformAuditQuery"
description: "Generated TypeScript declaration for PlatformAuditQuery"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/platform-audit.ts). [All SDK types](/docs/api/sdk/).

```typescript
export interface PlatformAuditQuery {
    /** Defaults to 50; allowed range is 1 through 100. */
    limit?: number;
    /** Opaque source-qualified reference returned by the previous page. */
    cursor?: string;
    category?: PlatformAuditCategory;
}
```
