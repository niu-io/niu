---
title: "BrandingSettings"
description: "Generated TypeScript declaration for BrandingSettings"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Deployment display settings only; no credentials or procurement configuration. */
export type BrandingSettings = {
    display_name: string;
    default_appearance: 'system' | 'light' | 'dark';
    logo_data_url?: string | null;
    favicon_data_url?: string | null;
    light: Partial<Record<BrandingColorToken, string>>;
    dark: Partial<Record<BrandingColorToken, string>>;
};
```
