# Durable Chat backend acceptance

This records the actual backend checkpoint for S09-2 on digest-pinned native runtime `1212ea3b68f934c22fff6c62696475d2f628fc6a`. An isolated copy of a stopped PostgreSQL database retained real prior inference and conversation artifacts. No new model generation, browser storage substitution, fabricated conversation response or financial receipt was used.

## Exercised workflow

An ordinary workspace owner saved 101 conversations containing retained actual response content. The oldest conversation fell outside the legacy latest-100 list; direct detail still returned its complete body with a real customer request CSV attachment, settings and correct customer charge hydration. The response included `Cache-Control: no-store`. A two-turn conversation from a prior genuine follow-up generation was also saved through the current HTTP interface. Its actual content remained complete; charge references from a different workspace remained unknown and were not copied as authoritative destination charges.

The owner read that two-turn conversation, saved a draft referencing it, and retained the pending prompt, selected model, actual report attachment and settings (`systemPrompt`, `maxTokens`, `temperature`, `logPayloads`). Draft creation with expected revision zero returned revision one. Reusing the stale expected revision returned 409. Restart preserved the exact draft response. Clearing the draft saved a null payload with revision two; another restart retained the cleared state rather than restoring stale browser data.

Archive and rename preserved the complete saved content. Restart retained the archive state and detail. An exclusive Chat table lock produced a safe 503 in approximately 254 ms; after release the complete detail remained unchanged. Deleting the owner's conversation returned 204; after restart its direct detail was 404. Another owner's saved row with the same session identifier remained, and was never substituted for the deleted owner's conversation.

## Authorization and independent artifacts

| Check | Observed result |
| --- | --- |
| Different owner reads personal conversation | 404. |
| Same actor requests foreign workspace detail | 403. |
| Inference API key reads management detail | 401. |
| Different owner reads draft | Own empty draft, not another owner's payload. |
| Viewer writes draft | 403. |
| Deleted conversation after restart | 404 while unrelated same-identifier content remains. |
| Revoked temporary operator reads saved conversation | 401. |

The actual built JavaScript SDK at `81f6a1e1c8890400d9a58bbda6e1dbbc90e70926` executed `getChatSession` against this Gateway; its parsed response equaled the direct HTTP detail. This is an executed SDK check, not merely a static method mapping. It does not establish frontend adoption or rendered conflict/reload behavior.

Independent verification reopened both the original source database and the final stopped copy. It reconstructed saved payloads, real report attachment bytes and native customer charge hydration, checked the imported two-turn content and absence of foreign charge fallback, confirmed scoped deletion, checked the cleared native draft's null payload and revision two, and confirmed temporary operators were revoked. Complete attempt and financial-table fingerprints remained unchanged. Existing source rows were compared over their original fields because migration added Chat revision/guard columns; no source-row replacement was inferred from the new columns.

## Completion boundary

This checkpoint covers the backend saved-session/history/detail/draft/settings/attachment/archive/deletion workflow described above. The prior [real two-turn generation record](../releases/chat-export-verification.md), [guarded-write contract](chat-session-write-guards.md), [history paging](chat-history-pagination.md) and [complete detail](chat-session-detail.md) retain their individual evidence. A caller supplies prior turns when requesting a model follow-up; saved Chat does not imply automatic inference context assembly.

S09-3's frontend SDK adoption, rendered conflict/reload handling and browser interactions remain delegated and unverified here. Unsupported conversation branch layouts, unexercised attachment formats and new media input ingestion must not be inferred from this text/report checkpoint. Fixture results provide no acceptance evidence.
