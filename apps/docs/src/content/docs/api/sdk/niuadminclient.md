---
title: "NiuAdminClient"
description: "Generated TypeScript declaration for NiuAdminClient"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

## Constructor and members

### constructor

```typescript
constructor(options: NiuAdminOptions);
```

### updateOperatorRole

```typescript
/** Owner-only scoped role change. Preserves sessions/scope; reload after a stale-role409.
 * Rejects self changes and protected actors. Never issues a replacement token.
 */
updateOperatorRole(operatorId: string, input: OperatorRoleUpdate, options?: RequestOptions): Promise<{
    data: OperatorAccessView;
}>;
```

### getMemberProfile

```typescript
/** Read the current member; this never selects a caller-supplied operator ID. */
getMemberProfile(options?: RequestOptions): Promise<{
    data: MemberProfile;
}>;
```

### updateMemberProfile

```typescript
/** Omitted/null avatar clears it. Stale revision returns 409; reload before retry. */
updateMemberProfile(input: MemberProfileUpdate, options?: RequestOptions): Promise<{
    data: MemberProfile;
}>;
```

### getMemberPreferences

```typescript
/** A missing saved preference resolves to the deployment default appearance. */
getMemberPreferences(options?: RequestOptions): Promise<{
    data: MemberPreferences;
}>;
```

### updateMemberPreferences

```typescript
/** Saves the current member's preference in backend storage. */
updateMemberPreferences(input: MemberPreferences, options?: RequestOptions): Promise<{
    data: MemberPreferences;
}>;
```

### listSupplierMembers

```typescript
/** Platform-only membership history, including inactive and revoked members. */
listSupplierMembers(supplierId: string, options?: RequestOptions): Promise<{
    data: SupplierMember[];
}>;
```

### setSupplierMember

```typescript
/** Grant/change/revoke a membership; Supplier roles do not grant platform configuration authority. */
setSupplierMember(supplierId: string, operatorId: string, input: SupplierMemberUpdate, options?: RequestOptions): Promise<{
    data: {
        active: boolean;
    };
}>;
```

### listSupplierBusinesses

```typescript
/** Platform directory; configuration counts include retained disabled configurations. */
listSupplierBusinesses(options?: RequestOptions): Promise<{
    data: SupplierBusiness[];
}>;
```

### createSupplierBusiness

```typescript
/** Create a business identity; this does not qualify supply or publish an offer. */
createSupplierBusiness(name: string, options?: RequestOptions): Promise<{
    data: {
        id: string;
    };
}>;
```

### deleteSupplierBusiness

```typescript
/** Only an unconfigured Supplier can be removed; dependent configurations/offers/memberships return 409. */
deleteSupplierBusiness(supplierId: string, options?: RequestOptions): Promise<{
    data: {
        deleted: true;
    };
}>;
```

### getSupplierProfile

```typescript
/** Platform administration only; metadata contains no credentials or procurement prices. */
getSupplierProfile(supplierId: string, options?: RequestOptions): Promise<{
    data: SupplierProfile;
}>;
```

### updateSupplierProfile

```typescript
/** Empty strings clear optional metadata; omission/null preserves it. Retain the last read revision. */
updateSupplierProfile(supplierId: string, input: SupplierProfileUpdate, options?: RequestOptions): Promise<{
    data: SupplierProfile;
}>;
```

### getRoutingRegistryStatus

```typescript
/** Read the current publication for diagnostics or an explicit static replacement. */
getRoutingRegistryStatus(options?: RequestOptions): Promise<{
    data: RoutingRegistryStatus;
}>;
```

### listWorkspacesPage

```typescript
/** A bounded directory page. Keep credentials fixed while following next_cursor. */
listWorkspacesPage(page?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: Workspace[];
    next_cursor: string | null;
}>;
```

### listWorkspaces

```typescript
/** Traverse the complete authorized directory; errors never return a partial result. */
listWorkspaces(options?: RequestOptions): Promise<{
    data: Workspace[];
}>;
```

### listCompaniesPage

```typescript
/** Read a scoped page; a missing or foreign cursor returns 409. */
listCompaniesPage(page?: CompanyPageOptions, options?: RequestOptions): Promise<CompanyPage>;
```

### listCompanies

```typescript
/** Traverse every authorized page; never return partial results after an error. */
listCompanies(options?: RequestOptions): Promise<{
    data: CompanyMetadata[];
}>;
```

### createCompany

```typescript
/** Installation-only atomic company/account creation; retain idempotencyKey on uncertain responses. */
createCompany(input: CompanyCreationInput, options?: CompanyCreateOptions): Promise<CreatedCompany>;
```

### createWorkspace

```typescript
/** Use options.idempotencyKey for safe replay. Installation credentials without an organization create a zero-funded USD company. */
createWorkspace(input: WorkspaceInput, options?: WorkspaceCreateOptions): Promise<Workspace>;
```

### renameWorkspaceById

```typescript
/** Renaming preserves the backend-assigned routing reference. */
/** Workspace-id alias; the legacy company/workspace method remains available. */
renameWorkspaceById(workspaceId: string, name: string, options?: RequestOptions): Promise<{
    id: string;
    name: string;
}>;
```

### deleteWorkspaceById

```typescript
/** Deletes only an empty workspace under the existing company-owner restrictions. */
deleteWorkspaceById(workspaceId: string, options?: RequestOptions): Promise<void>;
```

### renameWorkspace

```typescript
/** Accept workspace IDs for current callers and scoped legacy references for compatibility. */
renameWorkspace(scope: TenantScope | string, name: string, options?: RequestOptions): Promise<{
    id: string;
    name: string;
}>;
```

### deleteWorkspace

```typescript
/** Only eligible empty workspaces may be deleted; existing business data is protected. */
deleteWorkspace(scope: TenantScope | string, options?: RequestOptions): Promise<void>;
```

### resolveWorkspaceRoute

```typescript
/** Exact persisted route lookup; missing and out-of-scope workspaces both return 404. */
resolveWorkspaceRoute(routeSlug: string, options?: RequestOptions): Promise<WorkspaceRoute>;
```

### listSupplierMemberships

```typescript
/** Complete active Supplier grants for the signed-in operator; installation sessions return an empty list. */
listSupplierMemberships(options?: RequestOptions): Promise<{
    data: SupplierMembership[];
}>;
```

### getFinancialRecoveryDiagnostics

```typescript
/** Platform-only committed recovery progress; null fields mean no recorded worker step. */
getFinancialRecoveryDiagnostics(options?: RequestOptions): Promise<FinancialRecoveryDiagnostics>;
```

### listPaymentIntegrations

```typescript
/** Platform administrator inventory; does not imply merchant activation or enabled checkout. */
listPaymentIntegrations(options?: RequestOptions): Promise<{
    data: PaymentIntegration[];
}>;
```

### getPlatformEPayConfiguration

```typescript
/** Platform administrator read. Public display settings also exist at GET /v1/branding. */
getPlatformEPayConfiguration(options?: RequestOptions): Promise<{
    data: EPayConfiguration;
}>;
```

### savePlatformEPayConfiguration

```typescript
/** Revision checked; no implicit retry or merchant activation claim. */
savePlatformEPayConfiguration(input: EPayConfigurationInput, options?: RequestOptions): Promise<{
    data: EPayConfiguration;
}>;
```

### listPlatformAuditEvents

```typescript
/** Platform-only durable operation metadata. Reads never modify configuration. */
listPlatformAuditEvents(query?: PlatformAuditQuery, options?: RequestOptions): Promise<PlatformAuditPage>;
```

### generations

