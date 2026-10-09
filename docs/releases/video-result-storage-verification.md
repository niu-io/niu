# Saved video results checkpoint

Successful query recovery now saves encrypted video and optional last-frame URL references, including the background recovery path. AES-GCM associated data binds each reference to its organization, workspace, job and result kind, with a separate domain from Supplier credentials. Signed URLs remain absent from customer status, billing and timing responses.

Migration 0135 adds private references with a fixed 24-hour expiry from first capture. URL refreshes preserve that expiry. Reads deny expired or conflicting-terminal jobs. Periodic maintenance clears expired ciphertext. Local deletion clears ciphertext and retains content-free markers for both result kinds, including deletion before completion; subsequent recovery cannot resurrect the URLs. Status and financial records are preserved. Deployment backups have a separate retention policy.

The public result API returns a bounded attachment body rather than a URL or redirect. Current key expiry/revocation, workspace/model grants, job state and compatible Guardrails are checked before and after network retrieval. Changed/deleted/expired references abort delivery. Unsupported mandatory inspection denies access. Four network retrievals per process, a 60-second deadline, 64 MiB video and 10 MiB frame limits bound the transport. File type checks and safe delivery headers complement the prior transport checkpoint; they do not establish content inspection or live-channel qualification.

The public deletion API requires current workspace/model access, remains available when newly mandatory inspection blocks delivery, and cannot delete Supplier-held media or downloaded copies. The JavaScript SDK exposes result retrieval as a Response so callers can stream/cancel it, plus deletion; neither operation automatically retries.

Fresh evidence:

- 10 PostgreSQL media job tests passed, including scope denial, immutable expiry, ciphertext cleanup, permanent deletion, deletion before completion and terminal-conflict denial.
- Five gateway Video scenarios passed, preserving personal/prepaid/dashboard admission and settlement. Expanded checks prove unsafe-result errors exclude URLs, foreign/ungranted access and deletion are denied, authorized deletion prevents restoration, and recovery persists encrypted references across store reconstruction.
- Two cipher tests passed, including tenant/job/kind separation, credential-domain separation, tampering and plaintext exclusion.
- 139 JavaScript SDK tests passed, including binary body handling, cancellation, deletion, validation and one-request error behavior.
- Gateway/storage Clippy passed with warnings denied. Published migration history remains unchanged; OpenAPI has 108 paths, 87 unique operations and 159 resolved local references. Public-boundary checks passed.

V07/V15/V16 remain open. Dashboard preview/download, dashboard session result endpoints, optional-frame controls, positive live TLS/CDN retrieval, required media inspection and packaged lifecycle qualification still need acceptance evidence. No live generation or overall release gate is claimed by these local checks.

Subsequent scoped dashboard access, availability metadata, preview/download and append-only migration 0136 hardening are covered by the [result dashboard checkpoint](video-result-dashboard-verification.md). The pending-dashboard statement above records this checkpoint’s earlier scope; live qualification remains open.
