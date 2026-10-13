---
title: "ImageIngestionConsentStatus"
description: "Generated TypeScript declaration for ImageIngestionConsentStatus"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ImageIngestionConsentStatus = {
    consent_id: string;
    expires_at: string;
    status: 'consented' | 'expired' | 'revoked' | 'pending' | 'accepted' | 'uncertain';
    reason: 'invalid_configuration' | 'destination_rejected' | 'unavailable' | 'transport' | 'timeout' | 'response_limit' | 'invalid_response' | null;
    duration_ms: number | null;
    observed_at: string | null;
    consent_revoked: boolean;
    dispatch_available: boolean;
};
```
