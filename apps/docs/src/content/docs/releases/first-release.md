---
title: Release qualification
description: The scope and evidence required for Niu's first complete release.
---

Niu is available for development and evaluation. **The first complete release
remains under qualification.** A published version, successful build or closed
implementation issue does not establish that every workflow is ready for
production.

The maintained [engineering release checklist](https://github.com/niu-io/niu/blob/main/docs/releases/first-release.md)
records the detailed requirements and bounded evidence. This page explains how
to interpret that checklist; it does not certify a particular hosted deployment.

## What release qualification covers

| Area | Required evidence |
| --- | --- |
| Setup and access | A clean installation, usable Provider configuration, independent credentials, workspace keys and backend-enforced isolation. |
| Model delivery | Actual supported model requests, streaming, cancellation and diagnosable upstream failures. Model discovery alone is insufficient. |
| Customer accounting | The request's pinned selling price, reservations, exact charges, refunds and reconciliation, with unknown liabilities retained. |
| Commercial operations | Customer funds, noncash credits, Provider earnings and settlements remain distinct. Purchase prices and platform margins stay confidential. |
| Multimodal workflows | Saved Chat and Video state, asynchronous job recovery, material management, authorized result retrieval and the applicable billing lifecycle. |
| Operations | Current-input recovery, upgrade and workload evidence for the exact artifact being evaluated, plus desktop and narrow-screen workflow review. |

## Integration capability and activation

Supporting a payment adapter or model API does not require activating every
external service. Qualification of the integration concerns its authorization,
persistence, protocol handling and safe failures. Merchant activation, receipt
of funds, commercial Provider agreements and verified discounts require their
own evidence; unavailable configuration must remain explicit.

Personal upstream credentials used for evaluation do not establish commercial
supply. Unknown usage or costs must remain unknown, rather than being displayed
as zero or free. Customers see their selling prices and charges, not Provider
purchase costs or the operator's margins.

## Interpreting verification records

An acceptance record should identify the source or deployed artifact, the
actual current-input workflow, and independently inspected final artifacts.
Its conclusions apply only to the exercised scope. Fixture outcomes provide no
acceptance signal. Compilation and build checks are separate from runtime
behavior, financial settlement and performance qualification.

For your own evaluation, start with the [deployment guide](/docs/deployment/single-container/),
make a [model request](/docs/guides/api-quickstart/), and follow its
[request evidence](/docs/concepts/execution-observation/) and
[customer charge](/docs/concepts/performance-and-cost/).
