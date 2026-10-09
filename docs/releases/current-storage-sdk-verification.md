# Current storage and packaged SDK checkpoint

Reviewed 2026-10-06. F09 and F10 remain incomplete.

The current storage suite passed all 98 tests against a newly initialized, isolated PostgreSQL database, including migrations through 0106. No tests were ignored or filtered. The database was stopped after the suite; the development database was not replaced or reset. This verifies the covered storage invariants, not container installation, upgrade from an earlier distribution, backup recovery or the complete gateway protocol matrix.

The JavaScript SDK source suite passed 108 tests. The added detector contract test verifies workspace-scoped, bodyless disclosure and decision reads, cancellation propagation, exact unknown-cost and indeterminate metadata, and rejection of malformed organization/workspace identifiers before network delivery. The README now documents required external input checks and distinguishes them from unsupported external output and streaming inspection.

The current npm archive contains 32 files and has SHA-256 `55354e34809236f4216c69eed31e6ac1a843241ccd2913c3c6c84c9f0964a16a`. Its extracted distribution and examples passed the same 108 tests in an isolated layout. Test sources and the public execution-recorder contract fixture were supplied separately as test inputs; they are not claimed as package contents. The first extracted run failed because that fixture was absent from the test layout; the corrected layout passed without changing the SDK implementation. Package files passed a scan for local source paths, OpenRouter key prefixes, private-key headers and private development-state paths. This scan is a bounded check, not a comprehensive secret or license audit.

No model calls, detector calls, payment requests or production publishing occurred. The development dashboard still returned HTTP 200 on port 2566. This checkpoint does not qualify browser interactions, real remote detector behavior, an installed server package or the complete release.
