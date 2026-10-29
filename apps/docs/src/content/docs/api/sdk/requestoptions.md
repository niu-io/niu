---
title: "RequestOptions"
description: "Generated TypeScript declaration for RequestOptions"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type RequestOptions = {
    signal?: AbortSignal;
    /** Called once when response headers arrive, including streams and HTTP errors. Does not consume the body. */
    onResponse?: (metadata: ResponseMetadata) => void;
    /** Override payload retention for this request. Metadata collection is unaffected. */
    logPayloads?: boolean;
};
```