```typescript
/** Actor-private saved timelines; explicit task actions query existing work only. */
generations(scope: TenantScope): {
    sessions: {
        list(query?: import("./generations-sessions.js").GenerationsSessionPageOptions, options?: {
            signal?: AbortSignal;
        }): Promise<import("./generations-sessions.js").VideoGenerationsSessionPage>;
        listChat(query?: import("./generations-sessions.js").GenerationsSessionPageOptions, options?: {
            signal?: AbortSignal;
        }): Promise<import("./generations-sessions.js").ChatGenerationsSessionPage>;
        retrieveChat(session: string, options?: {
            signal?: AbortSignal;
        }): Promise<{
            data: import("./generations-sessions.js").ChatGenerationsSession;
        }>;
        retrieve(session: string, options?: {
            signal?: AbortSignal;
        }): Promise<{
            data: import("./generations-sessions.js").VideoGenerationsSession;
        }>;
        create(session: string, input: {
            title: string;
        }, options?: {
            signal?: AbortSignal;
        }): Promise<{
            data: import("./generations-sessions.js").VideoGenerationsSession;
        }>;
        update(session: string, input: {
            expected_revision: string;
            title: string;
            archived: boolean;
        }, options?: {
            signal?: AbortSignal;
        }): Promise<{
            data: import("./generations-sessions.js").VideoGenerationsSession;
        }>;
        appendTurn(session: string, turn: string, input: {
            expected_revision: string;
            instruction: import("./generations-sessions.js").GenerationsInstruction;
        }, options?: {
            signal?: AbortSignal;
        }): Promise<{
            data: import("./generations-sessions.js").VideoGenerationsSession;
        }>;
        attachTask(session: string, turn: string, input: {
            expected_revision: string;
            task_id: string;
        }, options?: {
            signal?: AbortSignal;
        }): Promise<{
            data: import("./generations-sessions.js").VideoGenerationsSession;
        }>;
        bindIntent(session: string, turn: string, input: {
            expected_revision: string;
            intent_id: string;
        }, options?: {
            signal?: AbortSignal;
        }): Promise<{
            data: import("./generations-sessions.js").VideoGenerationsSession;
        }>;
        deleteInstruction(session: string, turn: string, expectedRevision: string, options?: {
            signal?: AbortSignal;
        }): Promise<{
            data: import("./generations-sessions.js").VideoGenerationsSession;
        }>;
    };
    tasks: {
        list: (query?: GenerationInventoryQuery, options?: RequestOptions) => Promise<import("./generations-inventory.js").GenerationInventoryPage<import("./generations-inventory.js").GenerationTask>>;
        retrieve: (task: string, options?: RequestOptions) => Promise<{
            data: import("./generations-inventory.js").GenerationTask;
        }>;
        refresh: (task: string, options?: RequestOptions) => Promise<VideoJobState>;
        refreshResult(task: string, kind: GenerationArtifactKind, options?: RequestOptions): Promise<Response>;
        diagnostics: (task: string, options?: RequestOptions) => Promise<import("./generation-task-diagnostics.js").GenerationTaskDiagnostics>;
    };
    artifacts: {
        list: (query?: GenerationInventoryQuery, options?: RequestOptions) => Promise<import("./generations-inventory.js").GenerationInventoryPage<import("./generations-inventory.js").GenerationArtifact>>;
        retrieve: (task: string, kind: GenerationArtifactKind, options?: RequestOptions) => Promise<{
            data: import("./generations-inventory.js").GenerationArtifact;
        }>;
        content: (task: string, kind: GenerationArtifactKind, options?: RequestOptions) => Promise<Response>;
        captureStatus(task: string, kind: GenerationArtifactKind, options?: RequestOptions): Promise<{
            data: import("./generation-artifact-capture.js").GenerationArtifactCapture;
        }>;
        capture(task: string, kind: GenerationArtifactKind, input: GenerationArtifactCaptureInput, options?: RequestOptions): Promise<{
            data: import("./generation-artifact-capture.js").GenerationArtifactCapture;
        }>;
    };
};
```

### getBranding

```typescript
getBranding(options?: RequestOptions): Promise<BrandingConfiguration>;
```

### saveBranding

```typescript
/** Revision-checked save. Empty palettes inherit Niu theme defaults. */
saveBranding(expectedRevision: string, settings: BrandingSettings, options?: RequestOptions): Promise<BrandingConfiguration>;
```

### listVideoIntents

```typescript
/** Actor-owned metadata only; retained request content requires retrieve permission. */
listVideoIntents(scope: TenantScope, query?: VideoJobHistoryQuery, options?: RequestOptions): Promise<VideoIntentIndex>;
```

### saveVideoIntent

```typescript
/** Persist an immutable request under a fresh client UUID. Does not generate or reserve funds. */
saveVideoIntent(scope: TenantScope, intentId: string, keyId: string, request: VideoIntentRequest, options?: RequestOptions): Promise<{
    data: VideoSubmissionIntent;
}>;
```

### getVideoIntent

```typescript
/** Actor-owned historical read independent of inference key expiry/revocation.
 * Returned key IDs are context only; submission still checks current authority. */
getVideoIntent(scope: TenantScope, intentId: string, options?: RequestOptions): Promise<{
    data: VideoSubmissionIntent;
}>;
```

### submitVideoIntent

```typescript
/** Explicit submission or replay. Never replace an uncertain submission with a fresh intent. */
submitVideoIntent(scope: TenantScope, intentId: string, expectedRevision: number, options?: RequestOptions): Promise<VideoJobState>;
```

### deleteVideoIntent

```typescript
/** Erase retained input; does not cancel generation, delete the job, or refund charges. */
deleteVideoIntent(scope: TenantScope, intentId: string, expectedRevision: number, options?: RequestOptions): Promise<VideoIntentDeletion>;
```

### cancelPreparedMediaOperation

```typescript
/** Cancel a prepared native-material operation with current workspace Write access.
 * Independent of inference-key expiry or revocation; never dispatches or cancels
 * an operation whose upstream outcome is unknown.
 */
cancelPreparedMediaOperation(scope: TenantScope, operationId: string, model: string, options?: RequestOptions): Promise<{
    data: {
        status: 'not_sent';
    };
}>;
```

### mediaOperationHistory

```typescript
/** Read saved native operations with current workspace Read access.
 * The original key may be expired or revoked. An optional saved group pins
 * its account binding; omitting it reads all saved accounts for this key/model.
 * This helper never dispatches, refreshes upstream state or restores key grants.
 */
mediaOperationHistory(scope: TenantScope, context: MediaOperationHistoryContext): {
    list: (query?: MediaOperationHistoryQuery, options?: RequestOptions) => Promise<MediaAssetPage<MediaAssetOperation>>;
    retrieve: (operationId: string, options?: RequestOptions) => Promise<{
        data: MediaAssetOperation;
    }>;
    retrieveByIdempotency: (idempotencyKey: string, options?: RequestOptions) => Promise<{
        data: MediaAssetOperation;
    }>;
};
```

### dashboardMedia

```typescript
/** Session-authenticated media with an explicit current key/account context. */
dashboardMedia(scope: TenantScope, keyId: string): {
    capabilities: (model?: string, options?: RequestOptions) => Promise<NativeProviderCapabilities>;
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
        }, options?: RequestOptions) => Promise<MediaAssetPage<import("./media-assets.js").MediaAssetGroup>>;
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
        }, options?: RequestOptions) => Promise<MediaAssetPage<import("./media-assets.js").MediaAsset>>;
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
            data: MediaAssetOperation;
        }>;
        list: (input: {
            model: string;
            after?: string;
            limit?: number;
        }, options?: RequestOptions) => Promise<MediaAssetPage<MediaAssetOperation>>;
        retrieveByIdempotency: (idempotencyKey: string, model: string, options?: RequestOptions) => Promise<{
            data: MediaAssetOperation;
        }>;
        retrieve: (id: string, model: string, options?: RequestOptions) => Promise<{
            data: MediaAssetOperation;
        }>;
    };
};
```

### listDashboardVideoJobs

```typescript
/** Uses the member session and current key grants; never requires the key secret. */
listDashboardVideoJobs(scope: TenantScope, keyId: string, query?: VideoJobHistoryQuery, options?: RequestOptions): Promise<VideoJobHistory>;
```

### listDashboardVideoModels

```typescript
listDashboardVideoModels(scope: TenantScope, keyId: string, options?: RequestOptions): Promise<VideoModelList>;
```

### estimateDashboardVideo

```typescript
estimateDashboardVideo(scope: TenantScope, keyId: string, input: VideoCreateRequest, options?: RequestOptions): Promise<VideoEstimate>;
```

### createDashboardVideoJob

```typescript
createDashboardVideoJob(scope: TenantScope, keyId: string, input: VideoCreateRequest, options?: VideoCreateOptions): Promise<VideoJobState>;
```

### getDashboardVideoJob

```typescript
getDashboardVideoJob(scope: TenantScope, keyId: string, jobId: string, options?: RequestOptions): Promise<VideoJobState>;
```

### getDashboardVideoBilling

```typescript
getDashboardVideoBilling(scope: TenantScope, keyId: string, jobId: string, options?: RequestOptions): Promise<VideoJobBilling>;
```

### getDashboardVideoObservations

```typescript
/** Saved safe query receipts; no polling or financial mutation. */
getDashboardVideoObservations(scope: TenantScope, keyId: string, jobId: string, query?: VideoQueryObservationQuery, options?: RequestOptions): Promise<VideoQueryObservationPage>;
```

### getDashboardVideoTimings

```typescript
getDashboardVideoTimings(scope: TenantScope, keyId: string, jobId: string, options?: RequestOptions): Promise<VideoTransportTimings>;
```

### refreshDashboardVideoJob

```typescript
/** May query the original Supplier job; never resubmits generation. */
refreshDashboardVideoJob(scope: TenantScope, keyId: string, jobId: string, options?: RequestOptions): Promise<VideoJobState>;
```

### getDashboardVideoResultsStatus

```typescript
getDashboardVideoResultsStatus(scope: TenantScope, keyId: string, jobId: string, options?: RequestOptions): Promise<VideoResultAvailability>;
```

