---
title: "CustomerUnitModePreview"
description: "Generated TypeScript declaration for CustomerUnitModePreview"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Advisory snapshot only. It neither activates a mode nor authorizes a switch. */
export type CustomerUnitModePreview = {
    revision: string;
    billing_mode: 'currency' | 'credits';
    target_mode: 'currency' | 'credits';
    change_required: boolean;
    blockers_empty: boolean;
    observed_at: string;
    blockers: Array<{
        category: string;
        record_count: string;
        organization_count: string;
        accounts_truncated: boolean;
        accounts: Array<{
            organization_id: string;
            name: string;
            record_count: string;
        }>;
    }>;
    preserved_configuration: {
        monetary_workspace_limits: string;
        monetary_key_limits: string;
        monetary_text_tariffs: string;
        monetary_retail_prices: string;
        monetary_media_rate_history: string;
        credits_text_tariffs: string;
    };
};
```
