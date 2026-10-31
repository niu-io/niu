---
title: "NiuClient"
description: "Generated TypeScript declaration for NiuClient"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

## Constructor and members

### constructor

```typescript
constructor(options: NiuClientOptions);
```

### listEvaluations

```typescript
listEvaluations(after?: string, options?: RequestOptions): Promise<EvaluationPage<EvaluationDefinition>>;
```

### getEvaluation

```typescript
getEvaluation(slug: string, revision?: number, options?: RequestOptions): Promise<EvaluationDefinition>;
```

### setEvaluation

```typescript
setEvaluation(configuration: EvaluationDefinition, options?: RequestOptions): Promise<EvaluationDefinition>;
```

### fingerprintEvaluationRequest

```typescript
fingerprintEvaluationRequest(protocol: EvaluationDefinition['protocol'], request: Record<string, unknown>, options?: RequestOptions): Promise<{
    request_sha256: string;
    fingerprint_version: 1;
    protocol: string;
    inference_performed: false;
}>;
```

### listEvaluationAttempts

```typescript
/** Snapshot discovery: restart pagination for new work. Absence does not prove no execution. */
listEvaluationAttempts(slug: string, revision: number, sample: string, after?: string, options?: RequestOptions): Promise<EvaluationPage<Record<string, unknown>>>;
```

### listEvaluationRuns

```typescript
listEvaluationRuns(slug: string, after?: string, options?: RequestOptions): Promise<EvaluationPage<EvaluationRunBrief>>;
```

### recordEvaluationRun

```typescript
/** No inference. Same slug/submission replays the original immutable receipt. */
recordEvaluationRun(slug: string, submission: EvaluationRunSubmission, options?: RequestOptions): Promise<EvaluationReceipt>;
```

### getEvaluationRun

```typescript
getEvaluationRun(slug: string, run: string, options?: RequestOptions): Promise<EvaluationReceipt>;
```

### compareEvaluationRuns

```typescript
compareEvaluationRuns(slug: string, left: string, right: string, options?: RequestOptions): Promise<EvaluationComparison>;
```

### listEventSubscriptions

```typescript
/** Requires events:read; never returns a signing secret. */
listEventSubscriptions(options?: RequestOptions): Promise<{
    data: EventSubscription[];
    limit: 32;
}>;
```

### getEventSubscription

```typescript
getEventSubscription(slug: string, options?: RequestOptions): Promise<{
    data: EventSubscription;
    processed_cursor: string;
    authorization_active: boolean;
}>;
```

### setEventSubscription

```typescript
/** Requires events:write. Creation/rotation returns a secret ONCE: persist privately and never log it. No automatic retry on lost responses. */
setEventSubscription(configuration: EventSubscription, rotateSecret?: boolean, options?: RequestOptions): Promise<{
    data: EventSubscription;
    signing_secret?: string;
}>;
```

### listWorkspaceEvents

```typescript
listWorkspaceEvents(after?: string, options?: RequestOptions): Promise<{
    data: WorkspaceEvent[];
    has_more: boolean;
    next_after: string;
    retention: 'no_pruning';
}>;
```

### getEventSubscriptionHistory

```typescript
getEventSubscriptionHistory(slug: string, before?: number, options?: RequestOptions): Promise<{
    data: EventSubscription[];
    next_before: number | null;
}>;
```

### getEventDeliveries

```typescript
getEventDeliveries(slug: string, options?: RequestOptions): Promise<{
    data: EventDelivery[];
    limit: 100;
}>;
```

### testEventSubscription

```typescript
/** Queues a targeted test; this is not receiver acknowledgement. Repetition creates a new event. */
testEventSubscription(slug: string, revision: number, options?: RequestOptions): Promise<{
    data: {
        id: string;
        sequence: string;
        type: 'subscription.test';
        subscription_revision: number;
        delivery: 'queued';
    };
}>;
```

### listPools

```typescript
/** Requires delegated pools:read. No inference or live qualification occurs. */
listPools(after?: string, options?: RequestOptions): Promise<{
    data: WorkspaceModelPool[];
    has_more: boolean;
    next_after: string | null;
}>;
```

### getPool

```typescript
getPool(slug: string, options?: RequestOptions): Promise<{
    data: WorkspaceModelPool;
}>;
```

### previewPool

```typescript
/** Non-dispatching policy/metadata simulation; never proves live access or full input validity. */
previewPool(configuration: WorkspaceModelPool, context?: WorkspacePoolPreviewContext, options?: RequestOptions): Promise<{
    data: WorkspacePoolPreview;
}>;
```

### setPool

```typescript
/** Requires delegated pools:write. Conflicts must be read and reconciled; never automatically replay. */
setPool(configuration: WorkspaceModelPool, options?: RequestOptions): Promise<{
    data: WorkspaceModelPool;
}>;
```

### getPoolHistory

```typescript
getPoolHistory(slug: string, before?: number, options?: RequestOptions): Promise<{
    data: WorkspaceModelPool[];
    next_before: number | null;
}>;
```

