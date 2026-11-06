---
title: "WorkspaceModelPool"
description: "Generated TypeScript declaration for WorkspaceModelPool"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Customer-owned model policy; never contains Provider supply configuration. */
export type WorkspaceModelPool = {
    slug: string;
    name: string;
    description: string;
    enabled: boolean;
    /** Current revision for reads; expected revision for writes. Zero creates. */
    revision: number;
    candidates: import('./admin.js').ModelRoutePoolCandidate[];
    rules?: Array<Omit<import('./admin.js').ModelRoutePoolRule, 'conditions'> & {
        conditions: Omit<import('./admin.js').ModelRoutePoolRuleConditions, 'protocol'> & {
            protocol?: 'chat' | 'responses' | 'messages' | null;
        };
    }>;
    default_action?: 'candidates' | 'reject';
    /** Omitted legacy configurations use version 1 priority/weight. */
    strategy?: WorkspacePoolStrategy;
};
```
