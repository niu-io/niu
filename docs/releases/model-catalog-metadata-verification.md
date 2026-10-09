# Model catalog metadata checkpoint — October 7, 2026

The configured 25-model demo catalog was missing descriptive metadata. OpenRouter's live Models list was inspected as the reference: readable titles, descriptions and context limits support model comparison.

The existing authenticated provider catalog-refresh endpoint updated metadata for all 25 routes. Before/after reads confirmed aliases, upstream model bindings, enabled/public flags, customer pricing and non-catalog capabilities were unchanged. No new models, supplier offers, retail tariffs or inference requests were created. Metadata refresh advances model revisions; these revisions remain part of dispatch validation.

The running catalog now shows provider-supplied names, descriptions and context limits. A model detail page shows context length, maximum output and input/output modalities. Desktop screenshots and the actual catalog embedded at 390×640 were inspected; titles, descriptions and Chat actions fit the available width. Temporary review files were removed.

The seed workflow now populates descriptive metadata for new routes and missing catalog metadata on existing routes using expected revisions. Its mapper excludes advertised prices and unrelated provider fields; ten seed tests passed. The backfill regression covers an existing Supplier offer and disabled/private route: custom capabilities and enabled/public flags remain unchanged, the write uses the saved route revision, and no duplicate offer is created. Existing metadata is preserved by the seed workflow.

Customer retail pricing still needs an explicit authorized tariff source and must never fall back to provider-advertised prices or supplier expenses. Populated media pricing, all-model detail qualification and whole-product UX completion are not established by this checkpoint.

## Display-name sorting follow-up

Name: A–Z now compares the displayed catalog name with natural numeric ordering and uses the alias as a deterministic tie-breaker. A regression covers aliases whose order differs from their visible names and restoration of default order. Ten model-table tests and dashboard type checking passed. Browser qualification of this sorting change is pending: the development runtime stopped, and restart failed because applied migration 133 has a checksum different from the current migration file. The review did not rewrite migration history or alter the database checksum.

The runtime blocker was repaired without changing database migration records: exact applied 0133 bytes were recovered by matching its SHA-384 checksum, and the appended dispatch requirement moved to new migration 0134. The development runtime restarted successfully and the PostgreSQL output-snapshot regression passed. Sorting and open-menu alignment were then verified in the running dashboard at desktop and in a 390×640 embedded viewport; selecting Name: A–Z reordered visible names correctly. Temporary review files were removed.

## Model detail navigation and description source review

The live model detail breadcrumb returned to the catalog with the prior search text and matching result preserved. OpenRouter's actual model detail page was inspected as the reference. Niu's saved description for the inspected model ends in an ellipsis: both OpenRouter's public model-list API and model-endpoint API currently return the same 193-character truncated description, whereas the reference webpage renders a longer introduction. Niu is preserving the API description rather than truncating it locally. A supported richer metadata source remains an open improvement; this review did not fabricate missing prose or scrape private browser state.