### getPoolSelections

```typescript
/** Latest 100 selections; retrieve generation diagnostics for terminal state and charges. */
getPoolSelections(slug: string, options?: RequestOptions): Promise<{
    data: WorkspacePoolSelection[];
}>;
```

### getPublicBranding

```typescript
/** Public branding projection; the regular client credential does not expand it. */
getPublicBranding(options?: RequestOptions): Promise<import('./admin.js').BrandingConfiguration>;
```

### getKey

```typescript
/** Inspect the current API key's label, model grants, limits, and 60s usage window. */
getKey(options?: RequestOptions): Promise<{
    data: KeyIntrospection;
}>;
```

### getGeneration

```typescript
/** Retrieve token breakdown, timings, and customer charge for one generation attempt. */
getGeneration(id: string, options?: RequestOptions): Promise<{
    data: GenerationView;
}>;
```

### imageSources

```typescript
readonly imageSources: {
    prepare: (input: {
        image: string;
        valid_for_seconds: number;
    }, options?: RequestOptions) => Promise<{
        data: {
            source_id: string;
            retained: true;
            retention_seconds: number;
        };
    }>;
    erase: (id: string, options?: RequestOptions) => Promise<void>;
};
```

### imageIngestions

```typescript
readonly imageIngestions: {
    list: (query?: {
        before?: string;
    }, options?: RequestOptions) => Promise<{
        data: ImageIngestionConsentStatus[];
        next_cursor: string | null;
    }>;
    readiness: {
        refresh: (id: string, readId: string, options?: RequestOptions) => Promise<{
            data: ImageReadinessObservation;
        }>;
        retrieve: (id: string, readId: string, options?: RequestOptions) => Promise<{
            data: ImageReadinessObservation;
        }>;
    };
    dispatch: (id: string, options?: RequestOptions) => Promise<{
        data: ImageIngestionConsentStatus;
    }>;
    prepare: (id: string, input: ImageIngestionConsentInput, options?: RequestOptions) => Promise<{
        data: ImageIngestionConsentStatus;
    }>;
    retrieve: (id: string, options?: RequestOptions) => Promise<{
        data: ImageIngestionConsentStatus;
    }>;
    revoke: (id: string, options?: RequestOptions) => Promise<void>;
};
```

### media

```typescript
media: {
    capabilities: (model?: string, options?: RequestOptions) => Promise<import("./provider-capabilities.js").NativeProviderCapabilities>;
    verification: {
        create: (input: import("./media-verification.js").MediaVerificationInput, options?: import("./media-assets.js").MediaAssetMutationOptions) => Promise<{
            data: import("./media-verification.js").MediaVerificationSession;
        }>;
        list: (input: {
            model: string;
            after?: string;
            limit?: number;
        }, options?: RequestOptions) => Promise<{
            data: import("./media-verification.js").MediaVerificationSession[];
            next_cursor: string | null;
        }>;
        retrieve: (id: string, model: string, options?: RequestOptions) => Promise<{
            data: import("./media-verification.js").MediaVerificationSession;
        }>;
        link: (id: string, model: string, options?: RequestOptions) => Promise<import("./media-verification.js").MediaVerificationLink>;
        refresh: (id: string, model: string, options?: RequestOptions) => Promise<{
            data: import("./media-verification.js").MediaVerificationSession;
        }>;
    };
    groups: {
        list: (input: {
            model: string;
            after?: string;
            limit?: number;
        }, options?: RequestOptions) => Promise<import("./media-assets.js").MediaAssetPage<import("./media-assets.js").MediaAssetGroup>>;
        create: (input: {
            model: string;
            name: string;
            description?: string;
        }, options?: import("./media-assets.js").MediaAssetMutationOptions) => Promise<import("./media-assets.js").MediaAssetMutation>;
        retrieve: (id: string, model: string, options?: RequestOptions) => Promise<{
            data: import("./media-assets.js").MediaAssetGroup;
        }>;
        update: (id: string, input: {
            model: string;
            name?: string;
            description?: string;
            expected_revision?: string;
        }, options?: import("./media-assets.js").MediaAssetMutationOptions) => Promise<import("./media-assets.js").MediaAssetMutation>;
        delete: (id: string, input: {
            model: string;
            expected_revision?: string;
        }, options?: import("./media-assets.js").MediaAssetMutationOptions) => Promise<import("./media-assets.js").MediaAssetMutation>;
        refresh: (id: string, model: string, options?: RequestOptions) => Promise<{
            data: import("./media-assets.js").MediaAssetGroup;
        }>;
    };
    assets: {
        list: (input: {
            model: string;
            after?: string;
            limit?: number;
        } & {
            group_id?: string;
        }, options?: RequestOptions) => Promise<import("./media-assets.js").MediaAssetPage<import("./media-assets.js").MediaAsset>>;
        create: (input: {
            model: string;
            group_id: string;
            url: string;
            name?: string;
            kind: "image" | "video" | "audio";
        }, options?: import("./media-assets.js").MediaAssetMutationOptions) => Promise<import("./media-assets.js").MediaAssetMutation>;
        retrieve: (id: string, model: string, options?: RequestOptions) => Promise<{
            data: import("./media-assets.js").MediaAsset;
        }>;
        update: (id: string, input: {
            model: string;
            name: string;
            expected_revision?: string;
        }, options?: import("./media-assets.js").MediaAssetMutationOptions) => Promise<import("./media-assets.js").MediaAssetMutation>;
        delete: (id: string, input: {
            model: string;
            expected_revision?: string;
        }, options?: import("./media-assets.js").MediaAssetMutationOptions) => Promise<import("./media-assets.js").MediaAssetMutation>;
        refresh: (id: string, model: string, options?: RequestOptions) => Promise<{
            data: import("./media-assets.js").MediaAsset;
        }>;
    };
    operations: {
        prepare: (input: import("./media-assets.js").MediaAssetOperationInput, options: import("./media-assets.js").MediaAssetPreparationOptions) => Promise<import("./media-assets.js").MediaAssetMutation>;
        dispatch: (id: string, input: import("./media-assets.js").MediaAssetOperationInput, options: import("./media-assets.js").MediaAssetPreparationOptions) => Promise<import("./media-assets.js").MediaAssetMutation>;
        cancel: (id: string, model: string, options?: RequestOptions) => Promise<{
            data: import("./media-assets.js").MediaAssetOperation;
        }>;
        list: (input: {
            model: string;
            after?: string;
            limit?: number;
        }, options?: RequestOptions) => Promise<import("./media-assets.js").MediaAssetPage<import("./media-assets.js").MediaAssetOperation>>;
        retrieveByIdempotency: (idempotencyKey: string, model: string, options?: RequestOptions) => Promise<{
            data: import("./media-assets.js").MediaAssetOperation;
        }>;
        retrieve: (id: string, model: string, options?: RequestOptions) => Promise<{
            data: import("./media-assets.js").MediaAssetOperation;
        }>;
    };
};
```

