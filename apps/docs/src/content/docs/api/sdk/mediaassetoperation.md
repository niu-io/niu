---
title: "MediaAssetOperation"
description: "Generated TypeScript declaration for MediaAssetOperation"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/media-assets.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type MediaAssetOperation = {
    id: string;
    group_id: string;
    asset_id: string | null;
    model: string;
    action: 'create_group' | 'update_group' | 'delete_group' | 'create_asset' | 'rename_asset' | 'delete_asset';
    status: 'prepared' | 'unknown' | 'acknowledged' | 'not_sent';
    http_status: number | null;
    request_id: string | null;
    /** Observed diagnostic only; never proof of nonexecution or permission to replay. */
    diagnostic?: {
        category: 'transport' | 'timeout' | 'response_too_large' | 'invalid_response' | 'upstream_rejected';
        phase: 'exchange' | 'response' | 'acknowledgement';
    } | null;
    created_at_ms: number;
    updated_at_ms: number;
};
```
