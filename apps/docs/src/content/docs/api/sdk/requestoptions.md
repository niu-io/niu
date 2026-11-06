---
title: "RequestOptions"
description: "Generated TypeScript declaration for RequestOptions"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type RequestOptions = {
    /** Opt-in binding: evaluation-slug@revision/sample. Requires evaluations:read. */
    evaluation?: string;
    /**
     * Optional bounded task context for an explicitly selected semantic Auto
     * policy on a `pool/<slug>` request. Values are lowercase tokens up to 64
     * characters. Sent as `x-niu-routing-context`; not forwarded upstream.
     */
    routingContext?: WorkspaceRoutingContext;
    signal?: AbortSignal;
    /** Called once when response headers arrive, including streams and HTTP errors. Does not consume the body. */
    onResponse?: (metadata: ResponseMetadata) => void;
    /** Override payload retention for this request. Metadata collection is unaffected. */
    logPayloads?: boolean;
};
```
