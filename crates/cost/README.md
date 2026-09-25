# Cost calculation crate

This crate provides the selected pricing calculation module used to estimate provider cost from normalized usage and a pricing plan.

The API separates plan validation (`compile`) from repeated calculation (`PricingPlan::calculate`). A plan can describe standard and service-tier rates, cache read/write usage, prompt-size thresholds, an optional region multiplier, and a UTC off-peak window.

Rates are floating-point inputs and returned costs. Callers must validate external values, define currency precision and rounding, and convert results to integer currency units before using them in a durable budget or ledger. This crate does not reserve funds, enforce budgets, identify tenants, or contact a provider.

The implementation is selectively reused from LiteLLM under the MIT License. See the root [third-party notices](../../THIRD-PARTY-NOTICES.md) for the exact source commit and checksum.
