# Shared upstream transport

Niu's gateway and media clients share this bounded connection pool. Public destinations are resolved and checked before building a DNS-pinned client; refreshes use the same policy. Private and reserved destinations are rejected, with loopback HTTP allowed for explicit local development. Redirects and environment proxy routing are disabled. The pool bounds cached authorities and reuses connections across paths without persisting request credentials.

This module was moved from Niu's gateway without changing its destination policy. It does not authorize a customer, qualify a Supplier, bound response bodies or decide whether a request is safe to retry. Callers must enforce those contracts. Unit tests cover destination classification, private-literal rejection and connection reuse.
