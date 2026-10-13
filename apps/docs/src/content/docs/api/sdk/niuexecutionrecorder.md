---
title: "NiuExecutionRecorder"
description: "Generated TypeScript declaration for NiuExecutionRecorder"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/execution.ts). [All SDK types](/docs/api/sdk/).

## Constructor and members

### constructor

```typescript
constructor(options: ExecutionRecorderOptions);
```

### setCoverage

```typescript
setCoverage(coverage: ExecutionCoverage): void;
```

### startSpan

```typescript
startSpan(kind: Exclude<ExecutionSpanKind, 'task'>, options?: StartExecutionSpanOptions): string;
```

### endSpan

```typescript
endSpan(spanId: string, status?: Exclude<ExecutionSpanStatus, 'running'>): void;
```

### setModelEvidence

```typescript
setModelEvidence(spanId: string, evidence: ModelExecutionEvidence): void;
```

### withSpan

```typescript
withSpan<T>(kind: Exclude<ExecutionSpanKind, 'task'>, options: StartExecutionSpanOptions, operation: (spanId: string) => T | Promise<T>): Promise<T>;
```

### addLink

```typescript
addLink(from: string, to: string, kind: ExecutionLinkKind): void;
```

### addOutcome

```typescript
addOutcome(outcome: ExecutionOutcomeV1): void;
```

### finish

```typescript
finish(status?: Exclude<ExecutionSpanStatus, 'running'>): void;
```

### export

```typescript
/** Returns a defensive copy ready for metadata-only import. */
export(): ExecutionRecordV1;
```
