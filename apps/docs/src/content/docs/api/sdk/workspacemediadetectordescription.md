---
title: "WorkspaceMediaDetectorDescription"
description: "Generated TypeScript declaration for WorkspaceMediaDetectorDescription"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspaceMediaDetectorDescription = {
    detector: string;
    schema_version: 3;
    kind: 'audio' | 'video';
    detector_revision: string;
    configuration_fingerprint: string;
    recipient: string;
    region: string;
    retention: string;
    content_sent: 'exact_encoded_media_with_embedded_tracks';
    processing_guarantees: 'declared_unverified';
    timeout_ms: number;
    maximum_encoded_bytes: number;
    concurrency: number;
    declared_unmetered: boolean;
    policy_activation: false;
    requires_supported_presentation_facts: true;
};
```
