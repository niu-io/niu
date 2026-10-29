---
title: "GuardrailPolicy"
description: "Generated TypeScript declaration for GuardrailPolicy"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GuardrailPolicy = {
    schema_version: 1;
    name: string;
    models: GuardrailAccessRule;
    providers: GuardrailAccessRule;
    input_rules?: GuardrailInputTest['rules'];
    input_detectors?: Array<{
        detector: string;
        configuration_fingerprint: string;
        consent_to_external_processing: true;
    }>;
    image_detectors?: Array<{
        detector: string;
        configuration_fingerprint: string;
        consent_to_image_processing: true;
    }>;
    output?: {
        mode: 'buffered_full' | 'observe_only';
        rules: GuardrailInputTest['rules'];
    };
};
```