### video

```typescript
readonly video: {
    generate: (input: NiuVideoGenerationInput, options?: VideoCreateOptions) => Promise<VideoJobState>;
    models: {
        list: (options?: RequestOptions) => Promise<VideoModelList>;
    };
    estimate: (request: VideoCreateRequest, options?: RequestOptions) => Promise<VideoEstimate>;
    jobs: {
        wait: (id: string, options?: VideoWaitOptions) => Promise<VideoJobState>;
        results: {
            status: (id: string, options?: RequestOptions) => Promise<VideoResultAvailability>;
            retrieve: (id: string, kind: 'video' | 'last_frame', options?: RequestOptions) => Promise<Response>;
            refresh: (id: string, kind: 'video' | 'last_frame', options?: RequestOptions) => Promise<Response>;
            delete: (id: string, options?: RequestOptions) => Promise<{
                deleted: true;
            }>;
        };
        list: (query?: VideoJobHistoryQuery, options?: RequestOptions) => Promise<VideoJobHistory>;
        billing: (id: string, options?: RequestOptions) => Promise<VideoJobBilling>;
        timings: (id: string, options?: RequestOptions) => Promise<VideoTransportTimings>;
        observations: (id: string, query?: VideoQueryObservationQuery, options?: RequestOptions) => Promise<VideoQueryObservationPage>;
        refresh: (id: string, options?: RequestOptions) => Promise<VideoJobState>;
        create: (request: VideoCreateRequest, options?: VideoCreateOptions) => Promise<VideoJobState>;
        retrieve: (id: string, options?: RequestOptions) => Promise<VideoJobState>;
    };
};
```

### models

```typescript
readonly models: {
    list: (options?: RequestOptions) => Promise<ModelList>;
};
```

### embeddings

```typescript
readonly embeddings: {
    create: (request: EmbeddingRequest, options?: RequestOptions) => Promise<EmbeddingResponse>;
};
```

### generateContent

```typescript
readonly generateContent: (model: string, request: GenerateContentRequest, options?: RequestOptions) => Promise<GenerateContentResponse>;
```

### messages

```typescript
readonly messages: {
    create: (request: MessagesRequest, options?: RequestOptions) => Promise<MessagesResponse>;
    stream: (request: MessagesStreamRequest, options?: RequestOptions) => AsyncGenerator<unknown>;
};
```

### responses

```typescript
readonly responses: {
    create: (request: ResponsesRequest, options?: RequestOptions) => Promise<ResponsesResponse>;
    stream: (request: ResponsesRequest, options?: RequestOptions) => AsyncGenerator<unknown>;
};
```

### chat

```typescript
readonly chat: {
    completions: (request: ChatCompletionRequest, options?: RequestOptions) => Promise<ChatCompletionResponse>;
    stream: (request: ChatStreamRequest, options?: RequestOptions) => AsyncGenerator<unknown>;
};
```