### getDashboardVideoResult

```typescript
getDashboardVideoResult(scope: TenantScope, keyId: string, jobId: string, kind: 'video' | 'last_frame', options?: RequestOptions): Promise<Response>;
```

### refreshDashboardVideoResult

```typescript
/** Query the original task and deliver its current output once; never generates. */
refreshDashboardVideoResult(scope: TenantScope, keyId: string, jobId: string, kind: 'video' | 'last_frame', options?: RequestOptions): Promise<Response>;
```

### deleteDashboardVideoResults

```typescript
deleteDashboardVideoResults(scope: TenantScope, keyId: string, jobId: string, options?: RequestOptions): Promise<{
    deleted: true;
}>;
```

### getSupplierConfigurationUsage

```typescript
/** Platform-only current-configuration traffic, independent of offers and earnings.
 * Range totals are independent of model pagination; pages are live snapshots.
 */
getSupplierConfigurationUsage(supplierId: string, range: SupplierConfigurationUsageQuery, options?: RequestOptions): Promise<{
    data: SupplierConfigurationUsage;
}>;
```

### listSupplierOffersPage

```typescript
/** Current own-Supplier rates, with explicit alias continuation; no customer identities. */
listSupplierOffersPage(supplierId: string, page?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: SupplierOffer[];
    next_after: string | null;
}>;
```

### listSupplierOffers

```typescript
/** Traverse current offers; pages are not a frozen multi-request snapshot. */
listSupplierOffers(supplierId: string, options?: RequestOptions): Promise<SupplierOffer[]>;
```

### publishSupplierRates

```typescript
/** Platform-administrator publication of a new immutable rate revision and clears prior qualification. */
publishSupplierRates(supplierId: string, rates: SupplierRateInput, options?: RequestOptions): Promise<{
    data: {
        revision: string;
    };
}>;
```

### getSupplierOfferRevision

```typescript
/** Platform administration or active membership in this Supplier is required. */
getSupplierOfferRevision(supplierId: string, offerId: string, revisionId: string, options?: RequestOptions): Promise<{
    data: SupplierOfferRevision;
}>;
```

### listSupplierOfferHistory

```typescript
/** Scoped procurement history; follow next_before until has_more is false. */
listSupplierOfferHistory(supplierId: string, offerId: string, page?: {
    before?: string;
    limit?: number;
}, options?: RequestOptions): Promise<SupplierOfferHistory>;
```

### listSupplierEarnings

```typescript
/** Platform-only full earning history for settlement selection. IDs are never display labels. */
listSupplierEarnings(supplierId: string, page?: LedgerHistoryQuery, options?: RequestOptions): Promise<SupplierEarningPage>;
```

### recordSupplierSettlement

```typescript
/** Record confirmed external payment only; preserve the supplied key/reference/selection on retry. */
recordSupplierSettlement(supplierId: string, input: SupplierSettlementInput, options?: RequestOptions): Promise<{
    data: {
        id: string;
    };
}>;
```

### listSupplierSettlements

```typescript
/** All-time Supplier payment history; keep filters fixed while following next_cursor. */
listSupplierSettlements(supplierId: string, page?: SupplierSettlementQuery, options?: RequestOptions): Promise<SupplierSettlementPage>;
```

### qualifySupplier

```typescript
/** Platform-administrator review. Does not activate offers or verify the underlying evidence. */
qualifySupplier(supplierId: string, input: SupplierQualificationInput, options?: RequestOptions): Promise<{
    data: {
        qualification_status: 'qualified';
    };
}>;
```

### qualifySupplierOffer

```typescript
/** Platform-administrator qualification review, pinned to the current rate revision; does not activate the offer. */
qualifySupplierOffer(supplierId: string, offerId: string, input: SupplierOfferQualificationInput, options?: RequestOptions): Promise<{
    data: {
        qualification_status: 'qualified';
    };
}>;
```

### revokeSupplierQualification

```typescript
revokeSupplierQualification(supplierId: string, reasonSha256: string, options?: RequestOptions): Promise<{
    data: {
        qualification_status: 'revoked';
    };
}>;
```

### revokeSupplierOfferQualification

```typescript
revokeSupplierOfferQualification(supplierId: string, offerId: string, reasonSha256: string, options?: RequestOptions): Promise<{
    data: {
        qualification_status: 'revoked';
    };
}>;
```

### setSupplierOfferActive

```typescript
/** Requires Supplier owner/admin or installation access; activation still requires current qualification. */
setSupplierOfferActive(supplierId: string, offerId: string, active: boolean, options?: RequestOptions): Promise<{
    data: {
        active: boolean;
    };
}>;
```

### createWorkspaceKey

```typescript
/** Workspace owner/admin write access. Requires an explicit finite or null lifetime. */
createWorkspaceKey(scope: TenantScope, input: WorkspaceKeyCreateInput, options?: RequestOptions): Promise<IssuedWorkspaceKey>;
```

### updateWorkspaceKey

```typescript
/** Changes name/grants with optimistic revision; preserves lifetime and secret. */
updateWorkspaceKey(scope: TenantScope, keyId: string, input: WorkspaceKeyMetadataInput, options?: RequestOptions): Promise<{
    revision: number;
}>;
```

### rotateWorkspaceKey

```typescript
/** Returns the replacement secret once; preserves expiry and shared lineage limits. */
rotateWorkspaceKey(scope: TenantScope, keyId: string, options?: RequestOptions): Promise<IssuedWorkspaceKey>;
```

### revokeWorkspaceKey

```typescript
/** Blocks new access while retaining saved metadata and request history. */
revokeWorkspaceKey(scope: TenantScope, keyId: string, options?: RequestOptions): Promise<void>;
```

### listWorkspaceKeys

```typescript
/** Scoped key metadata without secrets; uncertain dispatches still count as last use. */
listWorkspaceKeys(scope: TenantScope, options?: RequestOptions): Promise<{
    data: WorkspaceKey[];
}>;
```

### listWorkspaceKeyPage

```typescript
/** Explicit bounded page; the complete-directory method remains compatible. */
listWorkspaceKeyPage(scope: TenantScope, query?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<WorkspaceKeyPage>;
```

### getCustomerBalance

```typescript
/** Shared company funds require organization-wide owner/admin authorization. */
getCustomerBalance(organizationId: string, options?: RequestOptions): Promise<{
    data: CustomerBalance[];
}>;
```

### getRequestUsageReconciliation

```typescript
/** Workspace read access. Missing receipt returns 404; never queries upstream or changes billing. */
getRequestUsageReconciliation(scope: TenantScope, attemptId: string, options?: RequestOptions): Promise<RequestUsageReconciliation>;
```

### reconcileRequestUsage

```typescript
/** Installation write only. Records supplemental usage; financial recovery settles separately. */
reconcileRequestUsage(scope: TenantScope, attemptId: string, options?: RequestOptions): Promise<RequestUsageReconciliation>;
```

### listCustomerBalanceReservations

```typescript
/** Company-wide balance permission required. Keep currency fixed while following next_before. */
listCustomerBalanceReservations(organizationId: string, page?: CustomerBalanceReservationQuery, options?: RequestOptions): Promise<{
    data: CustomerBalanceReservation[];
    next_before: string | null;
}>;
```

### getCustomerChargeReconciliation

```typescript
/** Read-only customer charge-to-ledger comparison; does not certify payment settlement. */
getCustomerChargeReconciliation(organizationId: string, options?: RequestOptions): Promise<{
    data: CustomerChargeReconciliation[];
}>;
```

### createCustomerTopup

```typescript
/** Create/replay a supported-currency top-up; preserve the idempotency key after uncertainty. No automatic retry. */
createCustomerTopup(organizationId: string, input: CustomerTopupInput, options?: RequestOptions): Promise<{
    data: CustomerTopup;
}>;
```

### getCustomerTopup

```typescript
/** Read saved status without an upstream query or payment mutation. */
getCustomerTopup(organizationId: string, orderId: string, options?: RequestOptions): Promise<{
    data: CustomerTopup;
}>;
```

### reconcileCustomerTopup

```typescript
/** Installation-only original-merchant query recovery. May perform an upstream query;
 * never creates a checkout or automatically retries. Pending EPay query recovery is unsupported.
 * Paid/closed status replays use durable local state without an upstream call. */
reconcileCustomerTopup(organizationId: string, orderId: string, options?: RequestOptions): Promise<{
    data: CustomerTopup;
}>;
```

### getCustomerPaymentMethods

```typescript
getCustomerPaymentMethods(organizationId: string, options?: RequestOptions & {
    currency?: string;
    payment_gateway?: CustomerTopupInput['payment_gateway'];
}): Promise<{
    data: CustomerPaymentMethods;
}>;
```

### listCustomerTopups

