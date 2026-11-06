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
    strategy?: WorkspacePoolStrategy;
    simulation?: {
        protocol: WorkspacePoolPreviewContext['protocol'];
        matched_rule: string | null;
        outcome: 'pool_disabled' | 'default_reject' | 'no_eligible_candidates' | 'candidates';
        strategy?: WorkspacePoolStrategy;
        selection_basis?: 'not_evaluated' | 'priority_weight' | 'priority_weight_fallback' | 'customer_price' | 'auto_context' | 'auto_decider_required' | 'auto_rejected';
        /** Auto path selected deterministically from caller context. */
        selected_path?: string | null;
        selected_candidate?: string | null;
        fallback_reason?: string | null;
        price_evaluation?: WorkspacePoolPriceEvaluation | null;
        decision?: WorkspacePoolDecisionEvidence | null;
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
            estimated_customer_charge_nanos?: string | null;
            price_unknown_reason?: string | null;
        }>;
    };
};
```
