---
title: "EventSubscription"
description: "Generated TypeScript declaration for EventSubscription"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type EventSubscription = {
    slug: string;
    name: string;
    endpoint: string;
    event_types: Array<'pool.changed' | 'evaluation.recorded' | 'incident.opened' | 'incident.resolved'>;
    enabled: boolean;
    /** Expected revision on write; zero creates. */
    revision: number;
};
```
