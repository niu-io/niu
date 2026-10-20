---
title: "NiuStreamError"
description: "Generated TypeScript declaration for NiuStreamError"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

## Constructor and members

### constructor

```typescript
constructor(kind: NiuStreamError['kind'], message: string, response: Response, responseBody?: unknown, eventType?: string, cause?: unknown);
```

### kind

```typescript
readonly kind: 'api' | 'invalid_stream' | 'incomplete_stream' | 'transport';
```

### eventType

```typescript
readonly eventType?: string;
```
