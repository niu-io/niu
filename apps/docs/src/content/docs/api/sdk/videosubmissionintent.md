---
title: "VideoSubmissionIntent"
description: "Generated TypeScript declaration for VideoSubmissionIntent"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VideoSubmissionIntent = VideoIntentIndexEntry & {
    /** Original actor-private routing binding. IDs are not display labels. Missing
     * on older gateways is unknown, never permission to create a replacement. */
    session_binding?: {
        session_id: string;
        turn_id: string;
    } | null;
    original_key_id: string;
    key_id: string;
    model: string;
    funding_mode: 'owner_funded' | 'customer';
    request: VideoIntentRequest | null;
    submission_state: 'saved' | 'not_dispatched' | 'dispatched';
    job: VideoJobState | null;
};
```
