---
title: "RoutingRegistryStatus"
description: "Generated TypeScript declaration for RoutingRegistryStatus"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Platform-only status; route definitions and procurement details are not returned. */
export interface RoutingRegistryStatus {
    generation: string;
    format_version: 1;
    local_static_configuration_matches: boolean;
}
```
