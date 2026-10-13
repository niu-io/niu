---
title: "VideoSubmissionIntent"
description: "Generated TypeScript declaration for VideoSubmissionIntent"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VideoSubmissionIntent = VideoIntentIndexEntry & {
    original_key_id: string;
    key_id: string;
    model: string;
    funding_mode: 'owner_funded' | 'customer';
    request: VideoIntentRequest | null;
    submission_state: 'saved' | 'not_dispatched' | 'dispatched';
    job: VideoJobState | null;
};
```
