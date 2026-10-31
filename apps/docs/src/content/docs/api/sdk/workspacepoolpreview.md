---
title: "WorkspacePoolPreview"
description: "Generated TypeScript declaration for WorkspacePoolPreview"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspacePoolPreview = {
    configuration_valid: boolean;
    persisted: false;
    live_model_verification: 'not_performed';
    candidate_count: number;
    rule_count: number;
    simulation?: {
        protocol: WorkspacePoolPreviewContext['protocol'];
        matched_rule: string | null;
        outcome: 'pool_disabled' | 'default_reject' | 'no_eligible_candidates' | 'candidates';
        live_dispatch: false;
        candidates: Array<{
            alias: string;
            priority: number;
            weight: number;
            eligible: boolean;
            exclusion_reason: string | null;
            selection_weight: {
                numerator: number;
                denominator: number;
            };
        }>;
    };
};
```