```typescript
listCustomerTopups(organizationId: string, options?: RequestOptions & {
    before?: string;
}): Promise<{
    data: (CustomerTopup & {
        created_at: string;
    })[];
    next_cursor: string | null;
}>;
```

### reverseCustomerBalanceEntry

```typescript
/** Installation-only ledger refund/reversal. Never initiates an external payment or automatically retries. */
reverseCustomerBalanceEntry(organizationId: string, entryId: string, input: CustomerBalanceReversalInput, options?: RequestOptions): Promise<{
    data: {
        recorded: true;
    };
}>;
```

### getCustomerBalanceTransactions

```typescript
/** Company ledger pages of up to 100 entries. Pass next_cursor as before. */
getCustomerBalanceTransactions(organizationId: string, options?: RequestOptions & {
    before?: string;
    currency?: string;
    kind?: CustomerBalanceTransaction['kind'];
}): Promise<{
    data: CustomerBalanceTransaction[];
    next_cursor: string | null;
}>;
```

### getCustomerBalancePolicyHistory

```typescript
/** Company-scoped immutable credit/warning revisions. Pass next_before for older pages. */
getCustomerBalancePolicyHistory(organizationId: string, currency: string, page?: {
    before?: string;
    limit?: number;
}, options?: RequestOptions): Promise<CustomerBalancePolicyHistory>;
```

### setCustomerBalancePolicy

```typescript
/** Installation-only approved credit policy. Changes borrowing capacity, never posts received funds. No automatic retry. */
setCustomerBalancePolicy(organizationId: string, currency: string, input: CustomerBalancePolicyInput, options?: RequestOptions): Promise<{
    data: {
        revision: string;
    };
}>;
```

### grantCustomerBalance

```typescript
/** Platform-only noncash gift. Reuse the same idempotency key for an exact retry; never creates a payment receipt. */
grantCustomerBalance(organizationId: string, currency: string, input: CustomerBalanceGrantInput, options?: RequestOptions): Promise<{
    data: {
        id: string;
    };
}>;
```

### setCustomerBalanceWarning

```typescript
/** Company warning preference only; cannot alter funds or approved credit. */
setCustomerBalanceWarning(organizationId: string, currency: string, input: {
    warning_threshold_nanos: string | null;
    expected_revision: string;
}, options?: RequestOptions): Promise<{
    data: {
        revision: string;
    };
}>;
```

### getCustomerBilling

```typescript
/** Customer-safe billing read; server workspace authorization is authoritative. */
getCustomerBilling(scope: TenantScope, options?: RequestOptions): Promise<{
    data: CustomerBilling;
}>;
```

### getCustomerTariffHistory

```typescript
/** Scoped immutable selling history; amount strings are never coerced to numbers. */
getCustomerTariffHistory(scope: TenantScope, model: string, page?: {
    before?: string;
    limit?: number;
}, options?: RequestOptions): Promise<CustomerTariffHistory>;
```

### listPlatformPricingModels

```typescript
/** Current shared tariff-eligible aliases; publication rechecks availability. */
listPlatformPricingModels(page?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: {
        model_alias: string;
    }[];
    next_after: string | null;
}>;
```

### getCommercialPosition

```typescript
/** Platform-only read; never changes routes or initiates payment. Unknown amounts remain null. */
getCommercialPosition(query: {
    currency: string;
    days?: 7 | 30 | 90;
}, options?: RequestOptions): Promise<CommercialPosition>;
```

### getCustomerFinancialSummary

```typescript
/** Platform-only posting summary. Cash receipts, gift issuance and net consumption revenue are distinct. */
getCustomerFinancialSummary(query: {
    currency: string;
    days?: 7 | 30 | 90;
}, options?: RequestOptions): Promise<CustomerFinancialSummary>;
```

### listPlatformPricingTargets

```typescript
/** Named pricing targets; platform permission does not grant customer data access. */
listPlatformPricingTargets(page?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: {
        organization_id: string;
        organization_name: string;
        workspace_id: string;
        workspace_name: string;
    }[];
    next_after: string | null;
}>;
```

### listPlatformCustomerTariffs

```typescript
/** Current selling prices only; pass next_after unchanged to continue. */
listPlatformCustomerTariffs(scope: TenantScope, page?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: (CustomerTariff & {
        created_at: string;
    })[];
    next_after: string | null;
}>;
```

### getPlatformCustomerTariffHistory

```typescript
/** Platform-only selling history, independent of customer content permissions. */
getPlatformCustomerTariffHistory(scope: TenantScope, model: string, page?: {
    before?: string;
    limit?: number;
}, options?: RequestOptions): Promise<CustomerTariffHistory>;
```

### publishCustomerTariff

```typescript
/** Explicit platform-administrator retail publication. No retry or Supplier-price fallback. */
publishCustomerTariff(scope: TenantScope, rates: CustomerTariffInput, options?: RequestOptions): Promise<{
    data: {
        revision: string;
    };
}>;
```

### publishCustomerMediaRate

```typescript
/** Platform-administrator video selling configuration; publication does not qualify dispatch. */
publishCustomerMediaRate(organizationId: string, input: CustomerMediaRateCard, options?: RequestOptions): Promise<{
    data: {
        revision: string;
    };
}>;
```

### listCustomerMediaRateModels

```typescript
/** Named qualified commercial video choices without procurement or credentials. */
listCustomerMediaRateModels(organizationId: string, page?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: CustomerMediaRateModel[];
    has_more: boolean;
    next_after: string | null;
}>;
```

### listCustomerMediaRates

```typescript
/** Platform-administrator customer price history; never includes purchase prices. */
listCustomerMediaRates(organizationId: string, page?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: CustomerMediaRateRecord[];
    has_more: boolean;
    next_after: string | null;
}>;
```

### replaceCustomerMediaRate

```typescript
/** Atomically replace a dimensional selling schedule; no automatic mutation retries. */
replaceCustomerMediaRate(organizationId: string, previousRevision: string, input: CustomerMediaRateCard, options?: RequestOptions): Promise<{
    data: {
        revision: string;
        effective_from: string;
    };
}>;
```

### publishSupplierMediaRate

```typescript
/** Platform-administrator agreed Supplier media purchase terms; independent from retail pricing. */
publishSupplierMediaRate(supplierId: string, input: SupplierMediaRateCard, options?: RequestOptions): Promise<{
    data: {
        revision: string;
    };
}>;
```

### replaceSupplierMediaRate

```typescript
/** Atomically publish new terms and end the previous schedule at their start. */
replaceSupplierMediaRate(supplierId: string, previousRevision: string, input: SupplierMediaRateCard, options?: RequestOptions): Promise<{
    data: {
        revision: string;
        effective_from: string;
    };
}>;
```

### listSupplierMediaRates

```typescript
/** Exact purchase history, authorized for installation or this Supplier's active member. */
listSupplierMediaRates(supplierId: string, page?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: SupplierMediaRateRecord[];
    has_more: boolean;
    next_after: string | null;
}>;
```

### listSupplierMediaRateModels

```typescript
/** Read named configuration choices without credentials or purchase/customer prices. */
listSupplierMediaRateModels(supplierId: string, page?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: SupplierMediaRateModel[];
    has_more: boolean;
    next_after: string | null;
}>;
```

### listSupplierMediaOfferModels

```typescript
/** Platform-administrator draft choices; no credentials, procurement or customer prices. Continue by next_after while has_more, even when data is empty. */
listSupplierMediaOfferModels(supplierId: string, page?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: SupplierMediaOfferModel[];
    has_more: boolean;
    next_after: string | null;
}>;
```

### publishSupplierMediaOffer

```typescript
/** Publishes an inactive media offer without text prices. Never retries automatically. */
publishSupplierMediaOffer(supplierId: string, input: SupplierMediaOfferInput, options?: RequestOptions): Promise<{
    data: {
        revision: string;
    };
}>;
```

### retireSupplierMediaRate

```typescript
/** Platform-administrator cutoff; existing purchase snapshots and earnings stay immutable. */
retireSupplierMediaRate(supplierId: string, revision: string, effectiveUntil: number, options?: RequestOptions): Promise<{
    data: {
        revision: string;
        effective_until: string;
    };
}>;
```

### retireCustomerMediaRate

```typescript
/** End eligibility without changing published prices or historical job snapshots. */
retireCustomerMediaRate(organizationId: string, revision: string, effectiveUntil: number, options?: RequestOptions): Promise<{
    data: {
        revision: string;
        effective_until: string;
    };
}>;
```

### listCustomerInvoices

```typescript
/** Full customer-only invoice history; existing balance debits count as settlement. */
listCustomerInvoices(scope: TenantScope, page?: LedgerHistoryQuery, options?: RequestOptions): Promise<CustomerInvoicePage>;
```

### issueCustomerInvoice

```typescript
/** Installation-only invoice closure. Preserve the caller's idempotency key on manual replay. */
issueCustomerInvoice(scope: TenantScope, input: CustomerInvoiceInput, options?: RequestOptions): Promise<{
    data: {
        id: string;
    };
}>;
```

