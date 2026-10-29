---
title: "WorkspaceImageDetectorDescription"
description: "Generated TypeScript declaration for WorkspaceImageDetectorDescription"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspaceImageDetectorDescription = {
    detector: string;
    schema_version: 2;
    detector_revision: string;
    configuration_fingerprint: string;
    recipient: string;
    region: string;
    retention: string;
    processing_guarantees: 'declared_unverified';
    content_sent: 'exact_encoded_image';
    timeout_ms: number;
    maximum_encoded_bytes: number;
    maximum_width: number;
    maximum_height: number;
    maximum_decoded_bytes: number;
    concurrency: number;
    declared_unmetered: boolean;
    policy_activation: false;
};
```
