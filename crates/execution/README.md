# Niu execution contracts

This crate defines the shared public vocabulary for model-provider and agent-task resources. Capability support is explicit, and limited behavior requires opt-in. Its attempt record keeps upstream execution certainty, response delivery progress, usage confidence, and financial settlement separate.

The retry predicate is a set of gates, not a retry policy: request replayability, execution semantics, current permission, deadline, attempt budget, reserved cost exposure, and uncommitted response headers must all allow another attempt. A caller must still apply the product's single retry authority.

These types are an initial Niu-owned contract. The gateway does not yet persist them or enforce them across all adapters; PostgreSQL-backed attempt history, budget reservation, and recovery remain future work.
