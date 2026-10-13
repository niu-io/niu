---
title: "RequestGuardrailDecision"
description: "Generated TypeScript declaration for RequestGuardrailDecision"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type RequestGuardrailDecision = {
    stage: 'dispatch';
    outcome: 'allowed';
    coverage: 'model_provider_access';
    enforcer_version: 'access-v1';
    output_inspection: {
        outcome: 'allowed' | 'redacted' | 'blocked' | 'indeterminate';
        reason: 'inspected_text' | 'pattern_denial' | 'unsupported_content' | 'resource_limit' | 'inspection_unavailable';
        mode: 'buffered_full';
        coverage: 'local_text';
        enforcer_version: 'local-output-v1';
        elapsed_ms: number;
    } | null;
    output_observation: {
        outcome: 'clear' | 'matched' | 'indeterminate';
        reason: 'inspected_text' | 'pattern_match' | 'unsupported_content' | 'resource_limit' | 'inspection_unavailable';
        mode: 'observe_only';
        enforcement: false;
        coverage: 'local_text';
        enforcer_version: 'local-output-v1';
        elapsed_ms: number;
    } | null;
    input_detectors: Array<{
        detector: string;
        configuration_fingerprint: string;
        stage: 'input';
        coverage: 'local_text';
        outcome: 'clear' | 'matched' | 'indeterminate';
        reason: string;
        elapsed_ms: number;
    }>;
    input_inspection: {
        outcome: 'allowed' | 'redacted';
        coverage: 'local_text';
        enforcer_version: 'local-input-v1';
        elapsed_ms: number;
    } | null;
    workspace_revision: number | null;
    workspace_policy_name: string | null;
    key_policy_revision: number | null;
    key_policy_name: string | null;
    key_assignment_revision: number | null;
    recorded_at: string;
};
```
