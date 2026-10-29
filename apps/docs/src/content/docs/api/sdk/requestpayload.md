---
title: "RequestPayload"
description: "Generated TypeScript declaration for RequestPayload"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type RequestPayload = {
    request: unknown;
    response: string;
    content_type: string;
    complete: boolean;
    truncated: boolean;
    expires_at: string;
    /** True when a truncated JSON response is withheld; response is an empty string. */
    response_omitted?: boolean;
};
```