### getCustomerInvoiceLines

```typescript
/** Workspace-authorized customer line items. Unknown/out-of-scope invoices return 404; amounts and token counts remain exact decimal strings. */
getCustomerInvoiceLines(scope: TenantScope, invoiceId: string, options?: RequestOptions, mediaAfter?: string): Promise<{
    data: CustomerInvoiceLine[];
    media_lines?: CustomerInvoiceMediaLine[];
    media_next_cursor?: string | null;
}>;
```

### recordCustomerInvoicePayment

```typescript
/** Installation-only record of a confirmed external payment; does not collect or transfer money. */
recordCustomerInvoicePayment(scope: TenantScope, invoiceId: string, paymentReference: string, options?: RequestOptions): Promise<{
    data: {
        id: string;
    };
}>;
```

### getWorkspaceGuardrail

```typescript
getWorkspaceGuardrail(scope: TenantScope, options?: RequestOptions): Promise<{
    data: {
        revision: number;
        policy: GuardrailPolicy;
    } | null;
}>;
```

### getKeyIpPolicy

```typescript
getKeyIpPolicy(scope: TenantScope, keyId: string, options?: RequestOptions): Promise<{
    data: KeyIpPolicy;
}>;
```

### setKeyIpPolicy

```typescript
/** Null allows all sources; [] denies all. Secret rotation preserves the policy. */
setKeyIpPolicy(scope: TenantScope, keyId: string, input: {
    allowed_cidrs: string[] | null;
    expected_revision: string;
}, options?: RequestOptions): Promise<{
    data: {
        revision: string;
    };
}>;
```

### listKeyIpPolicyHistory

```typescript
listKeyIpPolicyHistory(scope: TenantScope, keyId: string, query?: {
    beforeRevision?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: KeyIpPolicyRevision[];
}>;
```

### getKeyTokenUsageWindow

```typescript
/** Read known token subtotals; unknown requests are not zero usage. No TPM enforcement. */
getKeyTokenUsageWindow(scope: TenantScope, keyId: string, options?: RequestOptions): Promise<{
    data: KeyTokenUsageWindow;
}>;
```

### listSupplierCredentials

```typescript
/** All matching configurations, including disabled entries. No silent row cap.
 * Platform administration required; supplying a Supplier ID filters business ownership. */
listSupplierCredentials(query?: {
    supplierId?: string;
}, options?: RequestOptions): Promise<{
    data: SupplierCredential[];
}>;
```

### createSupplierCredential

```typescript
/** Platform-only creation; preserve the returned configuration identity. No automatic retry. */
createSupplierCredential(input: SupplierCredentialCreateInput, options?: RequestOptions): Promise<{
    data: Omit<SupplierCredential, 'supplier'>;
}>;
```

### updateSupplierCredential

```typescript
/** Optimistic update of one configuration. Omitted api_key preserves the secret. */
updateSupplierCredential(id: string, input: SupplierCredentialUpdateInput, options?: RequestOptions): Promise<{
    data: Omit<SupplierCredential, 'supplier'>;
}>;
```

### listSupplierModels

```typescript
/** Complete per-credential management inventory; availability is not commercial qualification. */
listSupplierModels(credentialId: string, options?: RequestOptions): Promise<{
    data: SupplierModelAvailability[];
}>;
```

### upsertSupplierModel

```typescript
/** Create a new alias or update using its current revision. Alias ownership cannot move. */
upsertSupplierModel(credentialId: string, input: SupplierModelInput, options?: RequestOptions): Promise<{
    data: SupplierModel;
}>;
```

### checkSupplierModel

```typescript
/** Bounded upstream catalog probe using the saved credential. Does not generate output. */
checkSupplierModel(credentialId: string, alias: string, options?: RequestOptions): Promise<{
    data: SupplierModelCheck;
}>;
```

### discoverSupplierModels

```typescript
/** Read the bounded upstream inventory; does not create aliases or configure billing. */
discoverSupplierModels(credentialId: string, options?: RequestOptions): Promise<{
    data: SupplierCatalogModel[];
}>;
```

### refreshSupplierCatalog

```typescript
/** Refresh matching metadata only. Concurrent configuration changes return 409; no automatic retry. */
refreshSupplierCatalog(credentialId: string, options?: RequestOptions): Promise<{
    updated: number;
}>;
```

### getVendorCooldown

```typescript
/** Platform-only safe-failure state; reading does not probe or reset the credential. */
getVendorCooldown(vendorId: string, options?: RequestOptions): Promise<{
    data: VendorCooldown;
}>;
```

### getVendorRequestRateLimit

```typescript
getVendorRequestRateLimit(vendorId: string, options?: RequestOptions): Promise<{
    data: VendorRequestRateLimit;
}>;
```

### setVendorRequestRateLimit

```typescript
/** Null removes the rate limit; zero denies dispatch. Credential edits preserve this independent policy. */
setVendorRequestRateLimit(vendorId: string, input: {
    requests_per_minute: number | null;
    expected_revision: string;
}, options?: RequestOptions): Promise<{
    data: VendorRequestRateLimit;
}>;
```

### listVendorRequestRateLimitHistory

```typescript
listVendorRequestRateLimitHistory(vendorId: string, query?: {
    beforeRevision?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: VendorRequestRateLimitRevision[];
}>;
```

### getKeyRequestRateLimit

```typescript
getKeyRequestRateLimit(scope: TenantScope, keyId: string, options?: RequestOptions): Promise<{
    data: KeyRequestRateLimit;
}>;
```

### setKeyRequestRateLimit

```typescript
/** Null removes the rate limit; zero denies dispatch. Secret rotation preserves the policy. */
setKeyRequestRateLimit(scope: TenantScope, keyId: string, input: {
    requests_per_minute: number | null;
    expected_revision: string;
}, options?: RequestOptions): Promise<{
    data: {
        revision: string;
    };
}>;
```

### listKeyRequestRateLimitHistory

```typescript
listKeyRequestRateLimitHistory(scope: TenantScope, keyId: string, query?: {
    beforeRevision?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: KeyRequestRateLimitRevision[];
}>;
```

### getKeyTokenRateLimit

```typescript
getKeyTokenRateLimit(scope: TenantScope, keyId: string, options?: RequestOptions): Promise<{
    data: KeyTokenRateLimit;
}>;
```

### setKeyTokenRateLimit

```typescript
/** Null removes the rate limit; zero denies dispatch. Secret rotation preserves the policy. */
setKeyTokenRateLimit(scope: TenantScope, keyId: string, input: {
    tokens_per_minute: number | null;
    expected_revision: string;
}, options?: RequestOptions): Promise<{
    data: {
        revision: string;
    };
}>;
```

### listKeyTokenRateLimitHistory

```typescript
listKeyTokenRateLimitHistory(scope: TenantScope, keyId: string, query?: {
    beforeRevision?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: KeyTokenRateLimitRevision[];
}>;
```

### getKeyConcurrencyLimit

```typescript
getKeyConcurrencyLimit(scope: TenantScope, keyId: string, options?: RequestOptions): Promise<{
    data: KeyConcurrencyLimit;
}>;
```

### setKeyConcurrencyLimit

```typescript
/** Null removes the concurrency limit; zero denies dispatch. Secret rotation preserves the policy. */
setKeyConcurrencyLimit(scope: TenantScope, keyId: string, input: {
    max_concurrent_requests: number | null;
    expected_revision: string;
}, options?: RequestOptions): Promise<{
    data: {
        revision: string;
    };
}>;
```

### listKeyConcurrencyLimitHistory

```typescript
listKeyConcurrencyLimitHistory(scope: TenantScope, keyId: string, query?: {
    beforeRevision?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: KeyConcurrencyLimitRevision[];
}>;
```

### getModelRoutePool

```typescript
/** Platform-administrator candidate pool; customer permissions remain attached to its alias. */
getModelRoutePool(alias: string, options?: RequestOptions): Promise<{
    data: ModelRoutePool;
}>;
```

### listModelRoutePools

```typescript
/** Platform-only live keyset traversal; retain next_after as the next query's after. */
listModelRoutePools(query?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: ModelRoutePool[];
    has_more: boolean;
    next_after: string | null;
}>;
```

### setModelRoutePool

```typescript
setModelRoutePool(input: ModelRoutePoolInput, options?: RequestOptions): Promise<{
    data: {
        revision: number;
    };
}>;
```

### listModelRoutePoolHistory

```typescript
listModelRoutePoolHistory(alias: string, beforeRevision?: number, options?: RequestOptions): Promise<{
    data: ModelRoutePoolRevision[];
}>;
```

### listKeySpendingLimits

```typescript
listKeySpendingLimits(scope: TenantScope, keyId: string, options?: RequestOptions): Promise<{
    data: KeySpendingAccount[];
}>;
```

