---
title: "WorkspaceDetectorDescription"
description: "Generated TypeScript declaration for WorkspaceDetectorDescription"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspaceDetectorDescription = {
    detector: string;
    schema_version: 1;
    detector_revision: string;
    configuration_fingerprint: string;
    recipient: string;
    region: string;
    retention: string;
    processing_guarantees: 'declared_unverified';
    content_sent: 'request_text_after_local_redaction';
    credential_source: 'server_environment';
    timeout_ms: number;
    concurrency: number;
    max_text_bytes: number;
    max_response_bytes: 4096;
    external_charge: 'unknown' | 'declared_unmetered';
    customer_billing: 'not_integrated';
    policy_activation: boolean;
};
```
