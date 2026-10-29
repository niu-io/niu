---
title: "IngestedVideoImageInput"
description: "Generated TypeScript declaration for IngestedVideoImageInput"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Short-lived ordinary image reuse; raw Provider asset URIs are not accepted. */
export type IngestedVideoImageInput = {
    type: 'ingested_image';
    role?: string;
    ingested_image: {
        ingestion_id: string;
        readiness_id: string;
        consent_to_reuse: true;
    };
};
```
