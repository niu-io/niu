---
title: "RequestFailure"
description: "Generated TypeScript declaration for RequestFailure"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Content-free gateway diagnosis; it does not establish usage or execution certainty. */
export type RequestFailure = {
    kind: 'upstream_http_error' | 'upstream_region_unavailable' | 'upstream_timeout' | 'upstream_connection_error' | 'upstream_transport_error' | 'upstream_invalid_response' | 'response_stream_cancelled';
    upstream_http_status: number | null;
    transport_phase?: 'connection' | 'request' | null;
};
```
