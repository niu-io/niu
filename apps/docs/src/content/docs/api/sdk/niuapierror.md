---
title: "NiuAPIError"
description: "Generated TypeScript declaration for NiuAPIError"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

## Constructor and members

### constructor

```typescript
constructor(status: number, responseBody: unknown, requestId?: string, attemptId?: string, operationId?: string, gatewayCode?: string, retryAfter?: string);
```

### status

```typescript
readonly status: number;
```

### requestId

```typescript
readonly requestId?: string;
```

### attemptId

```typescript
readonly attemptId?: string;
```

### operationId

```typescript
readonly operationId?: string;
```

### responseBody

```typescript
readonly responseBody: unknown;
```

### gatewayCode

```typescript
/** Niu-specific reason when the operation supplies x-niu-error-code. */
readonly gatewayCode?: string;
```

### retryAfter

```typescript
/** Raw Retry-After value, when supplied. Absence is not permission to retry. */
readonly retryAfter?: string;
```

### fromResponse

```typescript
static fromResponse(response: Response, payload: unknown): NiuAPIError;
```