### setKeySpendingLimit

```typescript
/** Owner-only customer cap. Rotation shares this limit and its lifetime commitments. */
setKeySpendingLimit(scope: TenantScope, keyId: string, currency: string, input: {
    limit_nanos: string | null;
    expected_revision: string;
}, options?: RequestOptions): Promise<{
    data: {
        revision: string;
    };
}>;
```

### listKeySpendingLimitHistory

```typescript
listKeySpendingLimitHistory(scope: TenantScope, keyId: string, currency: string, query?: {
    beforeRevision?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: KeySpendingLimitRevision[];
}>;
```

### listWorkspaceSpendingLimits

```typescript
/** Currency discovery exposes this workspace's commitments, never company funds. */
listWorkspaceSpendingLimits(scope: TenantScope, options?: RequestOptions): Promise<{
    data: WorkspaceSpendingAccount[];
}>;
```

### getWorkspaceSpendingLimit

```typescript
getWorkspaceSpendingLimit(scope: TenantScope, currency: string, options?: RequestOptions): Promise<{
    data: WorkspaceSpendingLimit | null;
}>;
```

### setWorkspaceSpendingLimit

```typescript
/** Owner-only retail limit; never changes company funds or procurement budgets. */
setWorkspaceSpendingLimit(scope: TenantScope, currency: string, input: {
    limit_nanos: string;
    expected_revision: string;
}, options?: RequestOptions): Promise<{
    data: {
        revision: string;
    };
}>;
```

### listWorkspaceSpendingLimitHistory

```typescript
listWorkspaceSpendingLimitHistory(scope: TenantScope, currency: string, query?: {
    beforeRevision?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: WorkspaceSpendingLimitRevision[];
    next_before_revision: string | null;
}>;
```

### listWorkspaceGuardrailHistory

```typescript
/** Immutable metadata only; excludes policy patterns and internal actor identifiers. */
listWorkspaceGuardrailHistory(scope: TenantScope, beforeRevision?: number, options?: RequestOptions): Promise<{
    data: Array<{
        revision: number;
        policy_name: string;
        active: boolean;
        actor_name: string;
        activated_at: string;
        restored_from_revision: number | null;
    }>;
    next_cursor: number | null;
}>;
```

### getWorkspaceGuardrailRevision

```typescript
getWorkspaceGuardrailRevision(scope: TenantScope, revision: number, options?: RequestOptions): Promise<{
    data: {
        revision: number;
        policy: GuardrailPolicy;
    };
}>;
```

### rollbackWorkspaceGuardrail

```typescript
/** Creates a new active revision from an existing one; stale heads conflict without retries. */
rollbackWorkspaceGuardrail(scope: TenantScope, expectedRevision: number, targetRevision: number, options?: RequestOptions): Promise<{
    revision: number;
    restored_from_revision: number;
}>;
```

### getKeyGuardrail

```typescript
getKeyGuardrail(scope: TenantScope, keyId: string, options?: RequestOptions): Promise<{
    data: {
        assignment_revision: number;
        policy_revision: number | null;
        policy: GuardrailPolicy | null;
    } | null;
}>;
```

### assignKeyGuardrail

```typescript
assignKeyGuardrail(scope: TenantScope, keyId: string, policyRevision: number, expectedAssignmentRevision: number, options?: RequestOptions): Promise<{
    assignment_revision: number;
}>;
```

### listKeyGuardrailHistory

```typescript
listKeyGuardrailHistory(scope: TenantScope, keyId: string, beforeAssignmentRevision?: number, options?: RequestOptions): Promise<{
    data: Array<{
        assignment_revision: number;
        policy_revision: number | null;
        policy_name: string | null;
        actor_name: string;
        created_at: string;
    }>;
    next_cursor: number | null;
}>;
```

### clearKeyGuardrail

```typescript
clearKeyGuardrail(scope: TenantScope, keyId: string, expectedAssignmentRevision: number, options?: RequestOptions): Promise<{
    assignment_revision: number;
}>;
```

### activateWorkspaceGuardrail

```typescript
activateWorkspaceGuardrail(scope: TenantScope, expectedRevision: number, policy: GuardrailPolicy, options?: RequestOptions): Promise<{
    revision: number;
}>;
```

### previewWorkspaceGuardrail

```typescript
previewWorkspaceGuardrail(scope: TenantScope, policy: GuardrailPolicy, model: string, provider: string, options?: RequestOptions): Promise<GuardrailPreview>;
```

### previewGuardrailInput

```typescript
/** Synthetic local test only: no policy activation or inference dispatch. */
previewGuardrailInput(scope: TenantScope, input: GuardrailInputTest, options?: RequestOptions): Promise<GuardrailInputTestResult>;
```

### previewGuardrailOutput

```typescript
/** Synthetic local test only: no policy activation or inference dispatch. */
previewGuardrailOutput(scope: TenantScope, input: GuardrailOutputTest, options?: RequestOptions): Promise<GuardrailOutputTestResult>;
```

### getVideoComposerDraft

```typescript
/** Read the actor's mutable Video composer; unavailable saved keys confer no action grant. */
getVideoComposerDraft(scope: TenantScope, options?: RequestOptions): Promise<VideoComposerDraftState>;
```

### saveVideoComposerDraft

```typescript
/** Revision-checked partial save or null clear, with a 30-day inactivity TTL.
 * Never estimates, inspects, reserves funds or submits inference. */
saveVideoComposerDraft(scope: TenantScope, payload: VideoComposerDraftPayload | null, expectedRevision: number, options?: RequestOptions): Promise<VideoComposerDraftState>;
```

### getChatDraft

```typescript
/** Load the saved workspace draft; browser storage is only a disposable cache. */
getChatDraft(scope: TenantScope, options?: RequestOptions): Promise<ChatDraftState>;
```

### saveChatDraft

```typescript
/** Save or clear at the last read revision; conflicts require explicit reload and reconciliation. */
saveChatDraft(scope: TenantScope, payload: ChatDraftPayload | null, expectedRevision: number, options?: RequestOptions): Promise<ChatDraftState>;
```

### listChatSessions

```typescript
listChatSessions(scope: TenantScope, options?: RequestOptions): Promise<{
    data: ChatSession[];
}>;
```

### listChatSessionPage

```typescript
/** Continuation over the owner's recent sessions; a moved cursor requires restarting. */
listChatSessionPage(scope: TenantScope, query?: ChatSessionPageQuery, options?: RequestOptions): Promise<ChatSessionPage>;
```

### listArchivedChatSessions

```typescript
listArchivedChatSessions(scope: TenantScope, options?: RequestOptions): Promise<{
    data: ChatSession[];
}>;
```

### setChatSessionArchived

```typescript
setChatSessionArchived(scope: TenantScope, sessionId: string, archived: boolean, options?: RequestOptions): Promise<void>;
```

### getChatSession

```typescript
/** Restore one complete owned conversation without walking recent history pages. */
getChatSession(scope: TenantScope, sessionId: string, options?: RequestOptions): Promise<{
    data: ChatSession;
    archived: boolean;
    revision: string;
    guardedWrites: boolean;
}>;
```

### exportChatSession

```typescript
exportChatSession(scope: TenantScope, sessionId: string, options?: RequestOptions): Promise<ChatExport>;
```

### saveChatSession

```typescript
saveChatSession(scope: TenantScope, sessionId: string, session: ChatSession, options?: RequestOptions): Promise<{
    saved: boolean;
}>;
```

### saveChatSessionIfCurrent

```typescript
/** Null creates only; a read revision atomically protects an update from stale clients. */
saveChatSessionIfCurrent(scope: TenantScope, sessionId: string, session: ChatSession, expectedRevision: string | null, options?: RequestOptions): Promise<{
    saved: boolean;
    revision: string;
    guardedWrites: true;
}>;
```

### deleteChatSession

```typescript
deleteChatSession(scope: TenantScope, sessionId: string, options?: RequestOptions): Promise<void>;
```

### getSupplierAssociation

```typescript
getSupplierAssociation(configurationId: string, options?: RequestOptions): Promise<{
    data: {
        id: string;
        name: string;
    } | null;
}>;
```

### associateSupplier

```typescript
associateSupplier(configurationId: string, supplierId: string, expectedRevision: number, options?: RequestOptions): Promise<void>;
```

### createOrdinaryAssetGroup

```typescript
/** Platform-only fixed Ark operation; use getAssetGroupRequest for saved status.
 * Never automatically retry an uncertain upstream creation with a new key.
 */
createOrdinaryAssetGroup(configurationId: string, input: OrdinaryAssetGroupInput, options?: RequestOptions): Promise<{
    data: {
        id: string;
        status: 'dispatching' | 'uncertain' | 'succeeded';
    };
}>;
```

### prepareOrdinaryAssetGroupUpdate

