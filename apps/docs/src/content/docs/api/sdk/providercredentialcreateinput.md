---
title: "ProviderCredentialCreateInput"
description: "Generated TypeScript declaration for ProviderCredentialCreateInput"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Write-only secret input; creation does not establish upstream or commercial qualification. */
export type ProviderCredentialCreateInput = {
    name: string;
    adapter: 'openrouter' | 'openai' | 'anthropic' | 'gemini' | 'ark';
    api_base: string;
    api_key: string;
    enabled?: boolean;
    create_supplier?: boolean;
    supplier_id?: string;
    /** Explicit account paying upstream directly; saved atomically with this credential. */
    personal_organization_id?: string;
    /** Explicit access: personal is restricted to the funding account; internal is shared with every organization while Internal use is active and rejected in Resale. Omit only for compatibility with an explicit funding account (personal) or Resale shared commercial supply. */
    access_scope?: 'personal' | 'internal';
};
```
