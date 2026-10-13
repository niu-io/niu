---
title: "NiuClient"
description: "Generated TypeScript declaration for NiuClient"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

## Constructor and members

### constructor

```typescript
constructor(options: NiuClientOptions);
```

### getPublicBranding

```typescript
/** Public branding projection; the regular client credential does not expand it. */
getPublicBranding(options?: RequestOptions): Promise<import('./admin.js').BrandingConfiguration>;
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
