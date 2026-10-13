---
title: "QuotaObservation"
description: "Generated TypeScript declaration for QuotaObservation"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type QuotaObservation = {
    window_key: string;
    unit: 'tokens' | 'requests' | 'millionths_of_window';
    remaining: string | null;
    maximum: string | null;
    observed_at_ms: number;
    valid_until_ms: number;
    resets_at_ms: number;
    source: string;
};
```
