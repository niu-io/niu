---
title: "MediaVerificationSession"
description: "Generated TypeScript declaration for MediaVerificationSession"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/media-verification.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Niu session identity; the upstream verification token remains private. */
export type MediaVerificationSession = {
    id: string;
    model: string;
    subject_name: string | null;
    status: 'prepared' | 'unknown' | 'not_sent' | 'waiting_user' | 'processing' | 'verified' | 'failed' | 'expired';
    group_id: string | null;
    expires_at: string | null;
    created_at_ms: number;
    updated_at_ms: number;
};
```
