---
title: "NiuClientOptions"
description: "Generated TypeScript declaration for NiuClientOptions"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type NiuClientOptions = {
    apiKey: string;
    /** Optional workspace API key ID when apiKey is a console session token. Sends X-Niu-Key-Id. */
    keyId?: string;
    /** Defaults to Authorization: Bearer. Use x-niu-api-key to preserve a separate provider Authorization header. */
    credentialHeader?: NiuCredentialHeader;
    baseURL?: string;
    fetch?: typeof globalThis.fetch;
    defaultHeaders?: HeadersInit;
};
```