```typescript
/** Encrypt a metadata patch for the saved original group. This never dispatches.
 * Reuse update_id only for the identical patch; omitted fields stay unchanged.
 */
prepareOrdinaryAssetGroupUpdate(configurationId: string, input: OrdinaryAssetGroupUpdateInput, options?: RequestOptions): Promise<{
    data: OrdinaryAssetGroupUpdatePreparation;
}>;
```

### dispatchOrdinaryAssetGroupUpdate

```typescript
/** Explicit one-shot dispatch. Uncertainty must never be retried automatically.
 * Caller cancellation does not cancel claimed work. Both outcomes need read-back.
 */
dispatchOrdinaryAssetGroupUpdate(configurationId: string, updateId: string, scope: TenantScope, options?: RequestOptions): Promise<{
    data: {
        update_id: string;
        status: 'acknowledged' | 'uncertain';
        reconciliation_required: true;
    };
}>;
```

### reconcileOrdinaryAssetGroupUpdate

```typescript
/** Fresh authorized read-back; mismatch and uncertainty preserve the hold. */
reconcileOrdinaryAssetGroupUpdate(configurationId: string, updateId: string, readId: string, scope: TenantScope, options?: RequestOptions): Promise<{
    data: {
        update_id: string;
        status: 'reconciled';
        reconciliation_required: false;
    };
}>;
```

### listOrdinaryAssetGroupUpdates

```typescript
/** Audit only: no retained patch, upstream identities or procurement data. */
listOrdinaryAssetGroupUpdates(configurationId: string, scope: TenantScope, query?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: OrdinaryAssetGroupUpdateAudit[];
    next_cursor: string | null;
}>;
```

### deleteOrdinaryAssetGroupUpdatePatch

```typescript
/** Erasure preserves immutable audit, mutation holds and replay protection. */
deleteOrdinaryAssetGroupUpdatePatch(configurationId: string, updateId: string, scope: TenantScope, options?: RequestOptions): Promise<void>;
```

### readOrdinaryAssetGroup

```typescript
/** Platform-only targeted read. A read identity is one-shot; no automatic retry.
 * Caller cancellation does not cancel already claimed upstream work.
 */
readOrdinaryAssetGroup(configurationId: string, input: OrdinaryAssetGroupReadInput, options?: RequestOptions): Promise<{
    data: {
        read_id: string;
        name: string;
        description: string | null;
        created_at: string;
        updated_at: string;
    };
}>;
```

### listOrdinaryAssetGroupReads

```typescript
/** Audit metadata only. Unresolved does not mean an upstream read is running. */
listOrdinaryAssetGroupReads(configurationId: string, scope: TenantScope, query?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: Array<{
        read_id: string;
        status: 'unresolved' | 'succeeded' | 'failed';
        started_at: string;
        completed_at: string | null;
        duration_ms: number | null;
        reason: string | null;
    }>;
    next_cursor: string | null;
}>;
```

### getOrdinaryAssetGroupRead

```typescript
/** Saved encrypted result only; never sends an upstream read. */
getOrdinaryAssetGroupRead(configurationId: string, readId: string, scope: TenantScope, options?: RequestOptions): Promise<{
    data: {
        read_id: string;
        name: string;
        description: string | null;
        created_at: string;
        updated_at: string;
    };
}>;
```

### deleteOrdinaryAssetGroupRead

```typescript
deleteOrdinaryAssetGroupRead(configurationId: string, readId: string, scope: TenantScope, options?: RequestOptions): Promise<void>;
```

### listOrdinaryAssets

```typescript
/** One-shot page; continuation uses a retained parent identity, never a raw cursor. */
listOrdinaryAssets(configurationId: string, input: OrdinaryAssetListingInput, options?: RequestOptions): Promise<{
    data: OrdinaryAssetListing;
}>;
```

### lookupOrdinaryAsset

```typescript
/** Audit only; unresolved does not imply running or permit an upstream replay. */
/** Platform-only one-shot lookup from a retained page. Never automatically retried. */
lookupOrdinaryAsset(configurationId: string, input: OrdinaryAssetLookupInput, options?: RequestOptions): Promise<{
    data: {
        lookup_id: string;
        status: 'succeeded';
        asset_status: 'Active' | 'Processing' | 'Failed';
    };
}>;
```

### getOrdinaryAssetLookupResult

```typescript
/** Durable operational audit only; missing completion remains unresolved. */
/** Saved content only; never sends another upstream lookup. */
getOrdinaryAssetLookupResult(configurationId: string, scope: TenantScope, lookupId: string, options?: RequestOptions): Promise<{
    data: OrdinaryAssetLookupResult;
}>;
```

### deleteOrdinaryAssetLookupResult

```typescript
/** Erases retained content; immutable operational history remains. */
deleteOrdinaryAssetLookupResult(configurationId: string, scope: TenantScope, lookupId: string, options?: RequestOptions): Promise<void>;
```

### listOrdinaryAssetLookups

```typescript
listOrdinaryAssetLookups(configurationId: string, scope: TenantScope, query?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: OrdinaryAssetLookupAudit[];
    next_cursor: string | null;
}>;
```

### listOrdinaryAssetListings

```typescript
listOrdinaryAssetListings(configurationId: string, scope: TenantScope, query?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: OrdinaryAssetListingAudit[];
    next_cursor: string | null;
}>;
```

### getOrdinaryAssetListing

```typescript
/** Recovers retained encrypted content without an upstream listing call. */
getOrdinaryAssetListing(configurationId: string, listingId: string, scope: TenantScope, options?: RequestOptions): Promise<{
    data: OrdinaryAssetListing;
}>;
```

### deleteOrdinaryAssetListing

```typescript
deleteOrdinaryAssetListing(configurationId: string, listingId: string, scope: TenantScope, options?: RequestOptions): Promise<void>;
```

### prepareOrdinaryAssetGroupDeletionConsent

```typescript
/** Records explicit cascading-deletion consent; never dispatches deletion. */
prepareOrdinaryAssetGroupDeletionConsent(configurationId: string, input: OrdinaryAssetGroupDeletionConsentInput, options?: RequestOptions): Promise<{
    data: {
        consent_id: string;
        prepared: true;
        dispatch_available: false;
    };
}>;
```

### dispatchOrdinaryAssetGroupDeletion

```typescript
/** Irreversible one-shot deletion; never automatically retries uncertain outcomes. */
dispatchOrdinaryAssetGroupDeletion(configurationId: string, scope: TenantScope, consentId: string, options?: RequestOptions): Promise<{
    data: {
        consent_id: string;
        status: 'acknowledged' | 'uncertain';
        reconciliation_required: true;
    };
}>;
```

### getOrdinaryAssetGroupDeletionConsent

```typescript
/** Consent status is descriptive; it never establishes current dispatch rights. */
getOrdinaryAssetGroupDeletionConsent(configurationId: string, scope: TenantScope, consentId: string, options?: RequestOptions): Promise<{
    data: OrdinaryAssetGroupDeletionConsentStatus;
}>;
```

### revokeOrdinaryAssetGroupDeletionConsent

```typescript
/** Idempotent local revocation; it does not erase claims or cancel dispatched work. */
revokeOrdinaryAssetGroupDeletionConsent(configurationId: string, scope: TenantScope, consentId: string, options?: RequestOptions): Promise<void>;
```

### createAssetOperationAuthorization

```typescript
createAssetOperationAuthorization(configurationId: string, input: AssetOperationAuthorizationInput, options?: RequestOptions): Promise<{
    data: {
        id: string;
        operation: 'CreateAssetGroup' | 'GetAssetGroup' | 'ListAssets' | 'GetAsset' | 'UpdateAssetGroup' | 'DeleteAssetGroup' | 'CreateAsset';
        dispatch_available: false;
    };
}>;
```

### listAssetOperationAuthorizations

```typescript
listAssetOperationAuthorizations(configurationId: string, query?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: AssetOperationAuthorization[];
    next_cursor: string | null;
}>;
```

### revokeAssetOperationAuthorization

```typescript
revokeAssetOperationAuthorization(configurationId: string, authorizationId: string, options?: RequestOptions): Promise<void>;
```

### getAssetManagementConfiguration

```typescript
getAssetManagementConfiguration(configurationId: string, options?: RequestOptions): Promise<{
    data: AssetManagementConfiguration | null;
}>;
```

### revokeAssetManagement

```typescript
revokeAssetManagement(configurationId: string, input: {
    expected_revision: number;
    erase_history?: boolean;
    confirm_erase?: boolean;
}, options?: RequestOptions): Promise<{
    data: {
        revision: number;
        configured: false;
        dispatch_available: false;
        erased_revisions: number;
    };
}>;
```

### configureAssetManagement

```typescript
configureAssetManagement(configurationId: string, input: AssetManagementConfigurationInput, options?: RequestOptions): Promise<{
    data: AssetManagementConfiguration;
}>;
```

