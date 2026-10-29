---
title: "GuardrailPreparationDenial"
description: "Generated TypeScript declaration for GuardrailPreparationDenial"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GuardrailPreparationDenial = {
    stage: 'preparation';
    outcome: 'blocked';
    coverage: 'model_provider_access' | 'local_input' | 'external_input' | 'output_configuration';
    enforcer_version: 'access-v1' | 'local-input-v1' | 'external-input-v1' | 'buffer-mode-v1';
    reason: 'model_denied' | 'provider_denied' | 'unsupported_policy' | 'input_blocked' | 'input_unsupported' | 'input_resource_limit' | 'input_unavailable' | 'output_incompatible' | 'detector_blocked' | 'detector_unavailable' | 'detector_unsupported';
    key_name: string;
    workspace_policy_name: string | null;
    key_policy_name: string | null;
    workspace_revision: number | null;
    key_policy_revision: number | null;
    key_assignment_revision: number | null;
    recorded_at: string;
};
```
