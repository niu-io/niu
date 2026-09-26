# Upstream vendor management

The platform vendor registry owns shared upstream connections used by the installation. OpenRouter is a vendor; OpenAI, Anthropic, Google and other names in its catalog identify model makers. A model maker does not imply a direct credentialed connection from Niu.

Vendors and model mappings persist in PostgreSQL. The registry records the adapter, validated upstream API endpoint, enabled state and revision. Each model alias maps to one vendor and one upstream model ID, with explicit capabilities and public-catalog visibility. New requests resolve the current database records; disabling a vendor or model removes its availability for subsequent requests without an image rebuild. Already dispatched work may finish with its original configuration.

Only installation administrators manage shared vendors. Organization and project operators cannot view vendor credentials or alter upstream connections shared by other tenants. Project API-key grants continue to control which model aliases each caller may use. Project subscription accounts remain separate resources: they have tenant-specific plan, quota and concurrency semantics and do not automatically become platform-wide vendors.

Credentials are encrypted with AES-256-GCM before database storage. A random nonce and vendor ID authenticated as associated data bind each ciphertext to its vendor. The master secret comes from `NIU_VENDOR_ENCRYPTION_KEY` in the deployment's private secret store; it is never stored in PostgreSQL or returned by management APIs. Credential rotation replaces the encrypted value and increments the vendor revision. Updating a vendor requires its expected revision to prevent silently overwriting another administrator's change. Metadata responses disclose only whether a credential exists.

Static file routes remain supported for standalone installations. Database-backed routes take precedence for matching aliases, including disabled records, so disabling a database route cannot accidentally reactivate a static fallback. Deployment bootstrap imports the initial vendor and model selection once. Restarts must not reset administrator edits or reactivate disabled vendors. Secrets, customer identifiers and deployment account information do not belong in bootstrap source files.

The managed registry supports OpenRouter and OpenAI adapters using the OpenAI-compatible chat API. Optional tool, structured-output, embedding and Responses capabilities must be declared and qualified separately. Discovery from an upstream catalog is evidence of availability, not authorization to enable every endpoint or publish every model.

Back up the master encryption secret separately from PostgreSQL. Rotating an upstream API key is supported; master-key rotation with re-encryption is not implemented. Startup rejects a missing master key when vendors exist and rejects an incompatible key when validating persisted model credentials.