### assignPersonalCredentialOwner

```typescript
assignPersonalCredentialOwner(configurationId: string, organizationId: string, expectedRevision: number, options?: RequestOptions): Promise<{
    assigned: boolean;
}>;
```

### issueCollectorKey

```typescript
issueCollectorKey(scope: TenantScope, input: {
    name: string;
    ttl_seconds: number;
    purpose?: 'quota';
}, options?: RequestOptions): Promise<{
    id: string;
    token: string;
}>;
```

### listCollectorKeys

```typescript
listCollectorKeys(scope: TenantScope, purpose?: 'quota', options?: RequestOptions): Promise<{
    data: CollectorKeyView[];
}>;
```

### revokeCollectorKey

```typescript
revokeCollectorKey(scope: TenantScope, keyId: string, options?: RequestOptions): Promise<void>;
```

### listGatewayActivity

```typescript
listGatewayActivity(scope: TenantScope, query?: GatewayActivityQuery, options?: RequestOptions): Promise<GatewayActivityPage>;
```

### exportGatewayActivity

```typescript
/** Customer-safe CSV; HTTP 413 rejects oversized ranges without a partial file. */
exportGatewayActivity(scope: TenantScope, query?: GatewayActivityExportQuery, options?: RequestOptions): Promise<string>;
```

### getRequestGuardrailDecision

```typescript
/** Missing historical/denied attribution stays null; this does not claim content inspection. */
getRequestGuardrailDecision(scope: TenantScope, attemptId: string, options?: RequestOptions): Promise<{
    data: RequestGuardrailDecision | null;
}>;
```

### getGuardrailDetectorDescription

```typescript
/** Installation-only disclosure; declarations are not verified processing guarantees. */
getGuardrailDetectorDescription(detector: string, options?: RequestOptions): Promise<GuardrailDetectorDescription>;
```

### previewGuardrailDetector

```typescript
/** Explicit external processing consent; no policy activation or customer billing. */
previewGuardrailDetector(detector: string, input: GuardrailDetectorPreviewInput, options?: RequestOptions): Promise<GuardrailDetectorPreviewResult>;
```

### listWorkspaceDetectors

```typescript
/** Declared processing conditions for deployment-authorized workspace detectors. */
listWorkspaceDetectors(scope: TenantScope, options?: RequestOptions): Promise<{
    data: WorkspaceDetectorDescription[];
}>;
```

### listWorkspaceMediaDetectors

```typescript
/** Declared audio/video processing conditions only; performs no inspection or activation. */
listWorkspaceMediaDetectors(scope: TenantScope, options?: RequestOptions): Promise<{
    data: WorkspaceMediaDetectorDescription[];
}>;
```

### listWorkspaceImageDetectors

```typescript
/** Image disclosure is separate from text consent; policy activation remains unavailable. */
listWorkspaceImageDetectors(scope: TenantScope, options?: RequestOptions): Promise<{
    data: WorkspaceImageDetectorDescription[];
}>;
```

### previewWorkspaceImageDetector

```typescript
/** Explicit image consent for a synthetic test; does not save or activate a policy. */
previewWorkspaceImageDetector(scope: TenantScope, detector: string, input: ImageDetectorPreviewInput, options?: RequestOptions): Promise<ImageDetectorPreviewResult>;
```

### listInputDetectorDecisions

```typescript
/** Metadata-only required input decisions, including pre-admission denials. */
listInputDetectorDecisions(scope: TenantScope, options?: RequestOptions): Promise<{
    data: Array<{
        detector: string;
        configuration_fingerprint: string;
        stage: 'input';
        coverage: 'local_text';
        enforcer_version: 'external-input-v1';
        outcome: 'clear' | 'matched' | 'indeterminate';
        reason: string;
        elapsed_ms: number;
        key_name: string;
        workspace_revision: number | null;
        key_policy_revision: number | null;
        key_assignment_revision: number | null;
        recorded_at: string;
    }>;
    coverage: 'latest_100_input_detector_decisions';
}>;
```

### listGuardrailPreparationDenials

```typescript
/** Latest 100 pre-admission access denials; excludes content and dispatch-time race denials. */
listGuardrailPreparationDenials(scope: TenantScope, options?: RequestOptions): Promise<{
    data: GuardrailPreparationDenial[];
    coverage: 'latest_100_preparation_denials';
}>;
```

### listGuardrailDispatchDenials

```typescript
/** Recorded policy exceptions only; eligibility status denials remain outside coverage. */
listGuardrailDispatchDenials(scope: TenantScope, options?: RequestOptions): Promise<{
    data: Array<{
        stage: 'dispatch' | 'batch_admission';
        outcome: 'blocked';
        coverage: 'model_provider_access' | 'policy_binding';
        reason: 'access_denied' | 'input_binding_missing' | 'policy_changed';
        key_name: string;
        workspace_policy_name: string | null;
        key_policy_name: string | null;
        workspace_revision: number | null;
        key_policy_revision: number | null;
        key_assignment_revision: number | null;
        recorded_at: string;
    }>;
    coverage: 'latest_100_dispatch_policy_exceptions';
}>;
```

### getRequestPayload

```typescript
getRequestPayload(scope: TenantScope, attemptId: string, options?: RequestOptions): Promise<{
    data: RequestPayload | null;
}>;
```

### listAssetGroupRequests

```typescript
/** Local request discovery only; does not query upstream or establish asset readiness. */
listAssetGroupRequests(scope: TenantScope, query?: {
    after?: string;
    limit?: number;
}, options?: RequestOptions): Promise<{
    data: Array<{
        id: string;
        name: string | null;
        status: 'prepared' | 'dispatching' | 'uncertain' | 'succeeded';
        created_at: string;
        request_content_status: 'retained' | 'deleted' | 'expired';
    }>;
    next_cursor: string | null;
}>;
```

### getAssetGroupRequest

```typescript
getAssetGroupRequest(scope: TenantScope, intentId: string, options?: RequestOptions): Promise<{
    data: {
        status: 'prepared' | 'dispatching' | 'uncertain' | 'succeeded';
        created_at: string;
        request_content_status: 'retained' | 'deleted' | 'expired';
        request: {
            name: string;
            description: string | null;
        } | null;
        dispatch?: {
            outcome: 'succeeded' | 'uncertain';
            reason: 'invalid_configuration' | 'destination_rejected' | 'upstream_uncertain' | 'timeout' | null;
            duration_ms: number;
        } | null;
    } | null;
}>;
```

### deleteAssetGroupRequest

```typescript
deleteAssetGroupRequest(scope: TenantScope, intentId: string, options?: RequestOptions): Promise<void>;
```

### deleteRequestPayload

```typescript
deleteRequestPayload(scope: TenantScope, attemptId: string, options?: RequestOptions): Promise<void>;
```

### listAccounts

```typescript
listAccounts(scope: TenantScope, options?: RequestOptions): Promise<{
    data: SupplierAccount[];
}>;
```

### createAccount

```typescript
createAccount(scope: TenantScope, account: SupplierAccountInput, options?: RequestOptions): Promise<{
    id: string;
    health: string;
}>;
```

### quota

```typescript
quota(scope: TenantScope, accountId: string, options?: RequestOptions): Promise<{
    data: QuotaWindow[];
}>;
```

### observeQuota

```typescript
observeQuota(scope: TenantScope, accountId: string, observation: QuotaObservation, options?: RequestOptions): Promise<{
    id: string;
}>;
```

### listWorkspaceAssets

```typescript
/** Lists durable local materials, not qualified Provider assets. */
listWorkspaceAssets(scope: TenantScope, page?: WorkspaceAssetPageOptions, options?: RequestOptions): Promise<WorkspaceAssetPage>;
```

### getWorkspaceAsset

```typescript
getWorkspaceAsset(scope: TenantScope, assetId: string, options?: RequestOptions): Promise<{
    data: WorkspaceAsset;
}>;
```

### uploadWorkspaceAsset

```typescript
/** Upload does not authorize inspection, Provider ingestion or generation. */
uploadWorkspaceAsset(scope: TenantScope, input: {
    name: string;
    contentType: string;
    bytes: Uint8Array;
}, options?: RequestOptions): Promise<{
    data: WorkspaceAsset;
}>;
```

### renameWorkspaceAsset

```typescript
renameWorkspaceAsset(scope: TenantScope, assetId: string, input: {
    name: string;
    expected_revision: string;
}, options?: RequestOptions): Promise<{
    data: WorkspaceAsset;
}>;
```

### deleteWorkspaceAsset

```typescript
deleteWorkspaceAsset(scope: TenantScope, assetId: string, expectedRevision?: string, options?: RequestOptions): Promise<void>;
```

### downloadWorkspaceAsset

```typescript
downloadWorkspaceAsset(scope: TenantScope, assetId: string, options?: RequestOptions): Promise<ArrayBuffer>;
```
