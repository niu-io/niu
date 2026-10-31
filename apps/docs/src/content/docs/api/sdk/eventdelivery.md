---
title: "EventDelivery"
description: "Generated TypeScript declaration for EventDelivery"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type EventDelivery = {
    id: string;
    subscription_revision: number;
    sequence: string;
    state: 'pending' | 'sending' | 'delivered' | 'failed' | 'cancelled';
    attempts: number;
    response_status: number | null;
    failure_kind: 'transport' | 'destination' | 'signature' | 'http' | 'authority' | 'superseded' | 'exhausted' | null;
    updated_at: string;
    lease_expires_at: string | null;
    lease_expired: boolean;
    next_attempt_at: string | null;
};
```
