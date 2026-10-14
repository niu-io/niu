---
title: "GatewayAdmissionDenial"
description: "Generated TypeScript declaration for GatewayAdmissionDenial"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GatewayAdmissionDenial = {
    kind: 'key_request_rate_disabled' | 'key_request_rate_exceeded';
    http_status: 429;
    requested_key_name: string;
    key_name_source: 'captured_at_admission';
    recorded_at: string;
};
```
